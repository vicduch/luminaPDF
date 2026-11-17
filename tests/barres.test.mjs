// LUM-17 — barres superposées : le PDF ne bouge plus quand on masque/affiche les barres.
// Garanties B1, B2, B3, B4 (fond opaque) et la part B5 « toucher hors commande au bord de la fenêtre » de
// docs/features/LUM-17-barres-superposees.md (décision utilisateur, option A). Boîte noire : géométrie
// réellement affichée (getBoundingClientRect), compteur public, arbre d'accessibilité, toucher CDP de confiance.
// Écrit AVANT l'implémentation, sur la base 2dafa3d :
//   - B1 (stabilité) et B5 (bords) sont rouges attendus ;
//   - B4 (fonds opaques du pied et des onglets, rouge attendu ; l'en-tête l'est déjà) ;
//   - B2 (taille/place ajustée conservées, constantes ci-dessous mesurées sur 2dafa3d) et B3 sont verts avant ;
//   - B7 (une seule vérification : redimensionnement) est vert avant.
// Après revue 1 : B8 (haut et bas dégageables, réserve en-tête/pied), B9 (panneau IA, alerte d'enregistrement),
// B4 au survol souris (navigateur déclarant un pointeur fin, tests/helpers/hover-browser.mjs), B7 au seuil 760 px.
// Exécution : READER_TEST_URL=http://127.0.0.1:3017 node --test --test-concurrency=1 tests/barres.test.mjs
// Limites : Edge headless émulé, toucher simulé par CDP ; ni appareil réel, ni rendu graphique (B4/B6 : observation parent).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { launch, openReader } from './reader-cdp.mjs';
import {
  CONTINUOUS, PAGED, TOOLS, SHOW_BAR, PAGE, FIT, RESERVE, EPS,
  pause, until, snap, settle, near, rounded, counter, expectCounter, expectHome, zonePoint,
  open, go, fit, tap, toolbar, expectToolbar, zoomBy, scrollExtreme, assertEdge, gaps,
} from './helpers/gesture-kit.mjs';
import { openToolsPanel, closeToolsPanel } from './helpers/reading-mode.mjs';
import { createSession, PROBES, visibleAlerts } from './storage-cdp.mjs';
import { launchWithMouse, reloadWithMouse } from './helpers/hover-browser.mjs';

const FIVE = fileURLToPath(new URL('./fixtures/reader-5-pages.pdf', import.meta.url));
const OUTLINE = 'Sommaire', HIDE = 'Masquer la barre (H)', NAV = 'Navigation dans le document';
const NAV_SELECTOR = `nav[aria-label="${NAV}"]`;
const TABLET = [800, 1280], LANDSCAPE = [1280, 800], PC = [1440, 900], PHONE = [360, 800];
const SIZES = [['tablette portrait', TABLET], ['tablette paysage', LANDSCAPE], ['PC', PC], ['petit écran', PHONE]];
const MODES = [[PAGED, 'Page par page'], [CONTINUOUS, 'Continu']];

let browser;
test.before(async () => { browser = await launch(); });
test.after(async () => { if (browser) await browser.close(); });

function scenario(title, size, fn) {
  test(title, { timeout: 150_000 }, async () => {
    const r = await openReader(browser, size[0], size[1], FIVE);
    try { await fn(r); } finally { await r.close(); }
  });
}

const pressKey = (r, key, code, vk) => r.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, text: key, unmodifiedText: key })
  .then(() => r.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk }));

// =====================================================================================
// B1 — stabilité : masquer puis réafficher ne bouge ni la page, ni la zone, ni le défilement
// =====================================================================================
// Sélection : chaque scénario (taille × mode × ajustée/zoomée) enchaîne les TROIS moyens (toucher central,
// touche h, action « Masquer la barre (H) » puis bouton « Afficher la barre de lecture ») sur la même référence,
// donc chaque moyen est prouvé dans chaque configuration ; les quatre tailles et les deux modes sont couverts
// pour une page ajustée et pour une page zoomée (~×1,6). Le coût reste borné (16 scénarios, une ouverture chacun).
const MEANS = [
  ['toucher central au doigt', {
    hide: (r, s) => tap(r, zonePoint(s, 0.5, 0.5)),
    show: (r, s) => tap(r, zonePoint(s, 0.5, 0.5)),
  }],
  ['touche h', {
    hide: async r => { await r.evaluate(() => document.activeElement?.blur()); await pressKey(r, 'h', 'KeyH', 72); },
    show: async r => { await r.evaluate(() => document.activeElement?.blur()); await pressKey(r, 'h', 'KeyH', 72); },
  }],
  [`action « ${HIDE} » puis bouton « ${SHOW_BAR} »`, {
    // Sous 360 px le panneau défile : on amène l'action dans la vue comme le ferait un doigt, puis on clique.
    hide: async r => {
      await openToolsPanel(r);
      await r.control('button', HIDE, function () { this.scrollIntoView({ block: 'center' }); });
      await pause(150);
      await r.control('button', HIDE);
    },
    show: r => r.control('button', SHOW_BAR),
  }],
];

const state = async (r, n) => {
  const s = await settle(r, n);
  return { s, counter: await counter(r) };
};
const box = o => ({ left: o.left, top: o.top, width: o.width, height: o.height });
function assertSame(before, after, label) {
  const detail = () => JSON.stringify({ before: { page: rounded(box(before.s.page)), zone: rounded(box(before.s.zone)), scroll: rounded({ l: before.s.scroll.left, t: before.s.scroll.top }) },
    after: { page: rounded(box(after.s.page)), zone: rounded(box(after.s.zone)), scroll: rounded({ l: after.s.scroll.left, t: after.s.scroll.top }) } });
  assert.equal(after.counter, before.counter, `${label}: page courante inchangée`);
  assert.ok(near(after.s.page, before.s.page, 1), `${label}: boîte de la page courante identique à 1 px près ${detail()}`);
  assert.ok(near(after.s.zone, before.s.zone, 1), `${label}: zone de lecture identique à 1 px près ${detail()}`);
  assert.ok(Math.abs(after.s.scroll.left - before.s.scroll.left) <= 1 && Math.abs(after.s.scroll.top - before.s.scroll.top) <= 1,
    `${label}: défilement identique à 1 px près ${detail()}`);
}

for (const [sizeLabel, size] of SIZES) {
  for (const [mode, modeLabel] of MODES) {
    for (const zoomed of [false, true]) {
      scenario(`B1 — ${sizeLabel} ${size.join('×')}, ${modeLabel}, page ${zoomed ? 'zoomée' : 'ajustée'} : masquer/réafficher ne bouge rien (toucher, h, action+bouton)`, size, async r => {
        const fitted = await open(r, mode, 3);
        if (zoomed) {
          const z = await zoomBy(r, 3, 1.6);
          assert.ok(z.page.width >= fitted.page.width * 1.3, `précondition : page zoomée (${z.page.width.toFixed(1)} vs ajustée ${fitted.page.width.toFixed(1)})`);
        }
        const base = await state(r, 3);
        await expectToolbar(r, true, 'précondition : barres visibles');
        for (const [name, means] of MEANS) {
          const label = `${name}`;
          await means.hide(r, base.s);
          await expectToolbar(r, false, `${label} : barres masquées`);
          const hidden = await state(r, 3);
          assertSame(base, hidden, `${label} — barres masquées`);
          await means.show(r, hidden.s);
          await expectToolbar(r, true, `${label} : barres réaffichées`);
          assertSame(base, await state(r, 3), `${label} — barres réaffichées`);
        }
      });
    }
  }
}

// =====================================================================================
// B2 — la page ajustée garde la taille et la place qu'elle a avant LUM-17 (barres visibles)
// =====================================================================================
// Références mesurées en boîte noire sur la base 2dafa3d (reader-5-pages.pdf, page 3 ajustée, barres visibles,
// ouverte par open() : choix du mode, aller à la page 3, « Ajuster la page »). Taille à 1 px, position à 3 px.
const REF = {
  '800×1280': { [PAGED]: { left: 64, top: 171.6, width: 672, height: 940.8 }, [CONTINUOUS]: { left: 64, top: 178.3, width: 662, height: 926.8 } },
  '1280×800': { [PAGED]: { left: 395.7, top: 60, width: 488.6, height: 684 }, [CONTINUOUS]: { left: 390.7, top: 59.9, width: 488.6, height: 684 } },
  '1440×900': { [PAGED]: { left: 440, top: 60, width: 560, height: 784 }, [CONTINUOUS]: { left: 435, top: 59.6, width: 560, height: 784 } },
  '360×800': { [PAGED]: { left: 52, top: 222.8, width: 256, height: 358.4 }, [CONTINUOUS]: { left: 52, top: 229.5, width: 246, height: 344.4 } },
};
function assertRef(page, ref, label) {
  const detail = JSON.stringify({ attendu: ref, reçu: rounded(box(page)) });
  assert.ok(Math.abs(page.width - ref.width) <= 1 && Math.abs(page.height - ref.height) <= 1, `${label}: taille de la page ajustée conservée (1 px) ${detail}`);
  assert.ok(Math.abs(page.left - ref.left) <= 3 && Math.abs(page.top - ref.top) <= 3, `${label}: place de la page ajustée conservée (3 px) ${detail}`);
}

for (const [sizeLabel, size] of SIZES) {
  scenario(`B2 — ${sizeLabel} ${size.join('×')} : page 3 ajustée, barres visibles = taille et place de référence (Page par page et Continu)`, size, async r => {
    for (const [mode, modeLabel] of MODES) {
      const s = await open(r, mode, 3);
      await expectToolbar(r, true, `${modeLabel}: barres visibles`);
      assertRef(s.page, REF[size.join('×')][mode], `${modeLabel}`);
    }
  });
}

// =====================================================================================
// B3 — barres sans chevauchement de la page ajustée ; commandes ≥ 44×44 dans la fenêtre
// =====================================================================================
/** Géométrie de l'élément (this) et test de capture : le centre de la commande lui appartient bien (rien au-dessus). */
function geometry() {
  const b = this.getBoundingClientRect();
  const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
  return {
    left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height,
    inViewport: b.width > 0 && b.height > 0 && b.left >= -0.5 && b.right <= innerWidth + 0.5 && b.top >= -0.5 && b.bottom <= innerHeight + 0.5,
    reachable: Boolean(hit && this.contains(hit)),
  };
}
const rectOf = (r, selector) => r.evaluate(selector => {
  const e = document.querySelector(selector);
  if (!e) return null;
  const b = e.getBoundingClientRect();
  return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height };
}, selector);
const overlap = (a, b) => ({ x: Math.min(a.right, b.right) - Math.max(a.left, b.left), y: Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) });

const COMMANDS = [['button', 'Revenir à la bibliothèque'], ['button', FIT], ['button', 'Page précédente'], ['button', 'Page suivante'], ['spinbutton', PAGE], ['button', OUTLINE], ['button', TOOLS]];

for (const [sizeLabel, size] of SIZES) {
  scenario(`B3 — ${sizeLabel} ${size.join('×')} : en-tête au-dessus, pied en dessous, onglets hors de la page ajustée, commandes ≥ 44×44 (Page par page et Continu)`, size, async r => {
    for (const [mode, modeLabel] of MODES) {
      const s = await open(r, mode, 3);
      const page = s.page;
      const t = await toolbar(r);
      assert.ok(t.visible, `${modeLabel}: en-tête visible`);
      const header = await rectOf(r, '#reader-toolbar'), nav = await rectOf(r, NAV_SELECTOR);
      assert.ok(header && nav, `${modeLabel}: en-tête et pied présents`);
      assert.ok(header.bottom <= page.top + 1, `${modeLabel}: bas de l'en-tête (${header.bottom.toFixed(1)}) ≤ haut de la page ajustée (${page.top.toFixed(1)})`);
      assert.ok(nav.top >= page.bottom - 1, `${modeLabel}: haut du pied (${nav.top.toFixed(1)}) ≥ bas de la page ajustée (${page.bottom.toFixed(1)})`);
      const tabs = { [OUTLINE]: await r.control('button', OUTLINE, geometry), [TOOLS]: await r.control('button', TOOLS, geometry) };
      for (const [name, tab] of Object.entries(tabs)) {
        const o = overlap(tab, page);
        assert.ok(!(o.x > 1 && o.y > 1), `${modeLabel}: l'onglet « ${name} » ne recouvre pas la page ajustée (recouvrement ${o.x.toFixed(1)}×${o.y.toFixed(1)})`);
      }
      assert.ok(tabs[OUTLINE].right <= page.left + 1, `${modeLabel}: Sommaire à gauche de la page ajustée (droite ${tabs[OUTLINE].right.toFixed(1)} ≤ gauche de la page ${page.left.toFixed(1)})`);
      assert.ok(tabs[TOOLS].left >= page.right - 1, `${modeLabel}: Outils à droite de la page ajustée (gauche ${tabs[TOOLS].left.toFixed(1)} ≥ droite de la page ${page.right.toFixed(1)})`);
      for (const [role, name] of COMMANDS) {
        const d = await r.control(role, name, geometry);
        assert.ok(d.inViewport, `${modeLabel}: « ${name} » entièrement dans la fenêtre ${JSON.stringify(rounded(d))}`);
        assert.ok(d.width >= 44 && d.height >= 44, `${modeLabel}: « ${name} » ≥ 44×44 (reçu ${d.width.toFixed(1)}×${d.height.toFixed(1)})`);
        assert.ok(d.reachable, `${modeLabel}: « ${name} » reste au-dessus de la zone de lecture (capte le toucher en son centre)`);
      }
    }
  });
}

// =====================================================================================
// B4 — lisibilité par-dessus le PDF : en-tête, pied et onglets ont un fond opaque (alpha = 1)
// =====================================================================================
// Règle : l'élément, sinon son premier ancêtre au fond non transparent, doit avoir une couleur de fond d'alpha 1,
// recouvrir entièrement la boîte de l'élément (±1 px) et NE PAS contenir la zone de lecture (un fond partagé avec
// le conteneur du PDF est peint sous la page : il ne protège rien). Aucune image de fond, ombre ni flou exigés.
function opaqueBackground() {
  const alphaOf = c => {
    const slash = c.split('/');
    if (slash.length > 1) { const a = slash[1].replace(')', '').trim(); return a.endsWith('%') ? parseFloat(a) / 100 : parseFloat(a); }
    const m = c.match(/^rgba\(([^)]*)\)$/);
    return m ? parseFloat(m[1].split(',')[3]) : 1;
  };
  const zone = document.querySelector('.pdf-viewer-container');
  const mine = this.getBoundingClientRect();
  for (let e = this; e; e = e.parentElement) {
    const color = getComputedStyle(e).backgroundColor, a = alphaOf(color);
    if (a === 0) continue;
    const b = e.getBoundingClientRect();
    const covers = b.left <= mine.left + 1 && b.right >= mine.right - 1 && b.top <= mine.top + 1 && b.bottom >= mine.bottom - 1;
    const underZone = Boolean(zone) && e.contains(zone);
    const label = `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}`;
    return { ok: a === 1 && covers && !underZone, info: `${label} ${color} alpha=${a} recouvre=${covers} contient-la-zone=${underZone}` };
  }
  return { ok: false, info: 'aucun fond non transparent (élément et ancêtres)' };
}
const opaqueOf = (r, selector) => r.evaluate((src, selector) => (0, eval)(`(${src})`).call(document.querySelector(selector)), opaqueBackground.toString(), selector);

async function assertOpaqueBars(r, label) {
  const t = await toolbar(r);
  assert.ok(t.visible, `${label}: barres visibles`);
  const checks = [
    ['#reader-toolbar', await opaqueOf(r, '#reader-toolbar')],
    [`« ${NAV} »`, await opaqueOf(r, NAV_SELECTOR)],
    [`onglet « ${OUTLINE} »`, await r.control('button', OUTLINE, opaqueBackground)],
    [`onglet « ${TOOLS} »`, await r.control('button', TOOLS, opaqueBackground)],
  ];
  const failures = checks.filter(([, c]) => !c.ok).map(([name, c]) => `${name} — ${c.info}`);
  assert.deepEqual(failures, [], `${label}: fond opaque (alpha 1, recouvrant, hors du conteneur du PDF) requis pour chaque barre`);
}

for (const [sizeLabel, size] of [['tablette portrait', TABLET], ['PC', PC]]) {
  scenario(`B4 — ${sizeLabel} ${size.join('×')} : en-tête, pied et onglets au fond opaque, thème par défaut puis thème Nuit`, size, async r => {
    await assertOpaqueBars(r, 'thème par défaut');
    await openToolsPanel(r);
    await r.control('button', 'Nuit');
    await until(async () => {
      const pressed = await r.control('button', 'Nuit', function () { return this.getAttribute('aria-pressed'); });
      return { ok: pressed === 'true', info: { pressed } };
    }, 'thème Nuit activé');
    await closeToolsPanel(r);
    await pause(400);
    await assertOpaqueBars(r, 'thème Nuit');
  });
}

// =====================================================================================
// B5 (partie) — un toucher hors commande à ~25 px du bord de la fenêtre est un toucher de quart ;
//               un toucher sur un onglet reste une commande
// =====================================================================================
scenario('B5 — tablette portrait 800×1280, Page par page ajustée page 3 : toucher à 25 px du bord gauche → page 2, du bord droit → page 4', TABLET, async r => {
  const s = await open(r, PAGED, 3);
  const home = s.page;
  const tab = await r.control('button', OUTLINE, geometry);
  const y = Math.round(s.zone.top + s.zone.height * 0.25);
  assert.ok(Math.abs(y - (tab.top + tab.bottom) / 2) > 150, `précondition : le toucher est loin du centre de l'onglet (y=${y}, onglet ${tab.top.toFixed(0)}–${tab.bottom.toFixed(0)})`);
  await tap(r, { x: 25, y });
  await expectHome(r, 2, home, 'toucher à 25 px du bord gauche → page 2, à la place de la page ajustée');
  await expectToolbar(r, true, 'barres toujours visibles (ce n’est pas un toucher central)');
  await go(r, 3);
  await tap(r, { x: TABLET[0] - 25, y });
  await expectHome(r, 4, home, 'toucher à 25 px du bord droit → page 4, à la place de la page ajustée');
  await expectToolbar(r, true, 'barres toujours visibles (ce n’est pas un toucher central)');
});

scenario('B5 — tablette portrait 800×1280 : un toucher sur l’onglet « Sommaire » ou « Outils de lecture » ouvre son panneau sans changer de page', TABLET, async r => {
  await open(r, PAGED, 3);
  for (const name of [OUTLINE, TOOLS]) {
    const tab = await r.control('button', name, geometry);
    await tap(r, { x: (tab.left + tab.right) / 2, y: (tab.top + tab.bottom) / 2 });
    await until(async () => {
      const expanded = await r.control('button', name, function () { return this.getAttribute('aria-expanded'); });
      return { ok: expanded === 'true', info: { name, expanded } };
    }, `toucher sur l’onglet « ${name} » : panneau ouvert (aria-expanded=true)`);
    assert.equal(await counter(r), 3, `l’onglet « ${name} » n’a pas tourné de page`);
    await expectToolbar(r, true, `l’onglet « ${name} » n’a pas masqué les barres`);
    await r.key('Escape', 'Escape', 27);
    await until(async () => {
      const expanded = await r.control('button', name, function () { return this.getAttribute('aria-expanded'); });
      return { ok: expanded === 'false', info: { name, expanded } };
    }, `« ${name} » refermé par Escape`);
  }
  await pause(300);
  assert.equal(await counter(r), 3, 'toujours page 3');
});

// =====================================================================================
// B7 (une vérification) — l'emplacement réservé suit la largeur : le redimensionnement garde l'ajustement de référence
// =====================================================================================
scenario('B7 — Page par page ajustée page 3 : 800×1280 → 360×800 → 1280×800 retombe sur les références d’ajustement', TABLET, async r => {
  await open(r, PAGED, 3);
  for (const [label, size] of [['petit écran', PHONE], ['tablette paysage', LANDSCAPE]]) {
    await r.resize(size[0], size[1]);
    const ref = REF[size.join('×')][PAGED];
    await until(async () => {
      const s = await snap(r, 3);
      return { ok: Boolean(s?.page) && Math.abs(s.page.width - ref.width) <= 1 && Math.abs(s.page.height - ref.height) <= 1 && Math.abs(s.page.left - ref.left) <= 3 && Math.abs(s.page.top - ref.top) <= 3,
        info: { attendu: ref, reçu: rounded(s?.page && box(s.page)) } };
    }, `après redimensionnement en ${label} : page ajustée à la référence`, 6_000);
    await expectCounter(r, 3, `${label}: page courante conservée`);
  }
});

// =====================================================================================
// Après revue 1 — B8 : haut et bas dégageables (réserve en-tête ≈ 52 px, pied ≈ 48 px)
// =====================================================================================
// Décision utilisateur : sur l'axe vertical, quand le document dépasse la zone, le défilement s'arrête avec le haut du
// document sous l'en-tête et le bas au-dessus du pied, barres visibles OU masquées (réserve constante, B1 inchangée).
// Les bornes sont celles de gesture-kit (assertEdge : écart ≥ réserve − 2 px et ≤ réserve + 24 px). Rouge attendu avant correction.
async function assertReserveMatchesBars(r, label) {
  const header = await rectOf(r, '#reader-toolbar'), nav = await rectOf(r, NAV_SELECTOR);
  assert.ok(header && nav, `${label}: en-tête et pied présents`);
  const innerH = await r.evaluate(() => innerHeight);
  assert.ok(Math.abs(header.bottom - RESERVE.top) <= EPS, `${label}: la réserve haute (${RESERVE.top}) = hauteur de l'en-tête (${header.bottom.toFixed(1)})`);
  assert.ok(Math.abs((innerH - nav.top) - RESERVE.bottom) <= EPS, `${label}: la réserve basse (${RESERVE.bottom}) = hauteur du pied (${(innerH - nav.top).toFixed(1)})`);
}
const hideWithH = async r => {
  await r.evaluate(() => document.activeElement?.blur());
  await pressKey(r, 'h', 'KeyH', 72);
  await expectToolbar(r, false, 'barres masquées (h)');
};

async function assertExtremes(r, n, doc, label) {
  assertEdge(await scrollExtreme(r, n, { y: -1 }, doc), 'top', doc, `${label}: haut atteint`);
  assertEdge(await scrollExtreme(r, n, { y: 1 }, doc), 'bottom', doc, `${label}: bas atteint`);
}

for (const [sizeLabel, size] of [['tablette paysage', LANDSCAPE], ['tablette portrait', TABLET], ['PC', PC]]) {
  scenario(`B8 — ${sizeLabel} ${size.join('×')}, Continu : page 1 ajustée sous l'en-tête, dernière page au-dessus du pied, puis zoomé, barres visibles et masquées`, size, async r => {
    // Première page : aller à 1 puis « Ajuster la page ».
    let s = await open(r, CONTINUOUS, 1);
    await assertReserveMatchesBars(r, 'barres visibles');
    assertEdge(s, 'top', 'column', 'Continu, page 1 ajustée (barres visibles) : haut sous l\'en-tête');
    // Dernière page : le bas ne passe pas sous le pied.
    s = await open(r, CONTINUOUS, 5);
    assert.ok(gaps(s, 'column').bottom >= RESERVE.bottom - EPS, `Continu, page 5 ajustée : bas au-dessus du pied ${JSON.stringify({ zone: rounded(s.zone), page: rounded(s.page) })}`);
    await assertExtremes(r, 5, 'column', 'Continu ajusté, barres visibles');
    // Barres masquées : la réserve est constante.
    await hideWithH(r);
    await assertExtremes(r, 5, 'column', 'Continu ajusté, barres masquées');
    await pressKey(r, 'h', 'KeyH', 72);
    await expectToolbar(r, true, 'barres réaffichées');
    // Colonne zoomée.
    await zoomBy(r, 5, 1.5);
    await assertExtremes(r, 5, 'column', 'Continu zoomé, barres visibles');
    await hideWithH(r);
    await assertExtremes(r, 5, 'column', 'Continu zoomé, barres masquées');
  });
}

for (const [sizeLabel, size] of [['tablette portrait', TABLET], ['PC', PC]]) {
  scenario(`B8 — ${sizeLabel} ${size.join('×')}, Page par page zoomée : haut et bas dégageables, barres visibles et masquées`, size, async r => {
    await open(r, PAGED, 3);
    const z = await zoomBy(r, 3, 1.8);
    assert.ok(z.page.height > z.zone.height + 40, `précondition : la page zoomée dépasse verticalement ${JSON.stringify({ page: rounded(z.page), zone: rounded(z.zone) })}`);
    await assertReserveMatchesBars(r, 'barres visibles');
    await assertExtremes(r, 3, 'page', 'Page par page zoomée, barres visibles');
    await hideWithH(r);
    await assertExtremes(r, 3, 'page', 'Page par page zoomée, barres masquées');
  });
}

// =====================================================================================
// B9 — barres limitées à l'espace de lecture : panneau IA et alerte d'enregistrement
// =====================================================================================
const ASK = 'Posez une question...';
/** Géométrie du panneau IA (colonne pleine hauteur qui contient la saisie) et points de saisie masqués par un autre élément. */
function assistantGeometry() {
  let panel = this;
  while (panel.parentElement && !(panel.getBoundingClientRect().height >= innerHeight * 0.9 && panel.getBoundingClientRect().width < innerWidth)) panel = panel.parentElement;
  const rect = e => { const b = e.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom }; };
  const blocked = e => {
    const b = e.getBoundingClientRect();
    const points = [['centre', b.left + b.width / 2, b.top + b.height / 2], ['haut', b.left + b.width / 2, b.top + 3], ['bas', b.left + b.width / 2, b.bottom - 3],
      ['gauche', b.left + 3, b.top + b.height / 2], ['droite', b.right - 3, b.top + b.height / 2]];
    return points.filter(([, x, y]) => { const hit = document.elementFromPoint(x, y); return !(hit && e.contains(hit)); }).map(([name]) => name);
  };
  const buttons = [...panel.querySelectorAll('button')].filter(e => e.getClientRects().length)
    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  const [close, send] = [buttons[0], buttons.at(-1)];
  return {
    panel: rect(panel), textarea: { rect: rect(this), blocked: blocked(this) },
    close: close && { rect: rect(close), blocked: blocked(close) }, send: send && send !== close && { rect: rect(send), blocked: blocked(send) },
  };
}
async function openAssistant(r) {
  await openToolsPanel(r);
  await r.control('button', 'Ouvrir l’assistant IA', function () { this.scrollIntoView({ block: 'center' }); });
  await pause(150);
  await r.control('button', 'Ouvrir l’assistant IA');
  await until(async () => ({ ok: await r.hasControl('textbox', ASK), info: 'saisie du panneau IA' }), 'panneau IA ouvert (zone de saisie)');
  await pause(300);
}

for (const [sizeLabel, size] of [['tablette portrait', TABLET], ['PC', PC]]) {
  scenario(`B9 — ${sizeLabel} ${size.join('×')} : le panneau IA ouvert n'est pas recouvert par l'en-tête ni le pied ; sa fermeture se clique`, size, async r => {
    await open(r, PAGED, 3);
    await openAssistant(r);
    await expectToolbar(r, true, 'barres visibles avec le panneau IA ouvert');
    const g = await r.control('textbox', ASK, assistantGeometry);
    assert.ok(g.close && g.send, `fermeture et envoi trouvés dans le panneau ${JSON.stringify(g)}`);
    const covered = [['fermeture', g.close], ['saisie', g.textarea], ['envoi', g.send]].filter(([, c]) => c.blocked.length)
      .map(([name, c]) => `« ${name} » : points interceptés ${c.blocked.join('/')} (rect ${JSON.stringify(rounded(c.rect))})`);
    assert.deepEqual(covered, [], 'panneau IA : fermeture, saisie et envoi ni masquées ni interceptées par un autre élément');
    for (const [name, bar] of [['l\'en-tête', await rectOf(r, '#reader-toolbar')], ['le pied', await rectOf(r, NAV_SELECTOR)]]) {
      const o = overlap(bar, g.panel);
      assert.ok(!(o.x > 1 && o.y > 1), `${name} ne recouvre pas le panneau IA (recouvrement ${o.x.toFixed(1)}×${o.y.toFixed(1)} ; panneau ${JSON.stringify(rounded(g.panel))})`);
    }
    // Clic réel (souris de confiance) sur la fermeture : le panneau se ferme.
    const x = (g.close.rect.left + g.close.rect.right) / 2, y = (g.close.rect.top + g.close.rect.bottom) / 2;
    await r.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await r.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await r.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await until(async () => ({ ok: !await r.hasControl('textbox', ASK), info: 'panneau IA encore ouvert' }), 'clic sur la fermeture : le panneau IA se ferme');
  });
}

/** Alertes (role=alert) visibles : géométrie, présence dans la fenêtre et points interceptés par un autre élément. */
const alertGeometry = r => r.evaluate(() => [...document.querySelectorAll('[role="alert"]')]
  .filter(e => { const b = e.getBoundingClientRect(), s = getComputedStyle(e); return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && e.textContent.trim(); })
  .map(e => {
    const b = e.getBoundingClientRect();
    const points = [['centre', b.left + b.width / 2, b.top + b.height / 2], ['haut', b.left + b.width / 2, b.top + 3], ['bas', b.left + b.width / 2, b.bottom - 3],
      ['gauche', b.left + 3, b.top + b.height / 2], ['droite', b.right - 3, b.top + b.height / 2]];
    return {
      text: e.textContent.trim().slice(0, 80), rect: { left: b.left, top: b.top, right: b.right, bottom: b.bottom },
      inWindow: b.left >= -0.5 && b.top >= -0.5 && b.right <= innerWidth + 0.5 && b.bottom <= innerHeight + 0.5,
      blocked: points.filter(([, x, y]) => { const hit = document.elementFromPoint(x, y); return !(hit && e.contains(hit)); }).map(([name]) => name),
    };
  }));

for (const [sizeLabel, size] of [['tablette paysage', LANDSCAPE], ['tablette portrait', TABLET]]) {
  test(`B9 — ${sizeLabel} ${size.join('×')} : l'alerte d'enregistrement (role=alert) est entièrement visible, non recouverte par l'en-tête`, { timeout: 90_000 }, async () => {
    // Échec d'enregistrement simulé (quota) comme dans tests/storage.test.mjs (g1/g2) : sonde de storage-cdp.mjs.
    const r = await createSession(browser, { width: size[0], height: size[1], init: [PROBES] });
    try {
      await r.load();
      await r.evaluate(() => { window.__failPut = true; });
      await r.openPdf(FIVE, 'library');
      await until(async () => { const a = await visibleAlerts(r); return { ok: a.length > 0, info: a }; }, 'alerte visible (role="alert") après l\'échec d\'enregistrement', 10_000);
      await pause(400);
      const header = await r.evaluate(() => { const b = document.querySelector('#reader-toolbar')?.getBoundingClientRect(); return b && { bottom: b.bottom, height: b.height }; });
      assert.ok(header && header.height > 0, 'précondition : un document est ouvert, l\'en-tête est affiché');
      const alerts = await alertGeometry(r);
      assert.ok(alerts.length > 0, 'alerte présente');
      for (const a of alerts) {
        assert.ok(a.inWindow, `alerte « ${a.text} » entièrement dans la fenêtre ${JSON.stringify(rounded(a.rect))}`);
        assert.deepEqual(a.blocked, [], `alerte « ${a.text} » non recouverte (points interceptés ; rect ${JSON.stringify(rounded(a.rect))} ; en-tête jusqu'à ${header.bottom.toFixed(1)})`);
      }
    } finally { await r.close(); }
  });
}

// =====================================================================================
// B4 précisé — fond des onglets opaque aussi au survol de la souris (Jour et Nuit)
// =====================================================================================
// Le lanceur partagé ne déclare aucun pointeur : `@media (hover: hover)` y est faux. On lance Edge avec un pointeur fin
// (tests/helpers/hover-browser.mjs) et la précondition vérifie que le survol est bien actif (jamais de vert à vide).
test('B4 survol — PC 1440×900 : le fond des onglets « Sommaire » et « Outils de lecture » reste opaque au survol souris, Jour et Nuit', { timeout: 120_000 }, async () => {
  const mouse = await launchWithMouse();
  try {
    const r = await openReader(mouse, PC[0], PC[1], FIVE);
    try {
      await reloadWithMouse(r, FIVE);
      assert.equal(await r.evaluate(() => matchMedia('(hover: hover)').matches), true, 'précondition : le navigateur déclare un pointeur capable de survol');
      for (const theme of ['Jour', 'Nuit']) {
        await openToolsPanel(r);
        await r.control('button', theme, function () { this.scrollIntoView({ block: 'center' }); });
        await pause(150);
        await r.control('button', theme);
        await closeToolsPanel(r);
        await pause(300);
        for (const name of [OUTLINE, TOOLS]) {
          const c = await r.control('button', name, geometry);
          const p = { x: (c.left + c.right) / 2, y: (c.top + c.bottom) / 2 };
          await r.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x - 30, y: p.y });
          await r.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
          await pause(450);
          const hovered = await r.control('button', name, function () { return this.matches(':hover'); });
          assert.equal(hovered, true, `précondition : l'onglet « ${name} » est survolé (${theme})`);
          const o = await r.control('button', name, opaqueBackground);
          assert.ok(o.ok, `thème ${theme}, onglet « ${name} » survolé : fond opaque (alpha 1, recouvrant, hors du conteneur du PDF) — ${o.info}`);
        }
      }
    } finally { await r.close(); }
  } finally { await mouse.close(); }
});

// =====================================================================================
// B7 précisé — seuil 760 px franchi sans changement de taille de la zone
// =====================================================================================
// Page par page, 1150×1280, panneau IA ouvert (zone ≈ 730 px), page ajustée ; redimensionnement direct à 730×1280
// (le panneau IA passe en superposition, la zone reste ≈ 730 px). Après fermeture de l'IA, l'ajustement doit suivre la
// réserve de 44 px (sous 760 px) : même largeur qu'une page ajustée ouverte directement à 730×1280.
test('B7 seuil — Page par page ajustée, 1150×1280 avec IA ouverte → 730×1280 puis IA fermée : ajustement de la réserve de 44 px', { timeout: 150_000 }, async () => {
  const ref = await openReader(browser, 730, 1280, FIVE);
  let expected;
  try { expected = (await open(ref, PAGED, 3)).page; } finally { await ref.close(); }
  assert.ok(Math.abs(expected.width - 626) <= 1, `référence 730×1280 : largeur de page ajustée ≈ 626 (reçu ${expected.width.toFixed(1)})`);
  const r = await openReader(browser, 1150, 1280, FIVE);
  try {
    await open(r, PAGED, 3);
    await openAssistant(r);
    await fit(r);
    const before = await settle(r, 3);
    const zoneBefore = before.zone.width;
    assert.ok(zoneBefore > 700 && zoneBefore < 760, `précondition : la zone avec l'IA ouverte fait ≈ 730 px (reçu ${zoneBefore})`);
    await r.resize(730, 1280);
    await pause(600);
    const resized = await settle(r, 3);
    assert.ok(Math.abs(resized.zone.width - zoneBefore) <= 12, `précondition : la zone garde ≈ la même largeur (avant ${zoneBefore}, après ${resized.zone.width})`);
    const g = await r.control('textbox', ASK, assistantGeometry);
    assert.ok(g.close, 'panneau IA toujours ouvert après le redimensionnement : bouton de fermeture trouvé');
    const x = (g.close.rect.left + g.close.rect.right) / 2, y = (g.close.rect.top + g.close.rect.bottom) / 2;
    await r.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await r.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await r.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await until(async () => ({ ok: !await r.hasControl('textbox', ASK), info: 'panneau IA encore ouvert' }), 'panneau IA fermé');
    await until(async () => {
      const s = await snap(r, 3);
      return { ok: Boolean(s?.page) && Math.abs(s.page.width - expected.width) <= 1 && Math.abs(s.page.height - expected.height) <= 1, info: { attendu: rounded(box(expected)), reçu: rounded(s?.page && box(s.page)) } };
    }, 'après fermeture de l\'IA : page ajustée = référence 730×1280 (réserve de 44 px)', 6_000);
    await expectCounter(r, 3, 'page courante conservée');
  } finally { await r.close(); }
});
