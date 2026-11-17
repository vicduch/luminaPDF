// Edge headless avec un pointeur « souris » déclaré (hover: hover, pointer: fine), pour observer les états de survol réels.
// Le lanceur de reader-cdp.mjs laisse Edge sans périphérique de pointage : `@media (hover: hover)` y est faux et aucun style
// de survol ne s'applique. Même interface que launch() ({ send, onEvent, close }) : openReader() l'accepte tel quel.
// Boîte noire : seul le profil matériel déclaré change (réglages Blink), jamais l'application.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { pause } from '../reader-cdp.mjs';

export async function launchWithMouse() {
  const profile = await mkdtemp(join(tmpdir(), 'lumina-hover-test-'));
  const child = spawn('/usr/bin/microsoft-edge', [
    '--headless=new', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-extensions',
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
    '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4',
    `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let socket, sequence = 0;
  const pending = new Map(), listeners = new Set();
  const close = async () => {
    for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(new Error('Owned browser closed')); }
    pending.clear();
    socket?.close();
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await Promise.race([exited, pause(2_000)]);
      if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await Promise.race([exited, pause(2_000)]); }
    }
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  };
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let stderr = '';
      const timer = setTimeout(() => reject(new Error(`Edge startup timeout: ${stderr}`)), 15_000);
      child.on('error', reject);
      child.on('exit', code => reject(new Error(`Edge exited (${code}): ${stderr.slice(-1000)}`)));
      child.stderr.on('data', data => {
        stderr = (stderr + data).slice(-8000);
        const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(endpoint).hostname)) throw new Error('Refusing non-loopback CDP endpoint');
    socket = new WebSocket(endpoint);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP WebSocket open timeout')), 8_000);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP WebSocket error')); }, { once: true });
    });
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.method) { for (const listener of listeners) listener(message); return; }
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result);
    });
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 8_000);
      pending.set(id, { resolve, reject, timer });
      try { socket.send(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) })); }
      catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
    });
    return { send, close, onEvent(listener) { listeners.add(listener); return () => listeners.delete(listener); } };
  } catch (error) {
    await close();
    throw error;
  }
}

// openReader() active l'émulation tactile, qui retire définitivement hover/pointer fin du document courant (même désactivée).
// On la désactive puis on recharge l'application et on redépose la fixture : le document repart avec le pointeur déclaré.
export async function reloadWithMouse(r, fixture) {
  const origin = await r.evaluate(() => performance.timeOrigin);
  await r.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await r.send('Page.navigate', { url: new URL(process.env.READER_TEST_URL || 'http://127.0.0.1:3016').href });
  const ready = async probe => {
    for (const end = Date.now() + 25_000; Date.now() < end; await pause(100)) { try { if (await r.evaluate(probe, origin)) return; } catch { /* navigation en cours */ } }
    throw new Error('reloadWithMouse: application non rechargée');
  };
  await ready(origin => performance.timeOrigin !== origin && Boolean(document.querySelector('input[type="file"]')));
  const { root } = await r.send('DOM.getDocument');
  const { nodeId } = await r.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type="file"]' });
  await r.send('DOM.setFileInputFiles', { nodeId, files: [fixture] });
  await ready(() => Boolean(document.querySelector('#pdf-workspace [data-page-number]')));
}
