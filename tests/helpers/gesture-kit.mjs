// Outils partagés des tests de gestes (LUM-13) : boîte noire, géométrie réellement visible,
// entrées CDP de confiance (toucher, molette, souris). Aucun accès au code de production.
import assert from 'node:assert/strict';
import { eventually, pause } from '../reader-cdp.mjs';

export { pause, eventually };
export const CONTINUOUS = 'Lecture continue';
export const PAGED = 'Lecture page par page';
export const PAGE = 'Aller à la page';
export const FIT = 'Ajuster la page';
export const TOOLS = 'Outils de lecture';
export const NOTE = 'Ajouter une note sur la page';
export const SHOW_BAR = 'Afficher la barre de lecture';
export const NOTE_MARKER = '[title="Cliquez pour éditer"]';

// Tolérances du contrat : 24 px d’espace extérieur au plus (G1) et 2 px d’arrondi.
export const MARGIN = 24;
export const EPS = 2;

// Attente avec dernier état observé dans le message d’échec (diagnostic sans deviner).
export async function until(probe, description, timeout = 4_000) {
  const deadline = Date.now() + timeout;
  let last;
  do {
    last = await probe();
    if (last?.ok) return last;
    await pause(60);
  } while (Date.now() < deadline);
  throw new Error(`Timed out: ${description}; dernier état: ${JSON.stringify(last?.info ?? last)}`.slice(0, 1500));
}

// ---------- Lecture de l’état public ----------
export const counter = r => r.control('spinbutton', PAGE, function () { return Number(this.value); });

// Zone de lecture = conteneur défilant ; pages = géométrie visible transformée.
export const snap = (r, n) => r.evaluate(n => {
  const c = document.querySelector('.pdf-viewer-container');
  if (!c) return null;
  const cr = c.getBoundingClientRect();
  const left = cr.left + c.clientLeft, top = cr.top + c.clientTop;
  const zone = { left, top, width: c.clientWidth, height: c.clientHeight, right: left + c.clientWidth, bottom: top + c.clientHeight };
  const box = e => {
    const p = e.getBoundingClientRect();
    return { left: p.left, top: p.top, right: p.right, bottom: p.bottom, width: p.width, height: p.height };
  };
  const pages = [...document.querySelectorAll('[data-page-number]')].flatMap(e => {
    const b = box(e), s = getComputedStyle(e);
    if (b.width <= 1 || b.height <= 1 || s.visibility === 'hidden' || s.display === 'none') return [];
    return [{ n: Number(e.dataset.pageNumber), ...b }];
  });
  let column = null;
  if (pages.length) {
    column = {
      left: Math.min(...pages.map(p => p.left)), right: Math.max(...pages.map(p => p.right)),
      top: Math.min(...pages.map(p => p.top)), bottom: Math.max(...pages.map(p => p.bottom)),
    };
    column.width = column.right - column.left;
    column.height = column.bottom - column.top;
  }
  return {
    zone, column, pages,
    page: pages.find(p => p.n === n) ?? null,
    scroll: { left: c.scrollLeft, top: c.scrollTop, rangeX: c.scrollWidth - c.clientWidth, rangeY: c.scrollHeight - c.clientHeight },
  };
}, n);

// Attend une géométrie stable (suivi du doigt, animations et rendu différé posés).
export async function settle(r, n, { doc = 'page', stableMs = 300, timeout = 6_000 } = {}) {
  let previous, since = Date.now();
  const found = await until(async () => {
    const s = await snap(r, n);
    const d = s?.[doc];
    if (!d) { previous = null; return { ok: false, info: 'absent' }; }
    const same = previous && ['left', 'top', 'width', 'height'].every(k => Math.abs(previous[k] - d[k]) <= 0.5);
    if (!same) since = Date.now();
    previous = d;
    return { ok: same && Date.now() - since >= stableMs, info: d, s };
  }, `géométrie stable (${doc}, page ${n})`, timeout);
  return found.s;
}

export const near = (a, b, tol = EPS) => ['left', 'top', 'width', 'height'].every(k => Math.abs(a[k] - b[k]) <= tol);
export const rounded = o => o && Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * 10) / 10 : v]));

// Attend « compteur = n » ET page n à la place `home` (±tol), retourne l’instantané.
export async function expectHome(r, n, home, label, { tol = EPS, timeout = 4_000 } = {}) {
  const found = await until(async () => {
    const [c, s] = [await counter(r), await snap(r, n)];
    return { ok: c === n && Boolean(s?.page) && near(s.page, home, tol), info: { counter: c, page: rounded(s?.page), home: rounded(home) }, s };
  }, label, timeout);
  return found.s;
}
export async function expectCounter(r, n, label, timeout = 4_000) {
  await until(async () => { const c = await counter(r); return { ok: c === n, info: { counter: c, expected: n } }; }, label, timeout);
}
// Absence de changement : on laisse le temps à un tour parasite de se produire.
export async function stays(r, n, label, ms = 900) {
  await pause(ms);
  assert.equal(await counter(r), n, label);
}

// Écarts documentaires : positif = le bord du document est à l’intérieur de la zone (vide).
export function gaps(s, doc = 'page') {
  const d = s[doc], z = s.zone;
  return { left: d.left - z.left, right: z.right - d.right, top: d.top - z.top, bottom: z.bottom - d.bottom };
}
// G1 : bord atteint = au plus 24 px de vide, aucun contenu coupé (±2 px).
export const edgeOk = gap => gap >= -EPS && gap <= MARGIN;
export function assertEdge(s, side, doc, label) {
  const g = gaps(s, doc);
  assert.ok(edgeOk(g[side]), `${label}: bord ${side} du document à ${g[side].toFixed(1)} px du bord de la zone (attendu −${EPS}…${MARGIN}) ${JSON.stringify({ zone: rounded(s.zone), doc: rounded(s[doc]) })}`);
}
export function assertCentered(s, doc, axes, label, tol = 3) {
  const d = s[doc], z = s.zone;
  if (axes.includes('x')) assert.ok(Math.abs((d.left + d.right) / 2 - (z.left + z.right) / 2) <= tol, `${label}: centré horizontalement ${JSON.stringify({ zone: rounded(z), doc: rounded(d) })}`);
  if (axes.includes('y')) assert.ok(Math.abs((d.top + d.bottom) / 2 - (z.top + z.bottom) / 2) <= tol, `${label}: centré verticalement ${JSON.stringify({ zone: rounded(z), doc: rounded(d) })}`);
}
export const zonePoint = (s, fx, fy) => ({ x: s.zone.left + s.zone.width * fx, y: s.zone.top + s.zone.height * fy });

// ---------- Commandes publiques ----------
export async function enter(r, text) {
  await r.control('spinbutton', PAGE, function (text) {
    this.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(this, text);
    this.dispatchEvent(new Event('input', { bubbles: true }));
    this.dispatchEvent(new Event('change', { bubbles: true }));
  }, [text]);
  await r.key('Enter', 'Enter', 13);
}
export async function mode(r, name) {
  await r.control('button', name);
  await until(async () => ({ ok: await r.control('button', name, function () { return this.getAttribute('aria-pressed') === 'true'; }) }), `${name} actif`);
}
export async function go(r, n) {
  await enter(r, String(n));
  await expectCounter(r, n, `compteur = ${n}`);
  await pause(250);
}
export async function fit(r) {
  const inPanel = !await r.hasControl('button', FIT);
  if (inPanel) await r.control('button', TOOLS);
  await r.control('button', FIT);
  if (inPanel) await r.key('Escape', 'Escape', 27);
  await pause(350);
}
// Prépare « page n, ajustée » dans le mode voulu, géométrie stabilisée.
export async function open(r, name, n) {
  await mode(r, name);
  await go(r, n);
  await fit(r);
  return settle(r, n, { doc: name === PAGED ? 'page' : 'column' });
}
export async function toolbar(r) {
  const state = await r.evaluate(() => {
    const t = document.querySelector('#reader-toolbar');
    if (!t) return { visible: false };
    const p = t.getBoundingClientRect(), s = getComputedStyle(t);
    return { visible: !t.hidden && p.width > 0 && p.height > 0 && p.bottom > 0 && p.top < innerHeight
      && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0 };
  });
  return { ...state, showButton: await r.hasControl('button', SHOW_BAR) };
}
export async function expectToolbar(r, visible, label) {
  await until(async () => {
    const t = await toolbar(r);
    return { ok: t.visible === visible && t.showButton === !visible, info: t };
  }, label);
}
export const markers = r => r.evaluate(sel => document.querySelectorAll(sel).length, NOTE_MARKER);

// ---------- Entrées de confiance ----------
export const touch = (r, type, points = []) => r.send('Input.dispatchTouchEvent', {
  type, touchPoints: points.map(p => ({ radiusX: 3, radiusY: 3, force: 1, ...p })),
});
// Un doigt : appui, déplacements (dx,dy en `steps` mouvements espacés de `interval` ms), maintien
// facultatif, puis relâchement/annulation (`end: 'none'` laisse le doigt posé).
// Retourne la position finale et la vitesse réellement émise sur le dernier segment (px/ms,
// mesurée côté test) pour vérifier que le geste simulé est bien « vif » ou « lent ».
export async function stroke(r, { x, y, dx = 0, dy = 0, steps = 8, interval = 25, hold = 0, end = 'end' }) {
  await touch(r, 'touchStart', [{ id: 1, x, y }]);
  const times = [];
  for (let i = 1; i <= steps; i++) {
    await touch(r, 'touchMove', [{ id: 1, x: x + dx * i / steps, y: y + dy * i / steps }]);
    times.push(performance.now());
    if (interval && i < steps) await pause(interval);
  }
  const lastStep = Math.hypot(dx, dy) / steps;
  const lastGap = times.length > 1 ? times.at(-1) - times.at(-2) : Infinity;
  const speed = lastStep / lastGap;
  if (hold) await pause(hold);
  const last = { x: x + dx, y: y + dy, speed };
  if (end === 'end') await touch(r, 'touchEnd');
  if (end === 'cancel') await touch(r, 'touchCancel');
  return last;
}
export const release = r => touch(r, 'touchEnd');
export async function tap(r, { x, y }, { hold = 60 } = {}) {
  await touch(r, 'touchStart', [{ id: 1, x, y }]);
  await pause(hold);
  await touch(r, 'touchEnd');
}
export async function click(r, { x, y }) {
  await r.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await r.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await r.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}
export const wheel = (r, { x, y }, { dx = 0, dy = 0, ctrl = false } = {}) => r.send('Input.dispatchMouseEvent', {
  type: 'mouseWheel', x, y, deltaX: dx, deltaY: dy, modifiers: ctrl ? 2 : 0,
});
// Rafale d’inertie : impulsions rapprochées d’amplitude décroissante.
export async function wheelBurst(r, p, { events = 15, start = 100, step = 6, spacing = 8, axis = 'y' } = {}) {
  for (let i = 0; i < events; i++) {
    const delta = Math.max(4, start - i * step);
    await wheel(r, p, axis === 'y' ? { dy: delta } : { dx: delta });
    await pause(spacing);
  }
}
// Pincement symétrique horizontal autour de `center` (distance d0 → d1).
export async function pinch(r, center, d0, d1, { steps = 6, interval = 25, end = true } = {}) {
  const pts = d => [{ id: 1, x: center.x - d / 2, y: center.y }, { id: 2, x: center.x + d / 2, y: center.y }];
  await touch(r, 'touchStart', pts(d0));
  for (let i = 1; i <= steps; i++) {
    await touch(r, 'touchMove', pts(d0 + (d1 - d0) * i / steps));
    await pause(interval);
  }
  if (end) await touch(r, 'touchEnd');
}

// ---------- Zoom et placement ----------
// Zoome à la molette Ctrl ancrée en `at` jusqu’à `ratio` × la largeur courante de la page n.
export async function zoomBy(r, n, ratio, at = null) {
  const first = await settle(r, n);
  const target = first.page.width * ratio;
  const point = at ?? zonePoint(first, 0.5, 0.5);
  for (let i = 0; i < 16; i++) {
    const s = await snap(r, n);
    if (s?.page && s.page.width >= target) break;
    await wheel(r, point, { dy: -100, ctrl: true });
    await pause(120);
  }
  return settle(r, n);
}

// Place un bord de la page n par défilement programmatique du conteneur :
// `away` = px de page encore cachés au-delà du bord de la zone (0 = bord contre le bord de la zone).
// Mesure par géométrie ; si le contrat borne la position (24 px), la boucle s’arrête à la borne.
export async function place(r, n, side, away = 0, doc = 'page') {
  const horizontal = side === 'left' || side === 'right';
  const prop = horizontal ? 'scrollLeft' : 'scrollTop', key = horizontal ? 'left' : 'top';
  for (let i = 0; i < 8; i++) {
    const s = await snap(r, n);
    const d = s[doc], z = s.zone;
    const delta = { left: z.left - d.left, right: d.right - z.right, top: z.top - d.top, bottom: d.bottom - z.bottom }[side] - away;
    if (Math.abs(delta) <= 1) break;
    const signed = side === 'left' || side === 'top' ? -delta : delta;
    const before = s.scroll[key];
    await r.evaluate((prop, signed) => { document.querySelector('.pdf-viewer-container')[prop] += signed; }, prop, signed);
    await pause(90);
    if (Math.abs((await snap(r, n)).scroll[key] - before) < 0.5) break; // borne atteinte
  }
  return settle(r, n, { doc });
}
// Défilement extrême programmatique (mesure des bornes G1) ; x/y : -1 = début, 1 = fin, null = inchangé.
export async function scrollExtreme(r, n, { x = null, y = null }, doc = 'page') {
  await r.evaluate((x, y) => {
    const c = document.querySelector('.pdf-viewer-container');
    if (x !== null) c.scrollLeft = x < 0 ? 0 : c.scrollWidth * 4;
    if (y !== null) c.scrollTop = y < 0 ? 0 : c.scrollHeight * 4;
  }, x, y);
  await pause(120);
  return settle(r, n, { doc });
}
