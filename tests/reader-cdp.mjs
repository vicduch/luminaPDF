import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

export const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const TIMEOUT = 8_000;

export async function eventually(probe, description, timeout = TIMEOUT) {
  const deadline = Date.now() + timeout;
  do {
    const result = await probe();
    if (result) return result;
    await pause(80);
  } while (Date.now() < deadline);
  throw new Error(`Timed out: ${description}`);
}

export async function launch() {
  const profile = await mkdtemp(join(tmpdir(), 'lumina-reader-test-'));
  const child = spawn('/usr/bin/microsoft-edge', [
    '--headless=new', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-extensions',
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let socket;
  let sequence = 0;
  const pending = new Map();
  const listeners = new Set();
  const close = async () => {
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(new Error('Owned browser closed'));
    }
    pending.clear();
    socket?.close();
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await Promise.race([exited, pause(2_000)]);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await Promise.race([exited, pause(2_000)]);
      }
    }
    await rm(profile, { recursive: true, force: true });
  };
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let stderr = '';
      const finish = (error, url) => {
        clearTimeout(timer);
        child.stderr.off('data', onData);
        child.off('error', onError);
        child.off('exit', onExit);
        error ? reject(error) : resolve(url);
      };
      const onError = error => finish(error);
      const onExit = code => finish(new Error(`Edge exited (${code}): ${stderr.slice(-2000)}`));
      const onData = data => {
        stderr = (stderr + data).slice(-8000);
        const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) finish(null, match[1]);
      };
      const timer = setTimeout(() => finish(new Error(`Edge startup timeout: ${stderr}`)), 15_000);
      child.on('error', onError);
      child.on('exit', onExit);
      child.stderr.on('data', onData);
    });
    const address = new URL(endpoint);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(address.hostname)) {
      throw new Error('Refusing non-loopback CDP endpoint');
    }
    socket = new WebSocket(endpoint);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP WebSocket open timeout')), TIMEOUT);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP WebSocket error')); }, { once: true });
    });
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.method) {
        for (const listener of listeners) listener(message);
        return;
      }
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result);
    });
    socket.addEventListener('close', () => {
      for (const { reject, timer } of pending.values()) {
        clearTimeout(timer);
        reject(new Error('CDP connection closed'));
      }
      pending.clear();
    });
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, TIMEOUT);
      pending.set(id, { resolve, reject, timer });
      try { socket.send(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) })); }
      catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
    });
    return { send, close, onEvent(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    } };
  } catch (error) {
    await close();
    throw error;
  }
}

export async function openReader(browser, width, height, fixture) {
  const url = new URL(process.env.READER_TEST_URL || 'http://127.0.0.1:3016');
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error('READER_TEST_URL must be HTTP loopback');
  }
  const { browserContextId } = await browser.send('Target.createBrowserContext', { disposeOnDetach: true });
  try {
    return await prepareReader(browser, width, height, fixture, url, browserContextId);
  } catch (error) {
    try {
      await browser.send('Target.disposeBrowserContext', { browserContextId });
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Reader setup and isolated-context cleanup failed');
    }
    throw error;
  }
}

async function prepareReader(browser, width, height, fixture, url, browserContextId) {
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params) => browser.send(method, params, sessionId);
  const evaluate = async (fn, ...args) => {
    const result = await send('Runtime.evaluate', {
      expression: `(${fn.toString()})(...${JSON.stringify(args)})`,
      returnByValue: true, awaitPromise: true, timeout: 7_000,
    });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  // Resolve names through Edge's accessibility tree, not through visible labels alone.
  const hasControl = async (role, name) => {
    const { nodes } = await send('Accessibility.getFullAXTree');
    return nodes.some(n => !n.ignored && n.role?.value === role && n.name?.value === name);
  };
  const control = async (role, name, fn = null, args = []) => {
    const { nodes } = await send('Accessibility.getFullAXTree');
    const matches = nodes.filter(n => !n.ignored && n.role?.value === role && n.name?.value === name);
    if (matches.length !== 1) throw new Error(`Expected one accessible ${role} '${name}', found ${matches.length}`);
    const { object } = await send('DOM.resolveNode', { backendNodeId: matches[0].backendDOMNodeId });
    try {
      const result = await send('Runtime.callFunctionOn', {
        objectId: object.objectId,
        functionDeclaration: (fn || function () {
          const r = this.getBoundingClientRect();
          if (this.disabled || r.width <= 0 || r.height <= 0 || r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight) {
            throw new Error('Control is not directly clickable in viewport');
          }
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }).toString(),
        arguments: args.map(value => ({ value })), returnByValue: true,
      });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      if (!fn) {
        const p = result.result.value;
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 });
      }
      return result.result.value;
    } finally { await send('Runtime.releaseObject', { objectId: object.objectId }); }
  };
  const key = async (key, code, windowsVirtualKeyCode) => {
    // Chromium exige le caractère pour l’activation native par Enter ; Espace reste complet aussi.
    const text = key === 'Enter' ? '\r' : key === ' ' ? ' ' : undefined;
    await send('Input.dispatchKeyEvent', {
      type: 'keyDown', key, code, windowsVirtualKeyCode,
      ...(text === undefined ? {} : { text, unmodifiedText: text }),
    });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode });
  };
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const errors = [];
  const stopErrors = browser.onEvent(event => {
    if (event.sessionId !== sessionId) return;
    const p = event.params;
    let text;
    if (event.method === 'Runtime.exceptionThrown') text = p.exceptionDetails.exception?.description || p.exceptionDetails.text;
    if (event.method === 'Log.entryAdded' && p.entry.level === 'error') text = p.entry.text;
    if (event.method === 'Network.loadingFailed') text = `${p.type}: ${p.errorText} (canceled=${Boolean(p.canceled)})`;
    if (text) {
      errors.push(`${event.method}: ${String(text).slice(0, 400)}`);
      if (errors.length > 8) errors.shift();
    }
  });
  try {
    // These UI/gesture proofs deliberately exclude the PWA service-worker/cache path.
    await send('Network.enable');
    await send('Network.setBypassServiceWorker', { bypass: true });
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Page.navigate', { url: url.href });
    try {
      await eventually(() => evaluate(() => Boolean(document.querySelector('input[type="file"]'))), 'PDF upload input', 15_000);
    } catch (error) {
      let page;
      try {
        page = await evaluate(origin => {
          const address = new URL(location.href);
          const publicPage = address.origin === origin;
          address.search = address.hash = address.username = address.password = '';
          return {
            url: address.href.slice(0, 300),
            title: publicPage ? document.title.slice(0, 120) : '[outside test origin]',
            text: publicPage ? (document.body?.innerText || '').slice(0, 500) : '[not inspected]',
          };
        }, url.origin);
      } catch (diagnosticError) {
        page = { diagnosticUnavailable: diagnosticError.message.slice(0, 300) };
      }
      throw new Error(`${error.message}\nUpload diagnostic: ${JSON.stringify({ page, errors })}`, { cause: error });
    }
  } finally {
    stopErrors();
  }
  const { root } = await send('DOM.getDocument');
  const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type="file"]' });
  await send('DOM.setFileInputFiles', { nodeId, files: [fixture] });
  await eventually(() => evaluate(() => Boolean(document.querySelector('#pdf-workspace [data-page-number]'))), 'loaded fixture page', 25_000);
  return {
    send, evaluate, control, hasControl, key,
    close: () => browser.send('Target.disposeBrowserContext', { browserContextId }),
    resize: (width, height) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }),
  };
}
