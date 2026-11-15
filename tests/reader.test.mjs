import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { launch, openReader, eventually, pause } from './reader-cdp.mjs';

const fixture = fileURLToPath(new URL('./fixtures/reader-5-pages.pdf', import.meta.url));
const CONTINUOUS = 'Lecture continue';
const PAGED = 'Lecture page par page';
const PAGE = 'Aller à la page';
const FIT = 'Ajuster la page';
const TOOLS = 'Outils de lecture';

const value = r => r.control('spinbutton', PAGE, function () { return { value: this.value, type: this.type }; });
const active = async r => Number((await value(r)).value);
const pageRect = (r, n) => r.evaluate(n => {
  const e = document.querySelector(`[data-page-number="${n}"]`);
  if (!e) return null;
  const p = e.getBoundingClientRect();
  return { x: p.x, y: p.y, width: p.width, height: p.height, right: p.right, bottom: p.bottom };
}, n);

// LUM-13 G2 : l'ancrage du zoom n'est garanti que sur les axes où le document agrandi (page en
// Page par page, colonne de pages en Continu) dépasse la zone de lecture ; ailleurs il reste centré.
const exceeding = r => r.evaluate(() => {
  const c = document.querySelector('.pdf-viewer-container');
  const boxes = [...document.querySelectorAll('[data-page-number]')].map(e => e.getBoundingClientRect()).filter(p => p.width > 1 && p.height > 1);
  if (!c || !boxes.length) return { x: true, y: true };
  const width = Math.max(...boxes.map(p => p.right)) - Math.min(...boxes.map(p => p.left));
  const height = Math.max(...boxes.map(p => p.bottom)) - Math.min(...boxes.map(p => p.top));
  return { x: width > c.clientWidth + 1, y: height > c.clientHeight + 1 };
});

async function atPage(r, n) {
  await eventually(async () => {
    if (await active(r) !== n) return false;
    return r.evaluate(n => {
      const page = document.querySelector(`[data-page-number="${n}"]`);
      const workspace = document.querySelector('#pdf-workspace');
      if (!page || !workspace) return false;
      const p = page.getBoundingClientRect(), w = workspace.getBoundingClientRect();
      return p.width > 50 && p.height > 50 && p.right > Math.max(0, w.left)
        && p.left < Math.min(innerWidth, w.right) && p.bottom > Math.max(0, w.top)
        && p.top < Math.min(innerHeight, w.bottom) && getComputedStyle(page).visibility !== 'hidden';
    }, n);
  }, `page ${n} active AND visible`);
}

async function enter(r, text) {
  await r.control('spinbutton', PAGE, function (text) {
    this.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(this, text);
    this.dispatchEvent(new Event('input', { bubbles: true }));
    this.dispatchEvent(new Event('change', { bubbles: true }));
  }, [text]);
  await r.key('Enter', 'Enter', 13);
}
async function go(r, n) { await enter(r, String(n)); await atPage(r, n); }
async function mode(r, name) {
  await r.control('button', name);
  await eventually(() => r.control('button', name, function () { return this.getAttribute('aria-pressed') === 'true'; }), `${name} active`);
  const other = name === PAGED ? CONTINUOUS : PAGED;
  assert.equal(await r.control('button', other, function () { return this.getAttribute('aria-pressed'); }), 'false');
}
async function fit(r) {
  const inPanel = !await r.hasControl('button', FIT);
  if (inPanel) await r.control('button', TOOLS);
  await r.control('button', FIT);
  if (inPanel) await r.key('Escape', 'Escape', 27);
  await pause(350);
}
async function point(r) {
  const n = await active(r);
  return r.evaluate(n => {
    const w = document.querySelector('#pdf-workspace').getBoundingClientRect();
    const p = document.querySelector(`[data-page-number="${n}"]`).getBoundingClientRect();
    const left = Math.max(0, p.left, w.left), right = Math.min(innerWidth, p.right, w.right);
    const top = Math.max(0, p.top, w.top), bottom = Math.min(innerHeight, p.bottom, w.bottom);
    if (right - left < 80 || bottom - top < 80) throw new Error('Insufficient visible PDF surface for trusted input');
    return { x: left + (right - left) * 0.72, y: top + (bottom - top) * 0.55, distance: (right - left) * 0.44, distanceY: (bottom - top) * 0.35 };
  }, n);
}
const touch = (r, type, points = []) => r.send('Input.dispatchTouchEvent', {
  type, touchPoints: points.map(p => ({ radiusX: 3, radiusY: 3, force: 1, ...p })),
});
async function drag(r, direction = -1, vertical = false) {
  const p = await point(r);
  const start = direction < 0 ? p.x : p.x - p.distance;
  await touch(r, 'touchStart', [{ id: 1, x: vertical ? p.x : start, y: p.y }]);
  for (let i = 1; i <= 8; i++) {
    await touch(r, 'touchMove', [{ id: 1, x: vertical ? p.x : start + direction * p.distance * i / 8, y: vertical ? p.y - p.distanceY * i / 8 : p.y }]);
    await pause(25);
  }
}
async function swipe(r, direction) { await drag(r, direction); await touch(r, 'touchEnd'); }
const wheel = (r, p, deltaY, ctrl = false) => r.send('Input.dispatchMouseEvent', {
  type: 'mouseWheel', x: p.x, y: p.y, deltaX: 0, deltaY, modifiers: ctrl ? 2 : 0,
});
async function unchanged(r, n, description) {
  await pause(500);
  assert.equal(await active(r), n, description);
  await atPage(r, n);
}
async function pinch(r, leaveOneFinger = false) {
  const before = await pageRect(r, 3);
  const top = Math.max(0, before.y), bottom = Math.min(900, before.bottom);
  const p = { x: before.x + before.width * 0.6, y: top + (bottom - top) * 0.4 };
  await touch(r, 'touchStart', [{ id: 1, x: p.x - 60, y: p.y }, { id: 2, x: p.x + 60, y: p.y }]);
  for (let i = 1; i <= 6; i++) {
    await touch(r, 'touchMove', [{ id: 1, x: p.x - 60 - i * 10, y: p.y }, { id: 2, x: p.x + 60 + i * 10, y: p.y }]);
    await pause(25);
  }
  await eventually(async () => (await pageRect(r, 3))?.width > before.width * 1.1, 'two fingers really zoom');
  await pause(250);
  const after = await pageRect(r, 3);
  const pinchOver = await exceeding(r);
  const pinchDx = after.x + (p.x - before.x) / before.width * after.width - p.x;
  const pinchDy = after.y + (p.y - before.y) / before.height * after.height - p.y;
  assert.ok((!pinchOver.x || Math.abs(pinchDx) <= 8) && (!pinchOver.y || Math.abs(pinchDy) <= 8),
    `pinch midpoint stays anchored on every axis where the enlarged document exceeds the reader area (LUM-13 G2): ${JSON.stringify({ pinchOver, pinchDx, pinchDy })}`);
  if (leaveOneFinger) {
    // A smaller active touch set releases contact 2; CDP touchEnd itself must be empty.
    await touch(r, 'touchMove', [{ id: 1, x: p.x - 120, y: p.y }]);
    await touch(r, 'touchMove', [{ id: 1, x: p.x - 200, y: p.y }]);
  }
  await touch(r, 'touchEnd');
}

// Real browser input and transformed geometry, no source inspection or label-only mode oracle.
test('reader public browser contract', { timeout: 240_000 }, async t => {
  const browser = await launch();
  t.after(() => browser.close());
  async function scenario(name, width, height, fn) {
    await t.test(name, { timeout: 55_000 }, async t => {
      const r = await openReader(browser, width, height, fixture);
      t.after(() => r.close());
      await fn(r);
    });
  }

  for (const [device, width, height] of [['PC', 1440, 1000], ['tablet portrait', 900, 1280]]) {
    await scenario(`${device}: direct modes, real scrolling and preserved page`, width, height, async r => {
      for (const name of [CONTINUOUS, PAGED]) {
        assert.equal(await r.control('button', name, function () { return this.innerText.trim(); }), name === CONTINUOUS ? 'Continu' : 'Page par page');
        assert.equal(await r.control('button', name, function () {
          const p = this.getBoundingClientRect();
          return p.width > 0 && p.height > 0 && p.left >= 0 && p.right <= innerWidth && p.top >= 0 && p.bottom <= innerHeight;
        }), true, `${name} directly visible without menu`);
      }
      await mode(r, CONTINUOUS);
      await go(r, 1);
      await fit(r);
      const before = await pageRect(r, 1);
      const p = await point(r);
      await wheel(r, p, Math.max(height, before.height) * 1.15);
      await eventually(async () => await active(r) > 1, 'ordinary wheel actually advances continuous reading');
      const n = await active(r);
      await atPage(r, n);
      const after = await pageRect(r, n);
      assert.ok(Math.abs(after.width - before.width) < 2, 'ordinary wheel does not zoom');
      await mode(r, PAGED);
      await unchanged(r, n, 'continuous-to-paged retains page after settling');
      await fit(r);
      await go(r, 3);
      await swipe(r, -1);
      await atPage(r, 4);
      await mode(r, CONTINUOUS);
      await unchanged(r, 4, 'paged-to-continuous retains page after settling');
      await mode(r, PAGED);
      await unchanged(r, 4, 'switching back retains page after settling');
    });
  }

  await scenario('page entry: native number, Enter, clamp and invalid input', 1440, 1000, async r => {
    assert.equal((await value(r)).type, 'number');
    await mode(r, PAGED);
    await go(r, 3);
    await enter(r, '999');
    await atPage(r, 5);
    await enter(r, '0');
    await atPage(r, 1);
    await enter(r, '-8');
    await atPage(r, 1);
    await go(r, 3);
    const before = await pageRect(r, 3);
    await enter(r, '');
    await pause(350);
    const after = await pageRect(r, 3);
    assert.ok(after, 'invalid entry retains rendered page 3');
    assert.ok(Math.abs(after.x - before.x) < 2 && Math.abs(after.y - before.y) < 2, 'invalid entry does not navigate');
    // The invalid editing value may remain empty: only navigation is constrained.
    assert.ok(after.width > 50 && after.height > 50 && after.bottom > 0 && after.y < 1000);
  });

  await scenario('fit swipe commits only on release, once, with both bounds', 900, 1280, async r => {
    await mode(r, PAGED);
    await go(r, 2);
    await fit(r);
    await drag(r, -1);
    await unchanged(r, 2, 'drag has not committed before release');
    await pause(900);
    assert.equal(await active(r), 2, 'holding cannot auto-repeat');
    await touch(r, 'touchEnd');
    await atPage(r, 3);
    await unchanged(r, 3, 'one release turns exactly one page');
    await swipe(r, 1);
    await atPage(r, 2);
    await go(r, 1);
    await swipe(r, 1);
    await unchanged(r, 1, 'first page bounded');
    await go(r, 5);
    await swipe(r, -1);
    await unchanged(r, 5, 'last page bounded');
  });

  await scenario('Ctrl+wheel anchor, zoomed pan including edge, cancellation and pinch', 1200, 900, async r => {
    for (const name of [PAGED, CONTINUOUS]) {
      await mode(r, name);
      await go(r, 3);
      await fit(r);
      const before = await pageRect(r, 3);
      const viewport = await point(r);
      const p = { x: before.x + before.width * 0.65, y: viewport.y };
      assert.ok(p.x > 0 && p.x < 1200 && p.y > before.y && p.y < before.bottom, 'zoom anchor inside visible PDF');
      await wheel(r, p, -300, true);
      await eventually(async () => (await pageRect(r, 3))?.width > before.width * 1.1, 'Ctrl+wheel really enlarges PDF');
      await pause(350);
      const zoomed = await pageRect(r, 3);
      const anchorX = zoomed.x + (p.x - before.x) / before.width * zoomed.width;
      const anchorY = zoomed.y + (p.y - before.y) / before.height * zoomed.height;
      const over = await exceeding(r);
      assert.ok((!over.x || Math.abs(anchorX - p.x) <= 8) && (!over.y || Math.abs(anchorY - p.y) <= 8),
        `cursor anchor preserved on every axis where the enlarged document exceeds the reader area (LUM-13 G2): over=${JSON.stringify(over)}, dx=${anchorX - p.x}, dy=${anchorY - p.y}`);
      if (name === CONTINUOUS) continue;
      await drag(r, -1, true);
      await touch(r, 'touchEnd');
      await unchanged(r, 3, 'zoomed gesture pans, never turns');
      const moved = await pageRect(r, 3);
      assert.ok(Math.hypot(moved.x - zoomed.x, moved.y - zoomed.y) > 10, 'zoomed page actually pans');
      // LUM-13 G5 remplace « un pan zoomé ne tourne jamais, même au bord » : tirer au-delà du bord
      // tourne désormais une page (couvert par tests/gestures.test.mjs). Un glissement vertical,
      // lui, ne tourne jamais de page : c'est l'assertion `unchanged` ci-dessus, conservée.
    }
    await mode(r, PAGED);
    await go(r, 3);
    await fit(r);
    await drag(r, -1);
    await touch(r, 'touchCancel');
    await unchanged(r, 3, 'system cancellation discards pending turn');
    await swipe(r, -1);
    await atPage(r, 4);
    await go(r, 3);
    await fit(r);
    await pinch(r, true);
    await unchanged(r, 3, 'two-to-one transition leaves no residual swipe');
    await fit(r);
    await drag(r, -1);
    await mode(r, CONTINUOUS);
    await touch(r, 'touchEnd');
    await unchanged(r, 3, 'mode change cancels pending gesture');
    await mode(r, PAGED);
    await swipe(r, -1);
    await atPage(r, 4);
    await mode(r, CONTINUOUS);
    await go(r, 3);
    await fit(r);
    await pinch(r);
    await unchanged(r, 3, 'continuous pinch does not change reading mode or page');
    assert.equal(await r.control('button', CONTINUOUS, function () { return this.getAttribute('aria-pressed'); }), 'true');
  });

  await scenario('tools geometry, effective Escape/focus; 360px targets and overflow', 1280, 900, async r => {
    await mode(r, PAGED);
    await go(r, 3);
    await fit(r);
    const before = await pageRect(r, 3);
    await r.control('button', TOOLS);
    const state = await r.control('button', TOOLS, function () {
      return { expanded: this.getAttribute('aria-expanded'), controls: this.getAttribute('aria-controls') };
    });
    assert.deepEqual(state, { expanded: 'true', controls: 'reader-tools' });
    await eventually(() => r.evaluate(() => {
      const e = document.querySelector('#reader-tools[role="region"][aria-label="Outils de lecture"]');
      if (!e) return false;
      const p = e.getBoundingClientRect(), s = getComputedStyle(e);
      return !e.hidden && s.display !== 'none' && s.visibility !== 'hidden' && p.width > 0 && p.height > 0
        && p.left >= 0 && p.top >= 0 && p.right <= innerWidth && p.bottom <= innerHeight;
    }), 'non-modal tools panel visible in viewport');
    const opened = await pageRect(r, 3);
    assert.ok(Math.abs(opened.x - before.x) < 2 && Math.abs(opened.y - before.y) < 2 && Math.abs(opened.width - before.width) < 2 && Math.abs(opened.height - before.height) < 2, 'opening tools does not shift document or zoom');
    await r.key('Escape', 'Escape', 27);
    assert.equal(await r.control('button', TOOLS, function () {
      return this.getAttribute('aria-expanded') === 'false' && document.activeElement === this;
    }), true, 'Escape restores focus and trigger state');
    await eventually(() => r.evaluate(() => {
      const e = document.getElementById('reader-tools');
      return !e || e.hidden || getComputedStyle(e).display === 'none' || getComputedStyle(e).visibility === 'hidden';
    }), 'panel actually hidden, not merely moved offscreen');
    await r.resize(360, 800);
    await pause(350);
    for (const [role, name] of [['button', CONTINUOUS], ['button', PAGED], ['button', TOOLS], ['spinbutton', PAGE]]) {
      const p = await r.control(role, name, function () {
        const p = this.getBoundingClientRect();
        return { width: p.width, height: p.height, left: p.left, right: p.right, top: p.top, bottom: p.bottom };
      });
      assert.ok(p.width >= 44 && p.height >= 44, `${name} touch target >=44px`);
      assert.ok(p.left >= -1 && p.right <= 361 && p.top >= 0 && p.bottom <= 800, `${name} stays visible at 360px`);
    }
    assert.equal(await r.evaluate(() => {
      const bar = document.querySelector('#reader-toolbar[role="toolbar"][aria-label="Commandes de lecture"]');
      if (!bar) return false;
      const p = bar.getBoundingClientRect();
      return p.width > 0 && p.left >= -1 && p.right <= innerWidth + 1 && bar.scrollWidth <= bar.clientWidth + 1;
    }), true, 'reader toolbar itself does not overflow at 360px');
    assert.deepEqual(await r.evaluate(() => [...document.querySelectorAll('#reader-toolbar button, #reader-toolbar input:not([type="file"]), #reader-toolbar select, #reader-toolbar [role="button"]')]
      .filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden')
      .filter(e => { const p = e.getBoundingClientRect(); return p.width < 44 || p.height < 44 || p.left < -1 || p.right > innerWidth + 1; })
      .map(e => e.getAttribute('aria-label') || e.textContent.trim() || e.tagName)), [], 'all visible toolbar targets fit and are at least44px');
  });

  await scenario('library screen displays total page count of opened document (LUM-15)', 1280, 900, async r => {
    await atPage(r, 1);
    await pause(400);
    const homeButton = await r.hasControl('button', 'Revenir à la bibliothèque') ? 'Revenir à la bibliothèque' : 'Bibliothèque';
    await r.control('button', homeButton);
    await eventually(() => r.evaluate(() => !document.querySelector('#pdf-workspace [data-page-number]')), 'library screen displayed');
    await eventually(() => r.evaluate(() => /\bsur\s*5\b/i.test(document.body?.innerText || '')),
      'library displays total page count (e.g. Page 1 sur 5)');
  });
});
