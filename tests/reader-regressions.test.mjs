import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { launch, openReader, eventually, pause } from './reader-cdp.mjs';

const pdf = name => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const ordinary = pdf('reader-5-pages.pdf');
const mixed = pdf('reader-mixed-pages.pdf');
const PAGED = 'Lecture page par page', CONTINUOUS = 'Lecture continue';
const PAGE = 'Aller à la page', TOOLS = 'Outils de lecture', FIT = 'Ajuster la page';
const counter = async r => Number(await r.control('spinbutton', PAGE, function () { return this.value; }));

// This oracle never uses the page counter to choose the geometrically central page.
const geometry = r => r.evaluate(() => {
  const w = document.querySelector('#pdf-workspace').getBoundingClientRect();
  const view = { left: Math.max(0, w.left), right: Math.min(innerWidth, w.right), top: Math.max(0, w.top), bottom: Math.min(innerHeight, w.bottom) };
  const cy = (view.top + view.bottom) / 2;
  const pages = [...document.querySelectorAll('[data-page-number]')].flatMap(e => {
    const p = e.getBoundingClientRect(), style = getComputedStyle(e);
    if (p.width <= 0 || p.height <= 0 || style.visibility === 'hidden' || style.display === 'none') return [];
    return [{ n: Number(e.dataset.pageNumber), left: p.left, right: p.right, top: p.top, bottom: p.bottom, width: p.width, height: p.height }];
  });
  const central = pages.find(p => p.left < view.right && p.right > view.left && p.top <= cy && p.bottom >= cy);
  return { view, pages, central: central?.n ?? null };
});
const pageIn = (s, n) => s.pages.find(p => p.n === n);

async function settled(r, predicate, targetNumber) {
  let previous, since = 0;
  return eventually(async () => {
    const s = await geometry(r), p = pageIn(s, targetNumber ?? s.central);
    if (!p || !predicate(s)) { previous = null; return false; }
    const same = previous?.n === p.n && ['left', 'top', 'width', 'height'].every(k => Math.abs(previous[k] - p[k]) <= 0.5);
    if (!same) since = Date.now();
    previous = p;
    return same && Date.now() - since >= 240 ? s : false;
  }, 'stable, unambiguous visible page geometry');
}
async function at(r, n) {
  const s = await settled(r, s => {
    const p = pageIn(s, n), v = s.view;
    return p && Math.min(p.right, v.right) - Math.max(p.left, v.left) > 50
      && Math.min(p.bottom, v.bottom) - Math.max(p.top, v.top) > 50;
  }, n);
  await eventually(async () => await counter(r) === n, `counter agrees with visible page ${n}`);
  return s;
}
function samePosition(before, after, message) {
  assert.ok(before && after && ['left', 'top', 'width', 'height'].every(k => Math.abs(before[k] - after[k]) <= 2), message);
}
async function mode(r, name) {
  await r.control('button', name);
  await eventually(() => r.control('button', name, function () { return this.getAttribute('aria-pressed') === 'true'; }), `${name} active`);
}
async function go(r, n) {
  await r.control('spinbutton', PAGE, function (n) {
    this.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(this, String(n));
    this.dispatchEvent(new Event('input', { bubbles: true }));
    this.dispatchEvent(new Event('change', { bubbles: true }));
  }, [n]);
  await r.key('Enter', 'Enter', 13);
  return at(r, n);
}
async function fit(r, n) {
  const inPanel = !await r.hasControl('button', FIT);
  if (inPanel) await r.control('button', TOOLS);
  await r.control('button', FIT);
  if (inPanel) await r.key('Escape', 'Escape', 27);
  return at(r, n);
}
function entirelyVisible(s, n) {
  const p = pageIn(s, n), v = s.view;
  assert.ok(p && p.left >= v.left - 2 && p.right <= v.right + 2 && p.top >= v.top - 2 && p.bottom <= v.bottom + 2,
    `entire page ${n} fits the actual reader viewport: ${JSON.stringify({ p, v })}`);
}
const surface = s => {
  const p = pageIn(s, s.central), v = s.view;
  const left = Math.max(p.left, v.left), right = Math.min(p.right, v.right);
  const top = Math.max(p.top, v.top), bottom = Math.min(p.bottom, v.bottom);
  assert.ok(right - left > 100 && bottom - top > 100, 'visible PDF surface for trusted input');
  return { x: left + (right - left) * 0.72, y: top + (bottom - top) * 0.55, distance: (right - left) * 0.44 };
};
async function swipeNext(r, s) {
  const p = surface(s);
  const contact = x => [{ id: 1, x, y: p.y, radiusX: 3, radiusY: 3, force: 1 }];
  await r.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: contact(p.x) });
  for (let i = 1; i <= 8; i++) {
    await r.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: contact(p.x - p.distance * i / 8) });
    await pause(25);
  }
  await r.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function toolsOpen(r) {
  await eventually(() => r.control('button', TOOLS, function () {
    const e = document.getElementById('reader-tools');
    return this.getAttribute('aria-expanded') === 'true' && e && !e.hidden
      && e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== 'hidden';
  }), 'tools actually opened by button activation');
}
async function escapeTools(r) {
  await r.key('Escape', 'Escape', 27);
  await eventually(() => r.control('button', TOOLS, function () {
    const e = document.getElementById('reader-tools');
    const closed = !e || e.hidden || getComputedStyle(e).display === 'none' || getComputedStyle(e).visibility === 'hidden';
    return closed && this.getAttribute('aria-expanded') === 'false' && document.activeElement === this;
  }), 'Escape closes tools and restores button focus');
}

// Mesure générique : aucun sélecteur de panneau ni état interne n’est utilisé.
function exposedElement(selector = null) {
  const e = selector ? document.querySelector(selector) : document.activeElement;
  if (!selector && (!document.hasFocus() || e === document.body || e === document.documentElement)) {
    return { visible: true, context: 'chrome/body' };
  }
  if (!e) return { visible: false, reason: 'absent' };
  const r = e.getBoundingClientRect();
  const rect = { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
  const clip = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
  const result = { rect, clip, tag: e.tagName, name: e.getAttribute('aria-label') || e.getAttribute('placeholder') || '' };
  if (selector && 'value' in e) result.value = e.value;
  for (let a = e; a; a = a.parentElement) {
    const s = getComputedStyle(a);
    if (a.hidden || a.inert || s.display === 'none' || s.visibility === 'hidden' || s.visibility === 'collapse'
      || Number(s.opacity) === 0 || s.contentVisibility === 'hidden') {
      return { ...result, visible: false, reason: `hidden by ${a.tagName}` };
    }
    if (a === e) continue;
    const p = a.getBoundingClientRect();
    if (['auto', 'scroll', 'hidden', 'clip'].includes(s.overflowX)) {
      clip.left = Math.max(clip.left, p.left); clip.right = Math.min(clip.right, p.right);
    }
    if (['auto', 'scroll', 'hidden', 'clip'].includes(s.overflowY)) {
      clip.top = Math.max(clip.top, p.top); clip.bottom = Math.min(clip.bottom, p.bottom);
    }
  }
  const visible = r.width > 0 && r.height > 0 && Math.min(r.right, clip.right) > Math.max(r.left, clip.left)
    && Math.min(r.bottom, clip.bottom) > Math.max(r.top, clip.top);
  return { ...result, visible, reason: visible ? 'visible' : 'clipped outside physical viewport' };
}
async function physicallyFitted(r, n) {
  const s = await geometry(r);
  const exposed = await r.evaluate(exposedElement, `[data-page-number="${n}"]`);
  const p = exposed.rect, c = exposed.clip;
  const v = c && { left: Math.max(c.left, s.view.left), right: Math.min(c.right, s.view.right), top: Math.max(c.top, s.view.top), bottom: Math.min(c.bottom, s.view.bottom) };
  assert.ok(exposed.visible && p && v && p.left >= v.left - 2 && p.right <= v.right + 2 && p.top >= v.top - 2 && p.bottom <= v.bottom + 2,
    `page ${n} entièrement dans la zone physique visible : ${JSON.stringify({ exposed, v })}`);
  return p;
}

// Bloc ciblable séparément pour ne pas rejouer les régressions déjà validées.
test('closed auxiliary panels and retained assistant draft', { timeout: 120_000 }, async t => {
  const browser = await launch();
  t.after(() => browser.close());
  async function scenario(name, fn) {
    await t.test(name, { timeout: 55_000 }, async t => {
      const r = await openReader(browser, 1200, 900, mixed);
      t.after(() => r.close());
      await fn(r);
    });
  }

  await scenario('closed auxiliary panels cannot take invisible Tab focus or shift the fitted reader', async r => {
    await mode(r, PAGED);
    for (const n of [1, 2]) {
      await go(r, n);
      await fit(r, n);
      const before = await physicallyFitted(r, n);
      await r.control('button', TOOLS);
      await toolsOpen(r);
      await escapeTools(r);
      samePosition(before, await physicallyFitted(r, n), 'fermer Outils ne décale pas la page ajustée');
      // Douze Tab natifs bornés, sans ouvrir ni modifier les panneaux fermés.
      for (let i = 0; i < 12; i++) {
        await r.key('Tab', 'Tab', 9);
        await pause(120);
        const focus = await r.evaluate(exposedElement);
        assert.equal(focus.visible, true, `Tab ${i + 1}, page ${n} : focus réellement visible ou chrome/body : ${JSON.stringify(focus)}`);
        samePosition(before, await physicallyFitted(r, n), `Tab ${i + 1} ne décale pas le lecteur`);
      }
      await at(r, n);
      samePosition(before, await physicallyFitted(r, n), 'lecteur encore ajusté après stabilisation du parcours Tab');
    }
  });

  await scenario('assistant draft survives native S close and reopen without sending', async r => {
    await mode(r, PAGED);
    await go(r, 1);
    const selector = 'textarea[placeholder="Posez une question..."], input[placeholder="Posez une question..."]';
    const draft = 'Brouillon local de test, sans envoi.';
    const pressS = async () => {
      // Le raccourci part toujours d’un bouton non éditable, jamais de la saisie.
      await r.control('button', PAGED, function () { this.focus(); });
      await r.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 's', code: 'KeyS', windowsVirtualKeyCode: 83, text: 's', unmodifiedText: 's' });
      await r.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 's', code: 'KeyS', windowsVirtualKeyCode: 83 });
    };
    await pressS();
    await eventually(async () => (await r.evaluate(exposedElement, selector)).visible, 'saisie publique de l’assistant visible après S');
    await r.evaluate(selector => {
      const field = document.querySelector(selector);
      field.focus();
      field.select();
    }, selector);
    // Insertion native seulement : aucune touche Enter, aucun bouton d’envoi.
    await r.send('Input.insertText', { text: draft });
    assert.equal((await r.evaluate(exposedElement, selector)).value, draft);
    await pressS();
    await eventually(async () => !(await r.evaluate(exposedElement, selector)).visible, 'assistant effectivement fermé après S');
    await pressS();
    await eventually(async () => (await r.evaluate(exposedElement, selector)).visible, 'assistant rouvert après S');
    assert.equal((await r.evaluate(exposedElement, selector)).value, draft, 'fermer et rouvrir conserve le brouillon sans envoi');
  });
});

test('reader targeted public regressions', { timeout: 300_000 }, async t => {
  const browser = await launch();
  t.after(() => browser.close());
  async function scenario(name, fixture, fn) {
    await t.test(name, { timeout: 55_000 }, async t => {
      const r = await openReader(browser, 1200, 900, fixture);
      t.after(() => r.close());
      await fn(r);
    });
  }

  await scenario('immediate continuous scroll keeps visible page and counter synchronized', ordinary, async r => {
    await mode(r, PAGED);
    await go(r, 1);
    const before = await fit(r, 1);
    entirelyVisible(before, 1);
    const p = surface(before);
    const deltaY = pageIn(before, 1).height * 1.2;
    // No pause, AX query or geometry read between mode activation and this single trusted wheel gesture.
    await r.control('button', CONTINUOUS);
    await r.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: p.x, y: p.y, deltaX: 0, deltaY });
    const moved = await settled(r, s => s.central > 1);
    const n = moved.central;
    assert.ok(n > 1, 'a real page boundary was crossed, independently of the counter');
    await eventually(async () => await counter(r) === n, 'counter follows the geometrically central page after the immediate scroll');
    await pause(300);
    assert.equal((await geometry(r)).central, n, 'reading position remains stable after stopping');
    assert.equal(await counter(r), n, 'no delayed update restores the old page number');
    await mode(r, PAGED);
    await at(r, n);
    assert.notEqual(n, 1, 'return to paged mode must not restore the old page');
  });

  await scenario('fit intent survives portrait to wide landscape and allows the next swipe', mixed, async r => {
    await mode(r, PAGED);
    await go(r, 1);
    const first = await fit(r, 1);
    entirelyVisible(first, 1);
    await swipeNext(r, first);
    const second = await at(r, 2);
    const landscape = pageIn(second, 2);
    assert.ok(landscape.width / landscape.height > 2.8, 'the distinct wide landscape page is really displayed');
    entirelyVisible(second, 2);
    await swipeNext(r, second);
    entirelyVisible(await at(r, 3), 3);
  });

  await scenario('explicit navigation preserves deliberate manual zoom on equal-format portraits', mixed, async r => {
    await mode(r, PAGED);
    await go(r, 1);
    const fitted = await fit(r, 1), p = surface(fitted);
    const fittedWidth = pageIn(fitted, 1).width;
    await r.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: p.x, y: p.y, deltaX: 0, deltaY: -300, modifiers: 2 });
    const enlarged = await settled(r, s => s.central === 1 && pageIn(s, 1).width > fittedWidth * 1.1);
    const zoomedWidth = pageIn(enlarged, 1).width;
    const third = await go(r, 3);
    const width = pageIn(third, 3).width;
    assert.ok(width > fittedWidth * 1.1, 'explicit navigation does not silently fit the manually zoomed page');
    assert.ok(Math.abs(width - zoomedWidth) <= Math.max(2, zoomedWidth * 0.02), 'same-size portrait retains its manual zoom scale');
  });

  for (const name of [PAGED, CONTINUOUS]) {
    await scenario(`${name}: reading keys after toolbar focus, without stealing native input`, ordinary, async r => {
      await mode(r, name);
      await go(r, 3);
      await fit(r, 3);
      await r.control('button', TOOLS);
      await toolsOpen(r);
      await escapeTools(r);
      await r.key('PageDown', 'PageDown', 34);
      await at(r, 4);
      await r.key('PageUp', 'PageUp', 33);
      await at(r, 3);

      // Activating a visible toolbar command leaves button focus, not a text-editing context.
      await r.control('button', name);
      assert.equal(await r.control('button', name, function () { return document.activeElement === this; }), true);
      await r.key('PageDown', 'PageDown', 34);
      await at(r, 4);
      await r.key('PageUp', 'PageUp', 33);
      await at(r, 3);

      const beforeEdit = pageIn(await geometry(r), 3);
      await r.control('spinbutton', PAGE, function () { this.focus(); });
      await r.key('ArrowUp', 'ArrowUp', 38);
      assert.equal(await r.control('spinbutton', PAGE, function () { return this.value; }), '4', 'native numeric ArrowUp still edits the value');
      await pause(300);
      samePosition(beforeEdit, pageIn(await geometry(r), 3), 'editing the numeric field does not trigger reader navigation');
      await r.key('Enter', 'Enter', 13);
      const beforeNativeKey = pageIn(await at(r, 4), 4);
      await r.key('PageDown', 'PageDown', 34);
      await pause(300);
      samePosition(beforeNativeKey, pageIn(await geometry(r), 4), 'PageDown in the numeric field is not stolen by reader navigation');
      assert.equal(await r.control('spinbutton', PAGE, function () { return document.activeElement === this; }), true);
      await go(r, 4);

      await r.control('button', TOOLS, function () { this.focus(); });
      await r.key('Enter', 'Enter', 13);
      await toolsOpen(r);
      await escapeTools(r);
      await r.key(' ', 'Space', 32);
      await toolsOpen(r);
      await escapeTools(r);
      await at(r, 4);
    });
  }
});
