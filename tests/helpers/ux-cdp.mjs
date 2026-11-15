// Sondes UX exclusivement boîte noire : accessibilité, gestes natifs et styles affichés.
import assert from 'node:assert/strict';
import { eventually, pause, counter, dominantPage } from '../storage-cdp.mjs';

export const axControls = async r => (await r.send('Accessibility.getFullAXTree')).nodes
  .filter(n => !n.ignored).map(n => ({ role: n.role?.value, name: n.name?.value, id: n.backendDOMNodeId }));

export async function namedButton(r, names) {
  const controls = await axControls(r);
  const matches = controls.filter(n => n.role === 'button' && names.includes(n.name));
  assert.equal(matches.length, 1, `Un bouton accessible parmi ${JSON.stringify(names)} ; trouvés : ${matches.map(n => n.name)}`);
  return matches[0].name;
}

/** Atteint le contrôle uniquement par Tab, sans focus() sur la cible. */
export async function tabTo(r, role, name) {
  for (let i = 0; i < 80; i++) {
    await r.key('Tab', 'Tab', 9);
    if (await r.control(role, name, function () { return document.activeElement === this; })) return;
  }
  assert.fail(`${role} « ${name} » doit être atteignable par Tab`);
}

export async function pageAt(r, n) {
  await eventually(async () => await counter(r) === n && await dominantPage(r) === n,
    `page ${n} réellement affichée et compteur concordant`);
  // Laisser passer la réconciliation différée, puis vérifier à nouveau la géométrie.
  await pause(300);
  assert.equal(await counter(r), n, 'le compteur reste sur la destination');
  assert.equal(await dominantPage(r), n, 'la surface PDF, et pas seulement la valeur du champ, a changé');
}

export const pdfRect = r => r.evaluate(() => {
  const pages = [...document.querySelectorAll('#pdf-workspace [data-page-number]')]
    .map(e => ({ e, b: e.getBoundingClientRect() }))
    .filter(({ b }) => b.width > 50 && b.height > 50 && b.bottom > 0 && b.top < innerHeight)
    .sort((a, b) => (Math.min(b.b.bottom, innerHeight) - Math.max(b.b.top, 0)) - (Math.min(a.b.bottom, innerHeight) - Math.max(a.b.top, 0)));
  const p = pages[0];
  return p ? { n: Number(p.e.dataset.pageNumber), x: p.b.x, y: p.b.y, width: p.b.width, height: p.b.height } : null;
});

export function samePdf(before, after) {
  assert.ok(before && after, 'le PDF reste affiché');
  assert.equal(after.n, before.n, 'la molette du panneau ne tourne pas la page');
  for (const k of ['x', 'y', 'width', 'height']) {
    assert.ok(Math.abs(before[k] - after[k]) <= 2, `la molette du panneau ne déplace ni ne zoome le PDF (${k}: ${before[k]} → ${after[k]})`);
  }
}

/** Retrouve le vrai conteneur défilant du sommaire depuis la première entrée PDF. */
export const outlineScroll = r => r.evaluate(() => {
  const entry = [...document.querySelectorAll('a,button,[role="link"]')]
    .find(e => e.textContent.trim() === 'Section 01 du document');
  for (let e = entry?.parentElement; e; e = e.parentElement) {
    const s = getComputedStyle(e), b = e.getBoundingClientRect();
    if (/(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 20 && b.width > 0 && b.height > 0) {
      const x = Math.max(b.left, 0) + Math.min(b.width, innerWidth - b.left) * 0.55;
      const y = Math.max(b.top, 0) + (Math.min(b.bottom, innerHeight) - Math.max(b.top, 0)) * 0.6;
      return { top: e.scrollTop, height: e.clientHeight, contentHeight: e.scrollHeight, x, y, hitInside: e.contains(document.elementFromPoint(x, y)) };
    }
  }
  return null;
});

// Même principe que PROBES dans storage-cdp : interception d'une API du navigateur,
// sans module ni état React. Refus d'accès réel à l'API, puis restitution sans rechargement.
export const DENIED_IDB = `(() => {
  const open = IDBFactory.prototype.open;
  IDBFactory.prototype.open = function (...args) {
    if (sessionStorage.getItem('__uxDenyIdb') === '1') {
      sessionStorage.setItem('__uxDeniedCalls', String(Number(sessionStorage.getItem('__uxDeniedCalls') || 0) + 1));
      throw new DOMException('Accès au stockage refusé pour le test', 'SecurityError');
    }
    return Reflect.apply(open, this, args);
  };
})();`;

export const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const luminance = hex => rgb(hex).map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
export const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

/** Valeurs calculées et surfaces réelles : aucune importation du gestionnaire de thèmes. */
export const palettePaint = r => r.evaluate(() => {
  const css = getComputedStyle(document.documentElement);
  const tokens = Object.fromEntries(['desk', 'surface', 'page', 'ink', 'text', 'muted', 'accent'].map(k => [k, css.getPropertyValue(`--${k}`).trim().toUpperCase()]));
  const background = start => {
    for (let e = start; e; e = e.parentElement) {
      const bg = getComputedStyle(e).backgroundColor;
      if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
    }
    return null;
  };
  const filters = [];
  for (let e = document.querySelector('#pdf-workspace canvas'); e && e.id !== 'pdf-workspace'; e = e.parentElement) {
    const filter = getComputedStyle(e).filter;
    if (filter !== 'none') filters.push(filter);
  }
  const references = filters.join(' ').matchAll(/url\(["']?(?:[^#]*#)([^"')]+)["']?\)/g);
  const matrices = [...references].map(m => document.getElementById(m[1])?.querySelector('feColorMatrix'))
    .filter(Boolean).map(e => ({ type: e.getAttribute('type'), values: e.getAttribute('values').trim().split(/[\s,]+/).map(Number) }));
  const toolbar = document.querySelector('#reader-toolbar');
  return { tokens, desk: background(document.querySelector('#pdf-workspace')),
    surface: toolbar && getComputedStyle(toolbar).backgroundColor,
    text: toolbar && getComputedStyle(toolbar).color, filters, matrices };
});
