// LUM-13, lot 1 — gestes et espace autour du document. Tests navigateur en boîte noire :
// géométrie réellement visible (getBoundingClientRect), compteur public et commandes accessibles.
// Les gestes sont simulés par CDP (toucher, molette, souris) : ils ne prouvent ni l’inertie
// native ni la fluidité sur appareil. Garanties G1 à G8 de docs/features/LUM-13-passe-ux.md.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { launch, openReader } from './reader-cdp.mjs';
import { writeLinkedPdf, LINKS } from './helpers/linked-pdf.mjs';
import {
  CONTINUOUS, PAGED, TOOLS, NOTE, SHOW_BAR, MARGIN, EPS,
  pause, until, snap, settle, near, rounded, counter, expectHome, expectCounter, stays,
  gaps, edgeOk, assertEdge, assertCentered, zonePoint, mode, go, open,
  expectToolbar, toolbar, markers, touch, stroke, release, tap, click, wheel, wheelBurst, pinch,
  zoomBy, place, scrollExtreme,
} from './helpers/gesture-kit.mjs';

const five = fileURLToPath(new URL('./fixtures/reader-5-pages.pdf', import.meta.url));
const linked = await writeLinkedPdf();
after(() => linked.cleanup());

const TABLET = [800, 1280], LANDSCAPE = [1280, 800], PC = [1440, 900];

function suite(name, timeout, body) {
  test(name, { timeout }, async t => {
    const browser = await launch();
    t.after(() => browser.close());
    const scenario = (title, size, fn, pdf = five) => t.test(title, { timeout: 120_000 }, async t => {
      const r = await openReader(browser, size[0], size[1], pdf);
      t.after(() => r.close());
      await fn(r);
    });
    await body(scenario);
  });
}

// Axes : le document agrandi dépasse-t-il la zone ?
const exceeds = (s, doc) => ({ x: s[doc].width > s.zone.width + 1, y: s[doc].height > s.zone.height + 1 });
const widthKept = (s, n, width, label) => assert.ok(s.page && Math.abs(s.page.width - width) <= EPS,
  `${label}: zoom conservé ${JSON.stringify({ expected: width, got: s.page?.width })}`);
const pressKey = (r, key, code, vk) => r.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, text: key, unmodifiedText: key })
  .then(() => r.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk }));

// =====================================================================================
// G1 — espace borné
// =====================================================================================
suite('G1 — espace borné (aucun vide, aucun défilement inutile)', 900_000, async scenario => {
  for (const [label, size] of [['tablette portrait', TABLET], ['tablette paysage', LANDSCAPE], ['PC', PC]]) {
    await scenario(`${label}: Page par page ajustée — aucun défilement, page centrée, glissements vertical/diagonal sans décalage`, size, async r => {
      const s = await open(r, PAGED, 3);
      const home = s.page;
      assert.ok(s.scroll.rangeX <= 1 && s.scroll.rangeY <= 1, `aucune plage de défilement ${JSON.stringify(rounded(s.scroll))}`);
      assertCentered(s, 'page', 'xy', 'page ajustée');
      const c = zonePoint(s, 0.5, 0.5);
      // Vertical pur : la page ne bouge pas pendant le geste ni après.
      await stroke(r, { x: c.x, y: c.y + s.zone.height * 0.3, dy: -s.zone.height * 0.55, end: 'none' });
      const during = await snap(r, 3);
      assert.ok(Math.abs(during.page.left - home.left) <= 3 && Math.abs(during.page.top - home.top) <= 3,
        `glissement vertical : la page ne se déplace pas ${JSON.stringify({ home: rounded(home), during: rounded(during.page) })}`);
      await release(r);
      await expectHome(r, 3, home, 'après glissement vertical : page en place, page 3');
      // Diagonale à dominante verticale, dans les deux sens.
      await stroke(r, { x: c.x + 40, y: c.y + s.zone.height * 0.3, dx: -60, dy: -s.zone.height * 0.45 });
      await expectHome(r, 3, home, 'après diagonale vers le haut-gauche : page en place');
      await stroke(r, { x: c.x - 40, y: c.y - s.zone.height * 0.3, dx: 50, dy: s.zone.height * 0.45 });
      await expectHome(r, 3, home, 'après diagonale vers le bas-droite : page en place');
      const end = await snap(r, 3);
      assert.ok(end.scroll.rangeX <= 1 && end.scroll.rangeY <= 1, 'toujours aucune plage de défilement');
    });

    await scenario(`${label}: Continu ajusté — aucun défilement horizontal, colonne centrée, bornes verticales sans vide`, size, async r => {
      const s = await open(r, CONTINUOUS, 3);
      assert.ok(s.scroll.rangeX <= 1, `aucune plage horizontale ${JSON.stringify(rounded(s.scroll))}`);
      assertCentered(s, 'column', 'x', 'colonne ajustée');
      const c = zonePoint(s, 0.5, 0.5);
      await wheel(r, c, { dx: 600 });
      await wheel(r, c, { dx: -600 });
      await stroke(r, { x: c.x + 150, y: c.y, dx: -300, dy: 40 });
      await pause(300);
      const after = await snap(r, 3);
      assert.ok(after.scroll.rangeX <= 1 && Math.abs(after.scroll.left) <= 1, `défilement horizontal impossible ${JSON.stringify(rounded(after.scroll))}`);
      assert.ok(Math.abs(after.column.left - s.column.left) <= EPS, 'la colonne ne dérive pas latéralement (molette, trackpad, doigt)');
      // Bornes verticales : jamais plus de 24 px de vide au-delà des pages extrêmes.
      await wheel(r, c, { dy: 40_000 });
      assertEdge(await settle(r, 3, { doc: 'column' }), 'bottom', 'column', 'fin du document (molette)');
      await wheel(r, c, { dy: -40_000 });
      assertEdge(await settle(r, 3, { doc: 'column' }), 'top', 'column', 'début du document (molette)');
    });
  }

  for (const [label, size] of [['tablette portrait', TABLET], ['PC', PC]]) {
    await scenario(`${label}: Page par page agrandie — défilement borné aux deux extrémités, vertical au doigt`, size, async r => {
      await open(r, PAGED, 3);
      const z = await zoomBy(r, 3, 1.8);
      const need = exceeds(z, 'page');
      assert.ok(need.y, 'précondition : la page agrandie dépasse verticalement');
      const c = zonePoint(z, 0.5, 0.5);
      // Au doigt, vertical seulement (un geste vertical ne tourne jamais) : 4 glissements vers chaque extrémité.
      for (let i = 0; i < 4; i++) await stroke(r, { x: c.x, y: z.zone.top + z.zone.height * 0.9, dy: -z.zone.height * 0.8 });
      let s = await settle(r, 3);
      assertEdge(s, 'bottom', 'page', 'bas de la page (doigt)');
      for (let i = 0; i < 4; i++) await stroke(r, { x: c.x, y: z.zone.top + z.zone.height * 0.1, dy: z.zone.height * 0.8 });
      s = await settle(r, 3);
      assertEdge(s, 'top', 'page', 'haut de la page (doigt)');
      assert.equal(await counter(r), 3, 'les glissements verticaux ne tournent pas de page');
      // Extrêmes horizontaux (défilement programmatique du conteneur) et plage sur l’axe qui tient.
      for (const [dir, side] of [[-1, 'left'], [1, 'right']]) {
        s = await scrollExtreme(r, 3, { x: dir });
        if (need.x) assertEdge(s, side, 'page', `bord ${side}`);
        else {
          assertCentered(s, 'page', 'x', 'page qui tient en largeur');
          assert.ok(s.scroll.rangeX <= 1, 'aucun défilement horizontal quand la page tient en largeur');
        }
      }
      for (const [dir, side] of [[1, 'bottom'], [-1, 'top']]) assertEdge(await scrollExtreme(r, 3, { y: dir }), side, 'page', `bord ${side} (extrême)`);
    });
  }

  await scenario('tablette portrait: Continu agrandi — défilement borné sur les quatre bords (molette/trackpad)', TABLET, async r => {
    await open(r, CONTINUOUS, 3);
    const z = await zoomBy(r, 3, 1.8);
    const c = zonePoint(z, 0.5, 0.5);
    assert.ok(exceeds(z, 'column').x && exceeds(z, 'column').y, 'précondition : la colonne agrandie dépasse');
    for (const [axis, delta, side] of [['dx', 9000, 'right'], ['dx', -9000, 'left'], ['dy', 40_000, 'bottom'], ['dy', -40_000, 'top']]) {
      await wheel(r, c, { [axis]: delta });
      assertEdge(await settle(r, 3, { doc: 'column' }), side, 'column', `Continu agrandi, bord ${side}`);
    }
  });
});

// =====================================================================================
// G2 — zoom ancré (garantie ajustée)
// =====================================================================================
suite('G2 — zoom ancré sur les axes où le document dépasse', 600_000, async scenario => {
  const anchored = (before, after, p, doc, label, { fx = null } = {}) => {
    const b = before.page, ax = after.zone;
    const x = after.page.left + (p.x - b.left) / b.width * after.page.width;
    const y = after.page.top + (p.y - b.top) / b.height * after.page.height;
    const over = exceeds(after, doc);
    const out = { over, dx: x - p.x, dy: y - p.y };
    if (over.x) assert.ok(Math.abs(out.dx) <= 8, `${label}: ancrage horizontal ${JSON.stringify(rounded(out))}`);
    else assertCentered(after, doc, 'x', `${label}: centré horizontalement (tient en largeur)`, 4);
    if (over.y) assert.ok(Math.abs(out.dy) <= 8, `${label}: ancrage vertical ${JSON.stringify(rounded(out))}`);
    else assertCentered(after, doc, 'y', `${label}: centré verticalement (tient en hauteur)`, 4);
    return out;
  };

  for (const name of [PAGED, CONTINUOUS]) {
    await scenario(`tablette portrait ${name}: Ctrl+molette ancrée au curseur (les deux axes dépassent)`, TABLET, async r => {
      const before = await open(r, name, 3);
      const doc = name === PAGED ? 'page' : 'column';
      const p = { x: before.page.left + before.page.width * 0.65, y: Math.max(before.zone.top + 80, Math.min(before.zone.bottom - 80, (before.page.top + before.page.bottom) / 2)) };
      assert.ok(p.x > before.zone.left && p.x < before.zone.right, 'curseur dans la zone');
      const after = await zoomBy(r, 3, 1.8, p);
      assert.ok(exceeds(after, doc).x && exceeds(after, doc).y, `précondition : le document agrandi dépasse sur les deux axes ${JSON.stringify(rounded(after.zone))}`);
      anchored(before, after, p, doc, `Ctrl+molette ${name}`);
    });
  }

  for (const [label, size] of [['PC', PC], ['tablette paysage', LANDSCAPE]]) {
    await scenario(`${label} Page par page: page qui tient en largeur reste centrée ; verticalement ancrée`, size, async r => {
      const before = await open(r, PAGED, 3);
      const p = { x: before.page.left + before.page.width * 0.75, y: (before.page.top + before.page.bottom) / 2 };
      const after = await zoomBy(r, 3, 1.5, p);
      assert.ok(after.page.width < after.zone.width - 40 && after.page.height > after.zone.height + 40,
        `précondition : tient en largeur, dépasse en hauteur ${JSON.stringify({ page: rounded(after.page), zone: rounded(after.zone) })}`);
      const out = anchored(before, after, p, 'page', 'Ctrl+molette');
      assert.ok(out.over.y && !out.over.x);
    });
  }

  for (const name of [PAGED, CONTINUOUS]) {
    await scenario(`tablette portrait ${name}: pincement ancré au milieu des doigts`, TABLET, async r => {
      const before = await open(r, name, 3);
      const doc = name === PAGED ? 'page' : 'column';
      const p = { x: before.page.left + before.page.width * 0.6, y: (before.zone.top + before.zone.bottom) / 2 };
      await pinch(r, p, 200, 400);
      await until(async () => { const s = await snap(r, 3); return { ok: s?.page?.width > before.page.width * 1.5, info: rounded(s?.page) }; }, 'le pincement agrandit réellement');
      const after = await settle(r, 3);
      assert.ok(exceeds(after, doc).x && exceeds(after, doc).y, 'précondition : dépasse sur les deux axes');
      anchored(before, after, p, doc, `pincement ${name}`);
    });
  }

  await scenario('tablette portrait Page par page: près d’un bord, un dézoom ne crée pas de vide (horizontal)', TABLET, async r => {
    await open(r, PAGED, 3);
    let s = await zoomBy(r, 3, 2.0);
    s = await place(r, 3, 'right', 0);
    const p = zonePoint(s, 0.15, 0.5);
    await wheel(r, p, { dy: 100, ctrl: true });
    await pause(400);
    s = await settle(r, 3);
    assert.ok(s.page.width > s.zone.width + 40, `précondition : reste plus large que la zone ${JSON.stringify(rounded(s.page))}`);
    assertEdge(s, 'right', 'page', 'après dézoom près du bord droit');
    assert.ok(gaps(s).left <= 0, 'après dézoom, bord gauche encore hors vide');
  });

  await scenario('tablette portrait Page par page: près d’un bord, un dézoom ne crée pas de vide (vertical)', TABLET, async r => {
    await open(r, PAGED, 3);
    let s = await zoomBy(r, 3, 2.0);
    s = await place(r, 3, 'bottom', 0);
    const p = zonePoint(s, 0.5, 0.1);
    await wheel(r, p, { dy: 100, ctrl: true });
    await pause(400);
    s = await settle(r, 3);
    assert.ok(s.page.height > s.zone.height + 40, 'précondition : reste plus haute que la zone');
    assertEdge(s, 'bottom', 'page', 'après dézoom près du bas');
    assert.ok(gaps(s).top <= 0, 'après dézoom, haut encore hors vide');
  });
});

// =====================================================================================
// G3 — aimant d’ajustement
// =====================================================================================
suite('G3 — aimant d’ajustement en fin de pincement', 600_000, async scenario => {
  const cases = [
    ['pincement +5 % → retour exact à l’ajustement', 210, 1.025, 1.075, true],
    ['pincement −6 % → retour exact à l’ajustement', 188, 0.925, 0.975, true],
    ['pincement +15 % → échelle conservée (hors aimant)', 230, 1.10, 2, false],
  ];
  for (const name of [PAGED, CONTINUOUS]) {
    const doc = name === PAGED ? 'page' : 'column';
    for (const [title, d1, low, high, snapsBack] of cases) {
      await scenario(`tablette portrait ${name}: ${title}`, TABLET, async r => {
        const start = await open(r, name, 3);
        const fitWidth = start.page.width;
        const p = zonePoint(start, 0.5, 0.5);
        const width = async () => (await snap(r, 3)).page.width;
        await pinch(r, p, 200, d1, { steps: 4, end: false });
        await pause(300);
        const reached = await width() / fitWidth;
        assert.ok(reached > low && reached < high, `précondition : échelle atteinte ${reached.toFixed(3)} × l’ajustement, attendu dans (${low}, ${high})`);
        await release(r);
        if (snapsBack) {
          await until(async () => { const w = await width(); return { ok: Math.abs(w - fitWidth) <= 1.5, info: { width: w, fitWidth } }; }, 'retour à la taille ajustée (±1,5 px)', 3_000);
          const s = await settle(r, 3, { doc });
          assertCentered(s, doc, name === PAGED ? 'xy' : 'x', 'document recentré après l’aimant');
        } else {
          await pause(700);
          const kept = await width() / fitWidth;
          assert.ok(kept > 1.1 && Math.abs(kept - reached) < 0.04, `échelle conservée (avant ${reached.toFixed(3)}, après ${kept.toFixed(3)})`);
        }
      });
    }
  }
});

// =====================================================================================
// G4 — tourner une page ajustée (Page par page)
// =====================================================================================
suite('G4 — tourner une page ajustée au doigt', 900_000, async scenario => {
  const ready = async (r, n = 3) => {
    const s = await open(r, PAGED, n);
    return { s, home: s.page, L: zonePoint(s, 0.85, 0.5), R: zonePoint(s, 0.15, 0.5) };
  };
  const turned = async (r, n, home, label) => expectHome(r, n, home, label);

  await scenario('tablette portrait: la page suit le doigt avant le relâchement (gauche et droite), sans changer de page', TABLET, async r => {
    const { home, L, R } = await ready(r);
    await stroke(r, { ...L, dx: -150, steps: 5, interval: 30, end: 'none' });
    let found = await until(async () => {
      const s = await snap(r, 3);
      const d = s?.page ? s.page.left - home.left : NaN;
      return { ok: d <= -30 && d >= -165 && Math.abs(s.page.top - home.top) <= 3, info: { shift: d, home: rounded(home), page: rounded(s?.page) } };
    }, 'la page suit le doigt vers la gauche (≈ le déplacement du doigt)');
    assert.equal(await counter(r), 3, 'aucun changement de page avant le relâchement');
    await touch(r, 'touchCancel');
    await expectHome(r, 3, home, 'après annulation : page en place');
    await stroke(r, { ...R, dx: 150, steps: 5, interval: 30, end: 'none' });
    found = await until(async () => {
      const s = await snap(r, 3);
      const d = s?.page ? s.page.left - home.left : NaN;
      return { ok: d >= 30 && d <= 165 && Math.abs(s.page.top - home.top) <= 3, info: { shift: d } };
    }, 'la page suit le doigt vers la droite');
    assert.equal(await counter(r), 3, 'aucun changement de page avant le relâchement (droite)');
    await touch(r, 'touchCancel');
    await expectHome(r, 3, home, 'après annulation (droite) : page en place');
  });

  await scenario('tablette portrait: un glissement diagonal à ~35° et 40° tourne d’une page (suivante puis précédente)', TABLET, async r => {
    const { home, L, R, s } = await ready(r);
    await stroke(r, { ...L, dx: -300, dy: -210 });
    await turned(r, 4, home, '35° vers la gauche → page suivante, bien posée');
    await stays(r, 4, 'un seul tour', 600);
    await stroke(r, { x: R.x, y: s.zone.top + s.zone.height * 0.4, dx: 300, dy: 250 });
    await turned(r, 3, home, '40° vers la droite → page précédente, bien posée');
  });

  await scenario('tablette portrait: un glissement plus vertical qu’horizontal (≈55°) ne tourne pas', TABLET, async r => {
    const { home, L, s } = await ready(r);
    await stroke(r, { x: L.x, y: s.zone.top + s.zone.height * 0.75, dx: -250, dy: -360 });
    await expectHome(r, 3, home, '|dx| < |dy| : la page reste, en place');
    await stays(r, 3, 'aucun tour différé', 600);
  });

  await scenario('tablette portrait: glissement court et lent (< 25 %) ne tourne pas et revient ; geste vif court tourne', TABLET, async r => {
    const { home, L, R } = await ready(r);
    const slow = await stroke(r, { ...L, dx: -150, steps: 8, interval: 90, hold: 150 });
    assert.ok(slow.speed < 0.4, `précondition : geste lent émis (${slow.speed.toFixed(2)} px/ms)`);
    await expectHome(r, 3, home, 'lent et court : retour en place sans tour');
    await stays(r, 3, 'pas de tour différé', 600);
    const flick = await stroke(r, { ...L, dx: -75, steps: 3, interval: 0 });
    assert.ok(flick.speed >= 0.8, `précondition : geste vif émis (${flick.speed.toFixed(2)} px/ms)`);
    await turned(r, 4, home, 'geste vif (≥ 40 px, rapide) → page suivante');
    await stays(r, 4, 'un seul tour', 500);
    const back = await stroke(r, { ...R, dx: 75, steps: 3, interval: 0 });
    assert.ok(back.speed >= 0.8, `précondition : geste vif (retour) émis (${back.speed.toFixed(2)} px/ms)`);
    await turned(r, 3, home, 'geste vif vers la droite → page précédente');
    const tiny = await stroke(r, { ...L, dx: -30, steps: 2, interval: 0 });
    assert.ok(tiny.speed >= 0.8, 'précondition : geste vif de 30 px');
    await expectHome(r, 3, home, 'geste vif mais < 40 px : revient sans tour');
    await stays(r, 3, 'aucun tour pour 30 px', 500);
  });

  await scenario('tablette portrait: glissement vertical pur — ne déplace pas la page et ne tourne pas', TABLET, async r => {
    const { home, s } = await ready(r);
    const c = zonePoint(s, 0.5, 0.5);
    for (const dy of [-0.5, 0.5]) {
      await stroke(r, { x: c.x, y: c.y - dy * s.zone.height * 0.5, dy: dy * s.zone.height, end: 'none' });
      const during = await snap(r, 3);
      assert.ok(Math.abs(during.page.left - home.left) <= 3 && Math.abs(during.page.top - home.top) <= 3, `pas de décalage pendant le geste ${JSON.stringify(rounded(during.page))}`);
      await release(r);
      await expectHome(r, 3, home, 'après le geste vertical : page en place');
    }
    await stays(r, 3, 'aucun tour', 500);
  });

  await scenario('tablette portrait: bornes — pas de tour avant la première ni après la dernière page, retour en place', TABLET, async r => {
    const { home, L, R } = await ready(r, 1);
    await stroke(r, { ...R, dx: 300 });
    await expectHome(r, 1, home, 'avant la première page : retour en place');
    await stays(r, 1, 'reste page 1', 500);
    await go(r, 5);
    await stroke(r, { ...L, dx: -300 });
    await expectHome(r, 5, home, 'après la dernière page : retour en place');
    await stays(r, 5, 'reste page 5', 500);
  });

  await scenario('tablette portrait: maintenir le doigt ne répète rien ; le relâchement tourne d’une seule page', TABLET, async r => {
    const { home, L } = await ready(r);
    await stroke(r, { ...L, dx: -300, hold: 1000, end: 'none' });
    assert.equal(await counter(r), 3, 'aucun tour pendant le maintien');
    await pause(500);
    assert.equal(await counter(r), 3, 'aucune répétition');
    await release(r);
    await turned(r, 4, home, 'relâchement : exactement une page');
    await stays(r, 4, 'pas de seconde page', 900);
  });

  await scenario('tablette portrait: interruption système, second doigt, changement de mode annulent et remettent la page en place', TABLET, async r => {
    const { home, L } = await ready(r);
    await stroke(r, { ...L, dx: -300, end: 'cancel' });
    await expectHome(r, 3, home, 'touchCancel : page en place, aucun tour');
    await stays(r, 3, 'pas de tour différé', 500);
    const end = await stroke(r, { ...L, dx: -200, end: 'none' });
    await touch(r, 'touchStart', [{ id: 1, x: end.x, y: end.y }, { id: 2, x: end.x + 120, y: end.y }]);
    await release(r);
    await expectHome(r, 3, home, 'second doigt : geste annulé, page en place');
    await stays(r, 3, 'aucun tour après second doigt', 500);
    await stroke(r, { ...L, dx: -300, end: 'none' });
    await mode(r, CONTINUOUS);
    await release(r);
    await stays(r, 3, 'changement de mode : geste annulé', 500);
    await mode(r, PAGED);
    await until(async () => {
      const s = await snap(r, 3);
      return { ok: Boolean(s?.page) && Math.abs(s.page.width - home.width) <= EPS && s.scroll.rangeX <= 1, info: rounded(s?.page) };
    }, 'retour en Page par page : page 3 non décalée');
    assert.equal(await counter(r), 3);
  });

  await scenario('tablette paysage: seuil de 25 % de la largeur de la ZONE (pas de la page)', LANDSCAPE, async r => {
    const { home, s, L } = await ready(r);
    assert.ok(home.width < s.zone.width * 0.6, 'précondition : la page est bien plus étroite que la zone');
    const x = s.zone.left + s.zone.width * 0.9;
    const below = await stroke(r, { x, y: L.y, dx: -200, steps: 10, interval: 90, hold: 150 });
    assert.ok(below.speed < 0.4, `précondition : geste lent (${below.speed.toFixed(2)} px/ms)`);
    await expectHome(r, 3, home, '200 px lents (16 % de la zone, 37 % de la page) : pas de tour');
    await stays(r, 3, 'pas de tour différé', 500);
    await stroke(r, { x, y: L.y, dx: -360, steps: 10, interval: 90, hold: 150 });
    await turned(r, 4, home, '360 px lents (28 % de la zone) → page suivante');
  });

  await scenario('PC (écran tactile): 25 % de la zone tourne, moins ne tourne pas', PC, async r => {
    const { home, s } = await ready(r);
    const x = s.zone.left + s.zone.width * 0.9, y = s.zone.top + s.zone.height * 0.5;
    await stroke(r, { x, y, dx: -300, steps: 10, interval: 90, hold: 150 });
    await expectHome(r, 3, home, '300 px lents (21 % de 1430) : pas de tour');
    await stroke(r, { x, y, dx: -400, steps: 10, interval: 60, hold: 150 });
    await turned(r, 4, home, '400 px (28 %) → page suivante');
  });
});

// =====================================================================================
// G5 — page agrandie (Page par page) : résistance puis tour au bord
// =====================================================================================
suite('G5 — page agrandie : défiler, résister au bord, tourner', 900_000, async scenario => {
  const zoomedAt = async r => {
    await open(r, PAGED, 3);
    const z = await zoomBy(r, 3, 1.8);
    return { width: z.page.width, zone: z.zone };
  };
  const finger = (s, fx) => ({ x: s.zone.left + s.zone.width * fx, y: s.zone.top + s.zone.height * 0.5 });

  await scenario('tablette portrait: contre le bord droit, tirer ≥ 25 % → résistance visible puis page suivante au début (haut/gauche), zoom conservé', TABLET, async r => {
    const { width } = await zoomedAt(r);
    let s = await place(r, 3, 'right', 0);
    assert.ok(edgeOk(gaps(s).right), 'précondition : page contre le bord droit');
    const before = s.page;
    await stroke(r, { ...finger(s, 0.85), dx: -260, end: 'none' });
    await until(async () => {
      const d = (await snap(r, 3)).page.left - before.left;
      return { ok: d <= -5 && d > -262, info: { shift: d } };
    }, 'résistance visible : la page se décale d’une fraction du doigt');
    assert.equal(await counter(r), 3, 'pas de tour avant le relâchement');
    await release(r);
    await expectCounter(r, 4, 'page suivante après 260 px (33 % de la zone)');
    s = await settle(r, 4);
    widthKept(s, 4, width, 'page suivante');
    assertEdge(s, 'left', 'page', 'avancer : bord gauche de la nouvelle page');
    assertEdge(s, 'top', 'page', 'avancer : haut de la nouvelle page');
    await stays(r, 4, 'un seul tour', 600);
  });

  await scenario('tablette portrait: contre le bord gauche, tirer ≥ 25 % vers la droite → page précédente à sa fin (bas/droite)', TABLET, async r => {
    const { width } = await zoomedAt(r);
    let s = await place(r, 3, 'left', 0);
    assert.ok(edgeOk(gaps(s).left), 'précondition : page contre le bord gauche');
    const before = s.page;
    await stroke(r, { ...finger(s, 0.15), dx: 260, end: 'none' });
    await until(async () => {
      const d = (await snap(r, 3)).page.left - before.left;
      return { ok: d >= 5 && d < 262, info: { shift: d } };
    }, 'résistance visible vers la droite');
    await release(r);
    await expectCounter(r, 2, 'page précédente');
    s = await settle(r, 2);
    widthKept(s, 2, width, 'page précédente');
    assertEdge(s, 'right', 'page', 'reculer : bord droit de la nouvelle page');
    assertEdge(s, 'bottom', 'page', 'reculer : bas de la nouvelle page');
  });

  await scenario('tablette portrait: dépassement insuffisant (< 25 %) → résistance puis retour, pas de tour', TABLET, async r => {
    await zoomedAt(r);
    const s = await place(r, 3, 'right', 0);
    const before = s.page;
    await stroke(r, { ...finger(s, 0.85), dx: -100, steps: 8, interval: 60, end: 'none', hold: 150 });
    await until(async () => {
      const d = (await snap(r, 3)).page.left - before.left;
      return { ok: d <= -3 && d > -100, info: { shift: d } };
    }, 'résistance visible même pour un petit dépassement');
    await release(r);
    await expectHome(r, 3, before, 'retour à la position d’origine, page 3');
    await stays(r, 3, 'pas de tour différé', 700);
  });

  await scenario('tablette portrait: geste commencé loin du bord — défile seulement, même s’il atteint le bord', TABLET, async r => {
    const { width } = await zoomedAt(r);
    let s = await place(r, 3, 'right', 150);
    assert.ok(s.page.right - s.zone.right > 100, `précondition : 100+ px de page cachés à droite ${JSON.stringify(rounded(s.page))}`);
    await stroke(r, { ...finger(s, 0.9), dx: -420, steps: 10 });
    await stays(r, 3, 'pas de tour : le geste a commencé loin du bord', 1000);
    s = await settle(r, 3);
    widthKept(s, 3, width, 'page courante');
    assertEdge(s, 'right', 'page', 'le bord droit a bien été atteint en défilant');
  });

  await scenario('tablette portrait: aucun tour par les bords haut/bas, ni par un geste surtout vertical au bord', TABLET, async r => {
    await zoomedAt(r);
    let s = await place(r, 3, 'bottom', 0);
    await stroke(r, { ...finger(s, 0.6), dy: -500, end: 'end' });
    await stays(r, 3, 'bas atteint, glissement vertical : pas de tour', 800);
    s = await place(r, 3, 'top', 0);
    await stroke(r, { x: s.zone.left + s.zone.width * 0.5, y: s.zone.top + s.zone.height * 0.2, dy: 500 });
    await stays(r, 3, 'haut atteint, glissement vertical : pas de tour', 800);
    s = await place(r, 3, 'right', 0);
    await stroke(r, { x: s.zone.left + s.zone.width * 0.8, y: s.zone.top + s.zone.height * 0.8, dx: -60, dy: -400 });
    await stays(r, 3, 'bord droit, geste surtout vertical (dx = 60 px) : pas de tour', 800);
  });

  await scenario('PC: page agrandie qui tient en largeur — tirer ≥ 25 % tourne (suivante au début, précédente à la fin) ; moins revient', PC, async r => {
    await open(r, PAGED, 3);
    let s = await zoomBy(r, 3, 1.5);
    const width = s.page.width;
    assert.ok(s.page.width < s.zone.width - 40 && s.page.height > s.zone.height + 40, 'précondition : tient en largeur, dépasse en hauteur');
    s = await place(r, 3, 'top', 0);
    const before = s.page;
    const f = finger(s, 0.85);
    await stroke(r, { ...f, dx: -250, steps: 8, interval: 60, hold: 150 });
    await expectHome(r, 3, before, '250 px (17 % de 1430) : retour, pas de tour');
    await stroke(r, { ...f, dx: -400, end: 'none' });
    await until(async () => {
      const d = (await snap(r, 3)).page.left - before.left;
      return { ok: d <= -5 && d > -402, info: { shift: d } };
    }, 'résistance visible (page tenant en largeur)');
    await release(r);
    await expectCounter(r, 4, '400 px (28 %) : page suivante');
    s = await settle(r, 4);
    widthKept(s, 4, width, 'page suivante');
    assertEdge(s, 'top', 'page', 'avancer : début (haut)');
    assertCentered(s, 'page', 'x', 'avancer : page centrée en largeur');
    await stroke(r, { ...finger(s, 0.15), dx: 400 });
    await expectCounter(r, 3, 'retour : page précédente');
    s = await settle(r, 3);
    widthKept(s, 3, width, 'page précédente');
    assertEdge(s, 'bottom', 'page', 'reculer : fin (bas)');
  });
});

// =====================================================================================
// G6 — toucher
// =====================================================================================
suite('G6 — toucher : quarts, bande centrale, priorités, souris exclue', 900_000, async scenario => {
  const inZone = (s, n) => { const p = s.pages.find(q => q.n === n); return Boolean(p) && p.top < s.zone.bottom - 50 && p.bottom > s.zone.top + 50; };

  for (const [label, size] of [['tablette portrait', TABLET], ['PC', PC]]) {
    await scenario(`${label}: Page par page ajustée — quart droit/gauche → page suivante/précédente, bornes respectées`, size, async r => {
      const s = await open(r, PAGED, 3);
      const home = s.page, right = zonePoint(s, 0.88, 0.5), left = zonePoint(s, 0.12, 0.5);
      await tap(r, right);
      await expectHome(r, 4, home, 'quart droit → page suivante');
      await tap(r, left);
      await expectHome(r, 3, home, 'quart gauche → page précédente');
      await go(r, 1);
      await tap(r, left);
      await stays(r, 1, 'avant la première page : rien', 700);
      await go(r, 5);
      await tap(r, right);
      await stays(r, 5, 'après la dernière page : rien', 700);
    });
  }

  await scenario('tablette portrait: Continu — quart droit/gauche → page voisine visible, bornes respectées', TABLET, async r => {
    const s = await open(r, CONTINUOUS, 3);
    const right = zonePoint(s, 0.88, 0.5), left = zonePoint(s, 0.12, 0.5);
    await tap(r, right);
    await until(async () => { const [c, v] = [await counter(r), await snap(r, 4)]; return { ok: c === 4 && inZone(v, 4), info: { c } }; }, 'quart droit : page 4 visible, compteur 4');
    await tap(r, left);
    await until(async () => { const [c, v] = [await counter(r), await snap(r, 3)]; return { ok: c === 3 && inZone(v, 3), info: { c } }; }, 'quart gauche : retour page 3 visible');
    await go(r, 1);
    await tap(r, left);
    await stays(r, 1, 'avant la première page', 700);
    await go(r, 5);
    await tap(r, right);
    await stays(r, 5, 'après la dernière page', 700);
  });

  await scenario('tablette portrait: page agrandie — le quart tourne, garde le zoom, place la page à son début / sa fin', TABLET, async r => {
    await open(r, PAGED, 3);
    let s = await zoomBy(r, 3, 1.8);
    const width = s.page.width;
    await tap(r, zonePoint(s, 0.88, 0.5));
    await expectCounter(r, 4, 'quart droit : page suivante');
    s = await settle(r, 4);
    widthKept(s, 4, width, 'quart droit');
    assertEdge(s, 'left', 'page', 'début : bord gauche');
    assertEdge(s, 'top', 'page', 'début : haut');
    await tap(r, zonePoint(s, 0.12, 0.5));
    await expectCounter(r, 3, 'quart gauche : page précédente');
    s = await settle(r, 3);
    widthKept(s, 3, width, 'quart gauche');
    assertEdge(s, 'right', 'page', 'fin : bord droit');
    assertEdge(s, 'bottom', 'page', 'fin : bas');
  });

  for (const [label, size] of [['tablette portrait', TABLET], ['PC', PC]]) {
    await scenario(`${label}: bande centrale — masque puis réaffiche la barre ; page et zoom manuel inchangés`, size, async r => {
      await open(r, PAGED, 3);
      const manual = await zoomBy(r, 3, 1.5);
      const width = manual.page.width;
      await expectToolbar(r, true, 'barre visible au départ');
      await tap(r, zonePoint(manual, 0.5, 0.5));
      await expectToolbar(r, false, 'toucher central : barre masquée, bouton « Afficher la barre de lecture » présent');
      let s = await settle(r, 3);
      assert.equal(await counter(r), 3, 'page inchangée');
      widthKept(s, 3, width, 'zoom manuel inchangé (barre masquée)');
      await tap(r, zonePoint(s, 0.5, 0.5));
      await expectToolbar(r, true, 'second toucher central : barre réaffichée');
      s = await settle(r, 3);
      assert.equal(await counter(r), 3, 'page inchangée');
      widthKept(s, 3, width, 'zoom manuel inchangé (barre réaffichée)');
    });
  }

  await scenario('tablette portrait: la barre masquée au toucher se réaffiche par son bouton ; masquée par H, un toucher central la réaffiche', TABLET, async r => {
    const s = await open(r, PAGED, 3);
    await tap(r, zonePoint(s, 0.5, 0.5));
    await expectToolbar(r, false, 'masquée par toucher central');
    await r.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 10, y: Math.round(s.zone.top + s.zone.height * 0.5) });
    await r.evaluate(() => document.activeElement?.blur());
    await until(async () => {
      const btn = await r.control('button', SHOW_BAR, function () {
        const b = this.getBoundingClientRect();
        return {
          opacity: getComputedStyle(this).opacity,
          clickable: !this.disabled && b.width > 0 && b.height > 0 && b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight,
        };
      });
      return { ok: btn.clickable && btn.opacity === '0', info: btn };
    }, 'Option A (LUM-14) : bouton « Afficher la barre de lecture » présent et cliquable mais invisible au repos (opacity: 0)');
    await r.control('button', SHOW_BAR);
    await expectToolbar(r, true, 'réaffichée par « Afficher la barre de lecture »');
    await r.evaluate(() => document.activeElement?.blur());
    await pressKey(r, 'h', 'KeyH', 72);
    await expectToolbar(r, false, 'masquée par H');
    const t = await settle(r, 3);
    await tap(r, zonePoint(t, 0.5, 0.5));
    await expectToolbar(r, true, 'toucher central : réaffichée (même état que H)');
    assert.equal(await counter(r), 3);
  });

  await scenario('tablette portrait: Continu — la bande centrale masque/affiche la barre sans changer de page', TABLET, async r => {
    const s = await open(r, CONTINUOUS, 3);
    await tap(r, zonePoint(s, 0.5, 0.5));
    await expectToolbar(r, false, 'barre masquée (Continu)');
    assert.equal(await counter(r), 3);
    const t = await snap(r, 3);
    await tap(r, zonePoint(t, 0.5, 0.5));
    await expectToolbar(r, true, 'barre réaffichée (Continu)');
    assert.equal(await counter(r), 3);
  });

  await scenario('tablette portrait: ce n’est pas un toucher — glissement de 14 px ou appui long de 500 ms', TABLET, async r => {
    const s = await open(r, PAGED, 3);
    const home = s.page, right = zonePoint(s, 0.88, 0.5), center = zonePoint(s, 0.5, 0.5);
    await stroke(r, { ...right, dx: 14, steps: 2, interval: 0 });
    await stays(r, 3, 'glissement de 14 px dans le quart : pas de tour', 700);
    await stroke(r, { ...center, dx: 14, steps: 2, interval: 0 });
    await pause(500);
    await expectToolbar(r, true, 'glissement de 14 px au centre : barre inchangée');
    await tap(r, right, { hold: 500 });
    await stays(r, 3, 'appui long dans le quart : pas de tour', 700);
    await tap(r, center, { hold: 500 });
    await pause(500);
    await expectToolbar(r, true, 'appui long au centre : barre inchangée');
    await expectHome(r, 3, home, 'page toujours en place');
  });

  for (const name of [PAGED, CONTINUOUS]) {
    await scenario(`tablette portrait ${name}: un clic de souris ne tourne jamais et ne masque pas la barre`, TABLET, async r => {
      const s = await open(r, name, 3);
      for (const [fx, what] of [[0.88, 'quart droit'], [0.12, 'quart gauche'], [0.5, 'bande centrale']]) {
        await click(r, zonePoint(s, fx, 0.5));
        await pause(600);
        assert.equal(await counter(r), 3, `clic de souris ${what} : page inchangée`);
        await expectToolbar(r, true, `clic de souris ${what} : barre inchangée`);
      }
    });
  }

  const linkCenter = (r, n) => until(async () => {
    const pt = await r.evaluate(n => {
      const a = document.querySelector(`[data-page-number="${n}"] .react-pdf__Page__annotations a`);
      if (!a) return null;
      const p = a.getBoundingClientRect();
      return p.width > 0 && p.height > 0 ? { x: p.x + p.width / 2, y: p.y + p.height / 2 } : null;
    }, n);
    return { ok: Boolean(pt), info: pt, pt };
  }, `lien PDF rendu sur la page ${n}`).then(x => x.pt);

  await scenario('tablette portrait Page par page: toucher sur un lien PDF → suit le lien (page 5), pas de tour', TABLET, async r => {
    await open(r, PAGED, LINKS.rightOn);
    let s = await settle(r, LINKS.rightOn);
    const target = await linkCenter(r, LINKS.rightOn);
    assert.ok(target.x > s.zone.left + s.zone.width * 0.75, `précondition : le lien est dans le quart droit (x=${target.x})`);
    await tap(r, target);
    await expectCounter(r, LINKS.rightTarget, 'le lien mène à la page 5 (et non à la page voisine 3)');
    await stays(r, LINKS.rightTarget, 'aucun tour après le lien', 700);
    await go(r, LINKS.leftOn);
    s = await settle(r, LINKS.leftOn);
    const left = await linkCenter(r, LINKS.leftOn);
    assert.ok(left.x < s.zone.left + s.zone.width * 0.25, `précondition : lien du quart gauche (x=${left.x})`);
    await tap(r, left);
    await expectCounter(r, LINKS.leftTarget, 'le lien du quart gauche mène à la page 1 (et non à la page voisine 3)');
  }, linked.path);

  await scenario('tablette portrait Continu: toucher sur un lien PDF → suit le lien, pas de tour', TABLET, async r => {
    await open(r, CONTINUOUS, LINKS.rightOn);
    const s = await snap(r, LINKS.rightOn);
    const target = await linkCenter(r, LINKS.rightOn);
    assert.ok(target.x > s.zone.left + s.zone.width * 0.75 && target.y > s.zone.top && target.y < s.zone.bottom, 'précondition : lien visible dans le quart droit');
    await tap(r, target);
    await expectCounter(r, LINKS.rightTarget, 'le lien mène à la page 5 (et non à la page voisine 3)');
    await stays(r, LINKS.rightTarget, 'aucun tour après le lien', 700);
  }, linked.path);

  for (const [fx, label] of [[0.88, 'quart droit'], [0.5, 'bande centrale']]) {
    await scenario(`tablette portrait: mode note — un toucher (${label}) pose une note, pas de tour, barre inchangée`, TABLET, async r => {
      const s = await open(r, PAGED, 3);
      await r.control('button', TOOLS);
      await r.control('button', NOTE);
      await r.key('Escape', 'Escape', 27);
      await pause(400);
      const count = await markers(r);
      await tap(r, zonePoint(s, fx, 0.5));
      await until(async () => { const n = await markers(r); return { ok: n === count + 1, info: { count, n } }; }, 'une note est posée');
      await stays(r, 3, 'pas de tour de page', 700);
      await expectToolbar(r, true, 'barre inchangée');
    });
  }
});

// =====================================================================================
// G7 — molette et trackpad (Page par page, sans Ctrl)
// =====================================================================================
suite('G7 — molette et trackpad', 900_000, async scenario => {
  for (const [label, size] of [['tablette portrait', TABLET], ['PC', PC]]) {
    await scenario(`${label}: impulsion bas/haut tourne ; page ajustée toujours à sa place, zoom jamais modifié ; bornes`, size, async r => {
      const s = await open(r, PAGED, 3);
      const home = s.page, p = zonePoint(s, 0.5, 0.5);
      await wheel(r, p, { dy: 120 });
      await expectHome(r, 4, home, 'impulsion vers le bas → page suivante (taille inchangée)');
      await pause(700);
      await wheel(r, p, { dy: -120 });
      await expectHome(r, 3, home, 'impulsion vers le haut → page précédente');
      await go(r, 1);
      await pause(500);
      await wheel(r, p, { dy: -120 });
      await stays(r, 1, 'avant la première page : rien', 700);
      await go(r, 5);
      await pause(500);
      await wheel(r, p, { dy: 120 });
      await stays(r, 5, 'après la dernière page : rien', 700);
    });

    await scenario(`${label}: une rafale d’inertie ne tourne qu’une page ; une impulsion après une pause tourne la suivante`, size, async r => {
      const s = await open(r, PAGED, 2);
      const home = s.page, p = zonePoint(s, 0.5, 0.5);
      await wheelBurst(r, p, { events: 15, start: 100, step: 6, spacing: 8 });
      await expectHome(r, 3, home, 'rafale de 15 événements → une seule page');
      await stays(r, 3, 'pas de seconde page après la rafale', 900);
      await wheelBurst(r, p, { events: 40, start: 100, step: 2, spacing: 10 });
      await expectCounter(r, 4, 'longue rafale continue (≈ 0,5 s) → une page de plus');
      await stays(r, 4, 'une seule page pour toute la rafale', 900);
      await wheel(r, p, { dy: 120 });
      await expectCounter(r, 5, 'nouvelle impulsion après une pause → page suivante');
    });

    await scenario(`${label}: micro-mouvements sans effet ; trackpad horizontal (deltaX) tourne`, size, async r => {
      const s = await open(r, PAGED, 3);
      const home = s.page, p = zonePoint(s, 0.5, 0.5);
      for (let i = 0; i < 3; i++) { await wheel(r, p, { dy: 2 }); await pause(40); }
      for (let i = 0; i < 3; i++) { await wheel(r, p, { dx: -2 }); await pause(40); }
      await pause(600);
      await expectHome(r, 3, home, 'micro-deltas : ni tour ni décalage');
      await wheel(r, p, { dx: 120 });
      await expectHome(r, 4, home, 'deltaX positif → page suivante');
      await pause(700);
      await wheel(r, p, { dx: -120 });
      await expectHome(r, 3, home, 'deltaX négatif → page précédente');
    });
  }

  const zoomedWheel = async (r, ratio, centeredX) => {
    await open(r, PAGED, 3);
    let s = await zoomBy(r, 3, ratio);
    const width = s.page.width;
    assert.ok(s.page.height > s.zone.height + 40, 'précondition : la page dépasse verticalement');
    s = await place(r, 3, 'top', 0);
    const p = zonePoint(s, 0.5, 0.5);
    const topBefore = s.page.top;
    await wheel(r, p, { dy: 200 });
    await until(async () => {
      const t = await snap(r, 3);
      return { ok: t?.page && t.page.top <= topBefore - 80 && t.page.width > 0, info: { top: t?.page?.top, topBefore } };
    }, 'la molette fait défiler la page agrandie');
    assert.equal(await counter(r), 3, 'défilement, pas de tour');
    await pause(700);
    // Bas encore à 100 px : l’impulsion de 400 px défile jusqu’au bas sans tourner.
    s = await place(r, 3, 'bottom', 100);
    await pause(700);
    await wheel(r, p, { dy: 400 });
    await until(async () => { const t = await snap(r, 3); return { ok: t?.page && edgeOk(gaps(t).bottom), info: rounded(t?.page) }; }, 'défilement jusqu’au bas');
    await stays(r, 3, 'impulsion commencée avant le bas : défile sans tourner', 900);
    // Bas atteint : une nouvelle impulsion tourne ; page suivante affichée à son haut.
    await wheel(r, p, { dy: 150 });
    await expectCounter(r, 4, 'bas atteint : impulsion vers le bas → page suivante');
    s = await settle(r, 4);
    widthKept(s, 4, width, 'page suivante');
    assertEdge(s, 'top', 'page', 'page suivante affichée à son haut');
    if (centeredX) assertCentered(s, 'page', 'x', 'page suivante centrée en largeur');
    await pause(700);
    // Haut atteint : impulsion vers le haut → précédente affichée à son bas.
    s = await place(r, 4, 'top', 0);
    await wheel(r, zonePoint(s, 0.5, 0.5), { dy: -150 });
    await expectCounter(r, 3, 'haut atteint : impulsion vers le haut → page précédente');
    s = await settle(r, 3);
    widthKept(s, 3, width, 'page précédente');
    assertEdge(s, 'bottom', 'page', 'page précédente affichée à son bas');
  };
  await scenario('tablette portrait: page agrandie — défile, puis tourne au bas (suivante en haut) et au haut (précédente en bas)', TABLET, r => zoomedWheel(r, 1.8, false));
  await scenario('PC: page agrandie tenant en largeur — défile, puis tourne au bas et au haut', PC, r => zoomedWheel(r, 1.5, true));

  await scenario('tablette portrait: Ctrl+molette zoome toujours, sans tourner, y compris au bas d’une page agrandie', TABLET, async r => {
    const s = await open(r, PAGED, 3);
    const w0 = s.page.width, p = zonePoint(s, 0.5, 0.5);
    await wheel(r, p, { dy: -200, ctrl: true });
    await until(async () => { const t = await snap(r, 3); return { ok: t?.page?.width > w0 * 1.1, info: rounded(t?.page) }; }, 'Ctrl+molette agrandit');
    assert.equal(await counter(r), 3);
    await zoomBy(r, 3, 1.8);
    let z = await place(r, 3, 'bottom', 0);
    const wz = z.page.width;
    await pause(700);
    await wheel(r, zonePoint(z, 0.5, 0.5), { dy: 100, ctrl: true });
    await until(async () => { const t = await snap(r, 3); return { ok: t?.page && t.page.width < wz - 5, info: { wz, w: t?.page?.width } }; }, 'Ctrl+molette vers le bas dézoome (au bas de la page)');
    await stays(r, 3, 'Ctrl+molette ne tourne jamais', 800);
  });

  await scenario('tablette portrait: Continu — la molette défile normalement (natif), sans zoom ni tour forcé', TABLET, async r => {
    const s = await open(r, CONTINUOUS, 3);
    const p = zonePoint(s, 0.5, 0.5);
    await wheel(r, p, { dy: 300 });
    const moved = await until(async () => {
      const t = await snap(r, 3);
      const d = t?.page ? t.page.top - s.page.top : NaN;
      return { ok: d <= -240 && d >= -360, info: { delta: d } };
    }, 'la molette déplace le document d’environ 300 px');
    const t = await settle(r, 3);
    assert.ok(Math.abs(t.page.width - s.page.width) <= EPS, 'la molette ordinaire ne zoome pas');
    assert.ok(t.scroll.rangeX <= 1, 'aucune dérive horizontale');
  });
});

// =====================================================================================
// G8 — mouvement réduit et durée des animations
// =====================================================================================
suite('G8 — mouvement : instantané sous prefers-reduced-motion, ≤ 250 ms sinon', 600_000, async scenario => {
  const reduce = async r => {
    await r.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    assert.equal(await r.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true, 'précondition : mouvement réduit actif');
  };

  await scenario('tablette portrait, mouvement réduit: suivi direct, tour et retour sans attente d’animation', TABLET, async r => {
    await reduce(r);
    const s = await open(r, PAGED, 3);
    const home = s.page, L = zonePoint(s, 0.85, 0.5), R = zonePoint(s, 0.15, 0.5);
    await stroke(r, { ...L, dx: -150, steps: 5, interval: 30, end: 'none' });
    await until(async () => {
      const t = await snap(r, 3);
      const d = t?.page ? t.page.left - home.left : NaN;
      return { ok: d <= -30 && d >= -165, info: { shift: d } };
    }, 'le suivi du doigt reste direct');
    await touch(r, 'touchCancel');
    await expectHome(r, 3, home, 'annulation : retour en place', { timeout: 400 });
    await stroke(r, { ...L, dx: -150, steps: 8, interval: 90, hold: 150 });
    await expectHome(r, 3, home, 'court et lent : retour en place immédiat', { timeout: 400 });
    await stroke(r, { ...L, dx: -300 });
    await expectHome(r, 4, home, 'tour de page immédiat, page en place', { timeout: 400 });
    await stroke(r, { ...R, dx: 300 });
    await expectHome(r, 3, home, 'tour inverse immédiat', { timeout: 400 });
  });

  await scenario('tablette portrait, mouvement normal: retour et tour terminés en moins de ≈ 500 ms (animation ≤ 250 ms)', TABLET, async r => {
    const s = await open(r, PAGED, 3);
    const home = s.page, L = zonePoint(s, 0.85, 0.5);
    await stroke(r, { ...L, dx: -150, steps: 8, interval: 90, hold: 150 });
    await expectHome(r, 3, home, 'retour en place', { timeout: 500 });
    await stroke(r, { ...L, dx: -300 });
    await expectHome(r, 4, home, 'tour de page terminé', { timeout: 500 });
  });

  await scenario('tablette portrait, mouvement réduit: tour de page à la molette et au toucher de quart', TABLET, async r => {
    await reduce(r);
    const s = await open(r, PAGED, 3);
    const home = s.page, p = zonePoint(s, 0.5, 0.5);
    await wheel(r, p, { dy: 120 });
    await expectHome(r, 4, home, 'molette : tour immédiat', { timeout: 400 });
    await pause(700);
    await tap(r, zonePoint(s, 0.12, 0.5));
    await expectHome(r, 3, home, 'toucher de quart : tour immédiat', { timeout: 400 });
  });
});
