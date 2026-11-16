// LUM-16 (correction du 16 novembre 2026) — ancrage du pincement / de Ctrl+molette lorsque le
// document passe, PENDANT le geste, de « tient dans la largeur de la zone de lecture » à « la dépasse ».
// Garantie LUM-13 G2 : à la fin du geste, sur tout axe où le document agrandi dépasse la zone, le point
// médian (ou le curseur) reste à ≤ 8 px de sa position sous les doigts ; sur un axe où il tient, il reste centré.
// Oracle : « position atteignable » (G2) = bornes réellement atteignables en défilant jusqu'aux extrémités
// (elles-mêmes bornées par G1 : bord du document entre −2 et 24 px de celui de la zone). Le point doit être
// à ≤ 8 px de sa position idéale sous les doigts, ramenée dans l'intervalle atteignable (« reste contre le bord »).
// Boîte noire : géométrie affichée + entrées CDP de confiance, via les helpers existants (gesture-kit).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { launch, openReader } from './reader-cdp.mjs';
import {
  CONTINUOUS, PAGED, MARGIN, EPS, pause, until, snap, settle, rounded, assertCentered, open, touch, release, wheel, zonePoint,
} from './helpers/gesture-kit.mjs';

const five = fileURLToPath(new URL('./fixtures/reader-5-pages.pdf', import.meta.url));
const SIZES = [['PC 1440×900', [1440, 900]], ['tablette 800×1280', [800, 1280]]];
const ANCHOR_TOLERANCE = 8;       // px, LUM-13 G2
const MIN_START_ROOM = 4;         // au départ, le document tient en largeur avec au moins 4 px de marge
const WHEEL_RATE = 0.0015;        // zoom ≈ exp(0,0015 × |deltaY|) par impulsion Ctrl+molette (mesuré en boîte noire)
// Largeurs finales visées, en multiples de la largeur de la zone : juste au-dessus du seuil, puis nettement au-dessus.
const OVERSHOOTS = [['juste au-dessus du seuil (×1,05)', 1.05], ['nettement au-dessus du seuil (×1,35)', 1.35]];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// « Ajuster la page » peut déjà occuper presque toute la largeur (tablette) : on garde alors le départ
// ajusté tel quel s'il tient (≥ MIN_START_ROOM de marge) ; sinon zoom arrière contrôlé par pincement.
async function startFitting(r, name, docKey) {
  let s = await open(r, name, 3);
  for (let i = 0; i < 3 && s[docKey].width > s.zone.width - MIN_START_ROOM; i++) {
    const c = zonePoint(s, 0.5, 0.5);
    await touch(r, 'touchStart', [{ id: 1, x: c.x - 100, y: c.y }, { id: 2, x: c.x + 100, y: c.y }]);
    for (let k = 1; k <= 5; k++) {
      await touch(r, 'touchMove', [{ id: 1, x: c.x - 100 + k * 10, y: c.y }, { id: 2, x: c.x + 100 - k * 10, y: c.y }]);
      await pause(25);
    }
    await release(r);
    s = await settle(r, 3, { doc: docKey });
  }
  return s;
}

// Position sous les doigts : 65 % de la largeur de la page, 40 % de sa partie visible en hauteur.
function pickPoint(s) {
  const pg = s.page, z = s.zone;
  const top = Math.max(z.top, pg.top), bottom = Math.min(z.bottom, pg.bottom);
  return { x: pg.left + pg.width * 0.65, y: top + (bottom - top) * 0.4 };
}

// Intervalle atteignable du bord gauche de la page, mesuré en défilant aux deux extrémités (à appeler APRÈS
// la mesure d'ancrage : il déplace le document). Vérifie au passage G1 sur ces extrémités.
async function reachX(r, docKey) {
  const at = async x => { await r.evaluate(x => { const c = document.querySelector('.pdf-viewer-container'); c.scrollLeft = x < 0 ? 0 : c.scrollWidth * 4; }, x); await pause(150); return settle(r, 3, { doc: docKey }); };
  const first = await at(-1), last = await at(1);
  const g1 = s => ({ left: s[docKey].left - s.zone.left, right: s.zone.right - s[docKey].right });
  for (const [where, gap] of [['début', g1(first).left], ['fin', g1(last).right]]) {
    assert.ok(gap >= -EPS && gap <= MARGIN, `G1 : vide extérieur au ${where} du défilement horizontal = ${gap.toFixed(1)} px (attendu −${EPS}…${MARGIN})`);
  }
  return { min: last.page.left, max: first.page.left };
}

// Décalage du point de page initialement sous (p.x, p.y) par rapport à (p.x, p.y), après le geste.
const drift = (before, after, p) => ({
  dx: after.left + (p.x - before.left) / before.width * after.width - p.x,
  dy: after.top + (p.y - before.top) / before.height * after.height - p.y,
});

// `before` = géométrie juste avant le geste (ou l'impulsion franchissante), `end` = géométrie stabilisée.
async function verify(r, label, docKey, before, end, p) {
  const d = drift(before.page, end.page, p);
  const over = { x: end[docKey].width > end.zone.width + 1, y: end[docKey].height > end.zone.height + 1 };
  const fx = (p.x - before.page.left) / before.page.width;
  const ideal = p.x - fx * end.page.width;
  const dxRaw = d.dx, dyRaw = d.dy;
  assert.ok(over.x, `${label}: le document final dépasse la zone en largeur (franchissement réel) ${JSON.stringify({ zone: rounded(end.zone), end: rounded(end.page) })}`);
  const reach = await reachX(r, docKey);
  const expected = clamp(ideal, reach.min, reach.max);
  const dev = end.page.left - expected;
  const info = JSON.stringify({ over, dxSansBorne: Math.round(dxRaw * 10) / 10, idealGauche: Math.round(ideal), atteignable: [Math.round(reach.min), Math.round(reach.max)], p: rounded(p), zone: rounded(end.zone), before: rounded(before.page), end: rounded(end.page) });
  assert.ok(Math.abs(dev) <= ANCHOR_TOLERANCE, `${label}: axe X ancré à ≤ ${ANCHOR_TOLERANCE} px de la position atteignable la plus proche, mesuré ${dev.toFixed(1)} px (dx brut ${dxRaw.toFixed(1)} px) ${info}`);
  if (over.y) assert.ok(Math.abs(dyRaw) <= ANCHOR_TOLERANCE,
    `${label}: axe Y ancré à ≤ ${ANCHOR_TOLERANCE} px, mesuré dy = ${dyRaw.toFixed(1)} px ${info}`);
  const centered = [over.x ? '' : 'x', over.y ? '' : 'y'].join('');
  if (centered) assertCentered(end, docKey, centered, `${label}: axe où le document tient reste centré`);
  return { dev, dx: dxRaw, dy: dyRaw };
}

function checkFits(label, s, docKey) {
  assert.ok(s[docKey].width <= s.zone.width - MIN_START_ROOM,
    `${label}: avant le franchissement le document tient en largeur ${JSON.stringify({ doc: Math.round(s[docKey].width), zone: Math.round(s.zone.width) })}`);
}

test('LUM-16 — ancrage du pincement et de Ctrl+molette au franchissement de la largeur', { timeout: 900_000 }, async t => {
  const browser = await launch();
  t.after(() => browser.close());

  for (const [sizeLabel, [w, h]] of SIZES) {
    for (const name of [PAGED, CONTINUOUS]) {
      const docKey = name === PAGED ? 'page' : 'column';
      for (const [overLabel, factor] of OVERSHOOTS) {
        const tag = `${sizeLabel}, ${name}, ${overLabel}`;

        await t.test(`${tag} : pincement décentré (65 % de la largeur)`, { timeout: 120_000 }, async t => {
          const r = await openReader(browser, w, h, five);
          t.after(() => r.close());
          const start = await startFitting(r, name, docKey);
          checkFits('pincement', start, docKey);
          const p = pickPoint(start);
          // Écartement progressif (12 pas) : la page passe de « tient » à « dépasse » PENDANT le geste.
          const ratio = start.zone.width * factor * 1.02 / start.page.width;
          const d0 = 100, steps = 12;
          const pts = d => [{ id: 1, x: p.x - d / 2, y: p.y }, { id: 2, x: p.x + d / 2, y: p.y }];
          await touch(r, 'touchStart', pts(d0));
          let crossed = false;
          for (let i = 1; i <= steps; i++) {
            await touch(r, 'touchMove', pts(d0 + (d0 * ratio - d0) * i / steps));
            await pause(30);
            crossed ||= (await snap(r, 3))[docKey].width > start.zone.width + 1;
          }
          await until(async () => {
            const s = await snap(r, 3);
            return { ok: s?.[docKey]?.width >= s.zone.width * factor * 0.97, info: { doc: s?.[docKey]?.width, zone: s?.zone.width } };
          }, 'le document atteint la largeur visée pendant le geste', 6_000);
          await release(r);
          const end = await settle(r, 3, { doc: docKey });
          const m = await verify(r, `pincement ${tag}`, docKey, start, end, p);
          t.diagnostic(`MESURE pincement ${tag}: écart à l'atteignable=${m.dev.toFixed(1)} dx brut=${m.dx.toFixed(1)} dy=${m.dy.toFixed(1)} largeur ${Math.round(start[docKey].width)} → ${Math.round(end[docKey].width)} (zone ${Math.round(start.zone.width)}; franchi pendant le geste=${crossed})`);
        });

        await t.test(`${tag} : Ctrl+molette décentrée (65 % de la largeur), impulsion franchissante`, { timeout: 120_000 }, async t => {
          const r = await openReader(browser, w, h, five);
          t.after(() => r.close());
          let before = await startFitting(r, name, docKey);
          // Montée centrée par impulsions tant que la suivante resterait dans la largeur (document centré, tient encore).
          const center = zonePoint(before, 0.5, 0.5);
          for (let i = 0; i < 8 && before[docKey].width * Math.exp(WHEEL_RATE * 100) < before.zone.width - MIN_START_ROOM; i++) {
            await wheel(r, center, { dy: -100, ctrl: true });
            before = await settle(r, 3, { doc: docKey });
          }
          checkFits('Ctrl+molette', before, docKey);
          const p = pickPoint(before);
          // UNE impulsion franchit le seuil ; la mesure se fait par rapport au point sous le curseur juste avant elle.
          const dy = -clamp(Math.round(Math.log(before.zone.width * factor * 1.02 / before.page.width) / WHEEL_RATE), 20, 1500);
          await wheel(r, p, { dy, ctrl: true });
          const end = await settle(r, 3, { doc: docKey });
          const m = await verify(r, `Ctrl+molette ${tag}`, docKey, before, end, p);
          t.diagnostic(`MESURE ctrl+molette ${tag}: écart à l'atteignable=${m.dev.toFixed(1)} dx brut=${m.dx.toFixed(1)} dy=${m.dy.toFixed(1)} largeur ${Math.round(before[docKey].width)} → ${Math.round(end[docKey].width)} (zone ${Math.round(before.zone.width)}, impulsion ${dy})`);
        });
      }
    }
  }
});
