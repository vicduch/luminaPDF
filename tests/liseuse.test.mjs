// LUM-16 — liseuse OneLearn : contrat de mode déplacé dans « Outils de lecture », nouvelle disposition,
// immersion, langage visuel (sans ombre, flou ni rayon > 2 px) et bibliothèque « bandeau manuel ».
// Boîte noire : arbre d'accessibilité, styles calculés, géométrie affichée, clavier/souris de confiance.
// Écrit AVANT l'implémentation : les points nouveaux sont rouges sur la base dc5a9b3.
// Delta du 16 novembre 2026 (LISEUSE-G1…G5) : champ de page dans l'en-tête, pied réduit à la réglette et aux flèches.
// Exécution ciblée : READER_TEST_URL=http://127.0.0.1:3017 node --test --test-concurrency=1 tests/liseuse.test.mjs
// Limites : Edge headless émulé ; ni PWA installée, ni appareil réel, ni comparaison à la maquette.
import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, openReader, eventually } from './reader-cdp.mjs';
import { createSession, goHome, goTo, counter, dominantPage } from './storage-cdp.mjs';
import { snap } from './helpers/gesture-kit.mjs';
import { tabTo, pageAt } from './helpers/ux-cdp.mjs';
import {
  CONTINUOUS, PAGED, TOOLS, chooseMode, openToolsPanel, closeToolsPanel, modeStates,
} from './helpers/reading-mode.mjs';

const fixture = name => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const LONG = fixture('ux-long-outline.pdf');
const FIVE = fixture('reader-5-pages.pdf'), MIXED = fixture('reader-mixed-pages.pdf');
const FIVE_NAME = 'reader-5-pages.pdf', MIXED_NAME = 'reader-mixed-pages.pdf';
const OUTLINE = 'Sommaire';
const NAV = 'Navigation dans le document';
const GOTO = 'Aller à la page', PROGRESS = 'Progression de lecture', PREV = 'Page précédente', NEXT = 'Page suivante';
const SIZES = [['PC', 1440, 900], ['tablette portrait', 800, 1280], ['petit écran', 360, 800]];

let browser;
test.before(async () => { browser = await launch(); });
test.after(async () => { if (browser) await browser.close(); });

async function reader(width, height, fn, pdf = LONG) {
  const r = await openReader(browser, width, height, pdf);
  try { await fn(r); } finally { await r.close(); }
}

// ---------- Sondes exécutées dans la page (autonomes : sérialisées par toString) ----------

/** Géométrie et visibilité réelle d'un élément (this) ; `container` = boîte de .pdf-viewer-container. */
function describe() {
  let shown = true, reason = '';
  for (let e = this; e; e = e.parentElement) {
    const s = getComputedStyle(e);
    if (e.hidden || e.inert || s.display === 'none' || s.visibility === 'hidden' || s.visibility === 'collapse' || Number(s.opacity) === 0) {
      shown = false; reason = `${e.tagName}${e.id ? '#' + e.id : ''}`; break;
    }
  }
  const b = this.getBoundingClientRect();
  const c = document.querySelector('.pdf-viewer-container')?.getBoundingClientRect();
  const intersects = b.width > 0 && b.height > 0 && b.right > 0 && b.left < innerWidth && b.bottom > 0 && b.top < innerHeight;
  return {
    shown: shown && intersects, reason: reason || (intersects ? '' : 'hors fenêtre ou taille nulle'),
    inViewport: b.left >= -0.5 && b.right <= innerWidth + 0.5 && b.top >= -0.5 && b.bottom <= innerHeight + 0.5,
    left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height,
    container: c ? { left: c.left, right: c.right, top: c.top, bottom: c.bottom } : null,
  };
}
/** Écarts de langage visuel de l'élément (this) et de ses boutons visibles : ombre, flou, rayon > 2 px. */
function audit() {
  const issues = [];
  const radii = (e, s) => {
    const b = e.getBoundingClientRect();
    return ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'].map(k => {
      const v = s[k].split(' ')[0];
      return v.endsWith('%') ? parseFloat(v) / 100 * Math.min(b.width, b.height) : parseFloat(v);
    });
  };
  // Seuls exemptés du rayon : les éléments role=radio et les puces rondes de choix de couleur.
  const exempt = e => Boolean(e.closest('[role="radio"], [aria-label="Thème de couleur"], [aria-label="Couleur des notes"]'));
  const label = e => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}[${(e.getAttribute('aria-label') || e.textContent.trim()).replace(/\s+/g, ' ').slice(0, 40)}]`;
  const targets = [this, ...this.querySelectorAll('button')].filter(e => e === this || e.getClientRects().length > 0);
  for (const e of targets) {
    const s = getComputedStyle(e);
    if (s.boxShadow !== 'none') issues.push(`${label(e)} box-shadow ${s.boxShadow.slice(0, 50)}`);
    const backdrop = s.backdropFilter || s.webkitBackdropFilter || 'none';
    if (backdrop !== 'none') issues.push(`${label(e)} backdrop-filter ${backdrop}`);
    if (!exempt(e)) {
      const max = Math.max(...radii(e, s));
      if (max > 2.01) issues.push(`${label(e)} border-radius ${max.toFixed(1)} px`);
    }
  }
  return issues;
}
const bySelector = (r, selector, fn) => r.evaluate((src, selector) => {
  const el = document.querySelector(selector);
  return el ? new Function(`return ${src}`)().call(el) : { missing: selector };
}, fn.toString(), selector);
const auditOf = async (r, selector) => {
  const issues = await bySelector(r, selector, audit);
  assert.ok(Array.isArray(issues), `élément introuvable : ${selector}`);
  return issues;
};
const describeAll = (r, selector) => r.evaluate((src, selector) => {
  const d = new Function(`return ${src}`)();
  return [...document.querySelectorAll(selector)].map(e => d.call(e));
}, describe.toString(), selector);

const press = async (r, key, code, vk) => {
  await r.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, text: key, unmodifiedText: key });
  await r.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
};
/** Pages distinctes réellement affichées, triées (pages d'un même numéro dédoublonnées). */
const shownPages = async r => {
  const pages = (await snap(r, 1)).pages, byNumber = new Map();
  for (const p of pages) if (!byNumber.has(p.n)) byNumber.set(p.n, p);
  return [...byNumber.values()].sort((a, b) => a.n - b.n);
};
/** Continu = au moins trois pages empilées verticalement ; Page par page = une seule page affichée. */
async function expectGeometry(r, expected, label) {
  let last;
  await eventually(async () => {
    const pages = await shownPages(r);
    last = pages.map(p => [p.n, Math.round(p.top), Math.round(p.bottom)]);
    if (expected === 'paged') return pages.length === 1;
    return pages.length >= 3 && pages.every((p, i) => i === 0 || (p.top >= pages[i - 1].bottom - 2 && Math.abs(p.left - pages[0].left) <= 2));
  }, `${label} : géométrie « ${expected === 'paged' ? 'une page' : 'pages empilées'} » (dernier état ${JSON.stringify(last)})`);
}
const pressedStates = async (r, expected) => assert.deepEqual(await modeStates(r), expected);
const ONLY = name => ({ [CONTINUOUS]: String(name === CONTINUOUS), [PAGED]: String(name === PAGED) });

// =====================================================================================
// a. Mode de lecture dans le panneau « Outils de lecture »
// =====================================================================================
test('LISEUSE-A — le mode n’est visible que dans #reader-tools, activable souris et clavier, C bascule toujours', { timeout: 120_000 }, async () => {
  await reader(1440, 900, async r => {
    // Panneau fermé : aucun bouton de mode accessible ni visible.
    assert.equal(await r.hasControl('button', CONTINUOUS), false, 'Lecture continue absent hors panneau ouvert');
    assert.equal(await r.hasControl('button', PAGED), false, 'Lecture page par page absent hors panneau ouvert');
    const stray = await r.evaluate(src => {
      const d = new Function(`return ${src}`)();
      return [...document.querySelectorAll('button, [role="button"], [role="radio"]')]
        .filter(e => ['Lecture continue', 'Lecture page par page', 'Continu', 'Page par page'].includes((e.getAttribute('aria-label') || e.innerText || '').trim()))
        .filter(e => d.call(e).shown && !e.closest('#reader-tools'))
        .map(e => e.getAttribute('aria-label') || e.innerText.trim());
    }, describe.toString());
    assert.deepEqual(stray, [], 'aucun bouton de mode visible en dehors du panneau Outils');

    // Panneau ouvert : les deux boutons y sont, dans le groupe « Mode de lecture ».
    await openToolsPanel(r);
    const region = await r.evaluate(() => {
      const e = document.querySelector('#reader-tools');
      return { role: e?.getAttribute('role'), label: e?.getAttribute('aria-label') };
    });
    assert.deepEqual(region, { role: 'region', label: 'Outils de lecture' });
    const placed = {};
    for (const name of [CONTINUOUS, PAGED]) {
      placed[name] = await r.control('button', name, function () {
        const b = this.getBoundingClientRect(), s = getComputedStyle(this);
        const group = this.closest('[role="group"]');
        return {
          inPanel: Boolean(this.closest('#reader-tools')), group: group?.getAttribute('aria-label'),
          groupInPanel: Boolean(group?.closest('#reader-tools')), text: this.innerText.trim(),
          shown: b.width > 0 && b.height > 0 && s.visibility !== 'hidden', pressed: this.getAttribute('aria-pressed'),
        };
      });
      assert.ok(placed[name].inPanel && placed[name].groupInPanel, `${name} est dans #reader-tools`);
      assert.equal(placed[name].group, 'Mode de lecture', `${name} est dans le groupe « Mode de lecture »`);
      assert.ok(placed[name].shown, `${name} visible panneau ouvert`);
      assert.ok(['true', 'false'].includes(placed[name].pressed), `${name} expose aria-pressed`);
    }
    assert.equal(placed[CONTINUOUS].text, 'Continu');
    assert.equal(placed[PAGED].text, 'Page par page');
    assert.equal([placed[CONTINUOUS].pressed, placed[PAGED].pressed].filter(v => v === 'true').length, 1, 'exactement un mode actif');
    await closeToolsPanel(r);

    // Souris : bascule réelle du mode, aria-pressed et géométrie cohérents.
    await chooseMode(r, CONTINUOUS, { close: false });
    await expectGeometry(r, 'continuous', 'souris : Continu');
    await pressedStates(r, ONLY(CONTINUOUS));
    await chooseMode(r, PAGED, { close: false });
    await expectGeometry(r, 'paged', 'souris : Page par page');
    await pressedStates(r, ONLY(PAGED));

    // Clavier : Tab jusqu'au bouton (sans focus() sur la cible) puis Entrée.
    await tabTo(r, 'button', CONTINUOUS);
    await r.key('Enter', 'Enter', 13);
    await expectGeometry(r, 'continuous', 'clavier : Entrée sur Lecture continue');
    await pressedStates(r, ONLY(CONTINUOUS));
    await tabTo(r, 'button', PAGED);
    await r.key('Enter', 'Enter', 13);
    await expectGeometry(r, 'paged', 'clavier : Entrée sur Lecture page par page');
    await pressedStates(r, ONLY(PAGED));
    await closeToolsPanel(r);

    // Raccourci C : toujours effectif depuis un bouton, panneau fermé.
    assert.equal(await r.control('button', TOOLS, function () { return document.activeElement === this; }), true, 'Échap rend le focus à Outils de lecture');
    await press(r, 'c', 'KeyC', 67);
    await expectGeometry(r, 'continuous', 'touche C : paged → continu');
    await pressedStates(r, ONLY(CONTINUOUS));
    await closeToolsPanel(r);
    await press(r, 'c', 'KeyC', 67);
    await expectGeometry(r, 'paged', 'touche C : continu → paged');
    await pressedStates(r, ONLY(PAGED));
  });
});

// =====================================================================================
// b. Onglets de bord et commandes toujours présentes, à trois tailles
// =====================================================================================
for (const [label, width, height] of SIZES) {
  test(`LISEUSE-B — ${label} ${width}×${height} : onglets Sommaire/Outils en gouttières, commandes ≥ 44 px`, { timeout: 60_000 }, async () => {
    await reader(width, height, async r => {
      const probe = (role, name) => r.control(role, name, describe);
      const tabs = { sommaire: await probe('button', OUTLINE), outils: await probe('button', TOOLS) };
      for (const [key, name] of [['sommaire', OUTLINE], ['outils', TOOLS]]) {
        const t = tabs[key];
        assert.ok(t.shown && t.inViewport, `${name} visible dans la fenêtre : ${JSON.stringify(t)}`);
        assert.ok(t.width >= 44 && t.height >= 44, `${name} cible ≥ 44×44 (reçu ${t.width.toFixed(1)}×${t.height.toFixed(1)})`);
        assert.ok(t.container, '.pdf-viewer-container présent');
      }
      const c = tabs.sommaire.container;
      assert.ok(tabs.sommaire.right <= c.left + 1, `Sommaire entièrement à gauche du conteneur de lecture (droite ${tabs.sommaire.right.toFixed(1)} ≤ gauche du conteneur ${c.left.toFixed(1)})`);
      assert.ok(tabs.outils.left >= c.right - 1, `Outils entièrement à droite du conteneur de lecture (gauche ${tabs.outils.left.toFixed(1)} ≥ droite du conteneur ${c.right.toFixed(1)})`);
      assert.equal(await r.control('button', OUTLINE, function () { return `${this.getAttribute('aria-controls')}/${this.getAttribute('aria-expanded')}`; }), 'reader-outline/false');
      assert.equal(await r.control('button', TOOLS, function () { return `${this.getAttribute('aria-controls')}/${this.getAttribute('aria-expanded')}`; }), 'reader-tools/false');

      for (const [role, name] of [['button', 'Revenir à la bibliothèque'], ['button', 'Ajuster la page'], ['button', 'Page précédente'], ['button', 'Page suivante'], ['spinbutton', 'Aller à la page']]) {
        const d = await probe(role, name);
        assert.ok(d.shown && d.inViewport, `${name} présent et visible : ${JSON.stringify(d)}`);
        assert.ok(d.width >= 44 && d.height >= 44, `${name} cible ≥ 44×44 (reçu ${d.width.toFixed(1)}×${d.height.toFixed(1)})`);
      }
    });
  });
}

// =====================================================================================
// c. Immersion (touche H)
// =====================================================================================
test('LISEUSE-C — immersion : H masque en-tête, onglets et pied, H les restaure', { timeout: 60_000 }, async () => {
  await reader(1440, 900, async r => {
    const chrome = async () => {
      const probe = async (role, name) => await r.hasControl(role, name) ? (await r.control(role, name, describe)).shown : false;
      return {
        entete: (await describeAll(r, '#reader-toolbar')).some(d => d.shown),
        sommaire: await probe('button', OUTLINE),
        outils: await probe('button', TOOLS),
        pied: (await describeAll(r, `[aria-label="${NAV}"]`)).some(d => d.shown),
        languette: await probe('button', 'Afficher la barre de lecture'),
      };
    };
    await eventually(async () => { const s = await chrome(); return s.entete && s.sommaire && s.outils && s.pied && !s.languette; }, 'précondition : en-tête, onglets et pied visibles');
    await r.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 720, y: 450 });
    await r.evaluate(() => document.activeElement?.blur());
    await press(r, 'h', 'KeyH', 72);
    let state;
    await eventually(async () => {
      state = await chrome();
      return Object.values(state).every(v => v === false);
    }, `immersion : tout le chrome est absent visuellement (dernier état ${JSON.stringify(state)})`);
    await r.evaluate(() => document.activeElement?.blur());
    await press(r, 'h', 'KeyH', 72);
    await eventually(async () => {
      state = await chrome();
      return state.entete && state.sommaire && state.outils && state.pied && !state.languette;
    }, `H restaure en-tête, onglets et pied (dernier état ${JSON.stringify(state)})`);
  });
});

// =====================================================================================
// d. Langage visuel du lecteur : ni ombre, ni flou, rayon ≤ 2 px
// =====================================================================================
test('LISEUSE-D1 — lecteur : barre, navigation, panneau Outils et sommaire sans ombre, flou ni rayon > 2 px', { timeout: 90_000 }, async () => {
  await reader(1440, 900, async r => {
    const issues = [];
    const check = async (what, selector) => issues.push(...(await auditOf(r, selector)).map(i => `${what}: ${i}`));
    await check('barre #reader-toolbar', '#reader-toolbar');
    // « sa ligne » : le conteneur direct de la barre, s'il est propre au lecteur.
    const row = await r.evaluate(() => {
      const p = document.querySelector('#reader-toolbar')?.parentElement;
      if (!p || p === document.body || p.id === 'root') return null;
      const s = getComputedStyle(p);
      return { shadow: s.boxShadow, backdrop: s.backdropFilter || 'none' };
    });
    if (row && row.shadow !== 'none') issues.push(`ligne de la barre: box-shadow ${row.shadow}`);
    if (row && row.backdrop !== 'none') issues.push(`ligne de la barre: backdrop-filter ${row.backdrop}`);
    await check(`navigation « ${NAV} »`, `[aria-label="${NAV}"]`);

    await openToolsPanel(r);
    await check('panneau #reader-tools', '#reader-tools');
    await closeToolsPanel(r);

    await r.control('button', OUTLINE);
    await eventually(async () => (await describeAll(r, '#reader-outline')).some(d => d.shown), 'sommaire #reader-outline ouvert');
    await check('sommaire #reader-outline', '#reader-outline');
    assert.deepEqual(issues, [], issues.join(' ; '));
  });
});

// =====================================================================================
// d/e. Bibliothèque « bandeau manuel »
// =====================================================================================
test('LISEUSE-D2/E — bibliothèque : titre h1, noms conservés, surfaces sans ombre, flou ni rayon > 2 px', { timeout: 90_000 }, async () => {
  const r = await createSession(browser, { width: 1280, height: 900 });
  try {
    await r.load();
    await r.openPdf(FIVE, 'library');
    await r.openPdf(MIXED, 'toolbar');
    await goTo(r, 2);
    await goHome(r);
    const resume = `Reprendre ${MIXED_NAME} à la page 2`;
    await eventually(async () => (await r.hasControl('button', resume)) && (await r.hasControl('button', `Ouvrir ${FIVE_NAME}`)),
      'bibliothèque affichée avec reprise à la page 2 et lecture récente');

    // e. Noms, régions et titre conservés.
    const nodes = (await r.send('Accessibility.getFullAXTree')).nodes.filter(n => !n.ignored);
    const h1 = nodes.filter(n => n.role?.value === 'heading' && n.name?.value === 'Bibliothèque'
      && n.properties?.some(p => p.name === 'level' && p.value?.value === 1));
    assert.equal(h1.length, 1, 'un titre de niveau 1 « Bibliothèque »');
    for (const name of ['Reprendre la lecture', 'Lectures récentes', 'Importer un document']) {
      assert.equal(nodes.filter(n => n.role?.value === 'region' && n.name?.value === name).length, 1, `région « ${name} » conservée`);
    }
    assert.equal(await r.hasControl('button', resume), true, 'bouton « Reprendre à la page N » (nom accessible) conservé');
    assert.equal(await r.hasControl('button', 'Importer un PDF'), true, 'bouton d’import conservé');

    // d. Surfaces et boutons nommés.
    const issues = [];
    const bandeau = await r.evaluate(src => {
      const el = document.querySelector('header, [role="banner"]');
      return el ? new Function(`return ${src}`)().call(el) : null;
    }, audit.toString());
    if (!bandeau) issues.push('bandeau (header / role=banner) introuvable');
    else issues.push(...bandeau.map(i => `bandeau: ${i}`));
    for (const [role, name] of [['region', 'Reprendre la lecture'], ['region', 'Lectures récentes'], ['button', 'Importer un PDF']]) {
      issues.push(...(await r.control(role, name, audit)).map(i => `${name}: ${i}`));
    }
    assert.deepEqual(issues, [], issues.join(' ; '));
  } finally { await r.close(); }
});

// =====================================================================================
// f. Lisibilité du bouton de pose de note, actif et inactif (Jour/Nuit × ambiances)
// =====================================================================================
const NOTE_IDLE = 'Ajouter une note sur la page', NOTE_ACTIVE = 'Terminer la pose de note';
const AMBIANCES = ['Clair', 'Confort', 'Sépia', 'Forêt', 'Minuit', 'Sombre', 'Bleu nuit', 'OLED', 'eInk'];

/**
 * Sonde exécutée dans la page (this = bouton) : contraste WCAG réel entre la couleur calculée du texte et le
 * fond effectif = couches de fond non transparentes en remontant les ancêtres jusqu'au premier fond opaque
 * (blanc par défaut du canevas si aucun), composées avec leur alpha ; l'alpha du texte et l'opacité cumulée
 * des ancêtres sont appliqués. Limite : un background-image (grain SVG très léger) n'est pas échantillonné.
 */
function textContrast() {
  const canvas = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  canvas.canvas.width = canvas.canvas.height = 1;
  const parse = css => {
    const m = css.match(/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4] };
    // Autres espaces colorimétriques (color(), oklab()...) : conversion par le canevas, 3 pixels pour retrouver l'alpha.
    canvas.clearRect(0, 0, 1, 1); canvas.fillStyle = '#000'; canvas.fillStyle = css;
    canvas.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = canvas.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a: a / 255 };
  };
  const over = (top, bottom) => {
    const a = top.a + bottom.a * (1 - top.a);
    const mix = k => a === 0 ? 0 : (top[k] * top.a + bottom[k] * bottom.a * (1 - top.a)) / a;
    return { r: mix('r'), g: mix('g'), b: mix('b'), a };
  };
  const channel = v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const luminance = c => 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);

  let opacity = 1;
  const layers = [];
  for (let e = this; e; e = e.parentElement) {
    opacity *= Number(getComputedStyle(e).opacity);
    const c = parse(getComputedStyle(e).backgroundColor);
    if (c.a > 0) layers.push(c);
    if (c.a >= 0.999) break;
  }
  let effective = layers.length && layers[layers.length - 1].a >= 0.999 ? layers.pop() : { r: 255, g: 255, b: 255, a: 1 };
  while (layers.length) effective = over(layers.pop(), effective);

  const own = e => [...e.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
  const texts = [this, ...this.querySelectorAll('*')].filter(own);
  const shown = this.getClientRects().length > 0 && texts.length > 0;
  const measures = texts.map(e => {
    const fg = parse(getComputedStyle(e).color);
    const painted = over({ ...fg, a: fg.a * opacity }, effective);
    const l1 = luminance(painted), l2 = luminance(effective);
    return {
      text: e.textContent.trim().slice(0, 40), color: getComputedStyle(e).color,
      ratio: (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05),
    };
  });
  const rgb = c => `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;
  return {
    shown, background: rgb(effective), measures,
    ratio: measures.length ? Math.min(...measures.map(m => m.ratio)) : 0,
    pressed: this.getAttribute('aria-pressed'),
  };
}

/** Attend que couleurs et contraste cessent de bouger (transitions CSS), puis renvoie la mesure stable. */
async function stableContrast(r, name, label) {
  let previous = null, since = 0;
  return eventually(async () => {
    const m = await r.control('button', name, textContrast);
    const key = `${m.background}|${m.measures.map(x => x.color).join()}|${m.pressed}`;
    if (key !== previous) { previous = key; since = Date.now(); }
    return m.shown && Date.now() - since >= 300 ? m : false;
  }, `${label} : couleurs de « ${name} » stabilisées et affichées`);
}

test('LISEUSE-F — pose de note : texte lisible (≥ 4,5:1) inactif et actif, Jour/Nuit × ambiances', { timeout: 180_000 }, async () => {
  const MIN = 4.5, failures = [];
  await reader(1200, 900, async r => {
    await openToolsPanel(r);
    const pressedOf = name => r.control('button', name, function () { return this.getAttribute('aria-pressed'); });
    for (const ambiance of AMBIANCES) {
      for (const luminosity of ['Jour', 'Nuit']) {
        const label = `${luminosity} / ${ambiance}`;
        await r.control('button', ambiance);
        await r.control('button', luminosity);
        await eventually(async () => await pressedOf(ambiance) === 'true' && await pressedOf(luminosity) === 'true',
          `${label} : ambiance et luminosité sélectionnées (aria-pressed)`);
        assert.equal(await pressedOf(luminosity === 'Jour' ? 'Nuit' : 'Jour'), 'false', `${label} : l'autre luminosité n'est plus active`);

        const idle = await stableContrast(r, NOTE_IDLE, `${label} inactif`);
        assert.equal(idle.pressed, 'false', `${label} : « ${NOTE_IDLE} » aria-pressed=false`);

        await r.control('button', NOTE_IDLE);
        await eventually(() => r.hasControl('button', NOTE_ACTIVE), `${label} : le bouton devient « ${NOTE_ACTIVE} »`);
        assert.equal(await pressedOf(NOTE_ACTIVE), 'true', `${label} : « ${NOTE_ACTIVE} » aria-pressed=true`);
        const active = await stableContrast(r, NOTE_ACTIVE, `${label} actif`);

        await r.control('button', NOTE_ACTIVE);
        await eventually(() => r.hasControl('button', NOTE_IDLE), `${label} : la pose de note est désactivée`);
        assert.equal(await pressedOf(NOTE_IDLE), 'false', `${label} : retour à aria-pressed=false`);
        const after = await stableContrast(r, NOTE_IDLE, `${label} inactif après désactivation`);

        for (const [state, m] of [['inactif', idle], ['actif', active], ['inactif après désactivation', after]]) {
          if (!(m.ratio >= MIN)) failures.push(`${label}, ${state} : ${m.ratio.toFixed(2)}:1 (texte ${m.measures.map(x => x.color).join('/')} sur fond ${m.background})`);
        }
      }
    }
  });
  assert.deepEqual(failures, [], `contraste < ${MIN}:1 :\n${failures.join('\n')}`);
});

// =====================================================================================
// G. Delta du 16 novembre 2026 — « Aller à la page » dans l'en-tête, pied réduit au filet et aux flèches
//    (contrat : docs/features/LUM-16-liseuse-onelearn.md, section finale). Rouge sur la base dc5a9b3.
// =====================================================================================
const NAV_SELECTOR = `[aria-label="${NAV}"]`;
const FIXTURE_TITLE = 'ux-long-outline.pdf';

/** Appartenance (en-tête / pied) d'un contrôle accessible, relevée sur le DOM réel. */
function membership() {
  return {
    inToolbar: Boolean(this.closest('#reader-toolbar')),
    inNav: Boolean(this.closest('[aria-label="Navigation dans le document"]')),
  };
}
/** Titre visible du document : élément feuille de l'en-tête dont le texte est le nom du fichier. */
const titleOf = (r, name) => r.evaluate(name => {
  const bar = document.querySelector('#reader-toolbar');
  const el = [...(bar?.querySelectorAll('*') ?? [])].find(e => e.children.length === 0 && e.textContent.trim() === name);
  if (!el) return null;
  const s = getComputedStyle(el), b = el.getBoundingClientRect(), fontSize = parseFloat(s.fontSize);
  return {
    left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height,
    lineHeight: s.lineHeight === 'normal' ? fontSize * 1.2 : parseFloat(s.lineHeight),
    scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, textOverflow: s.textOverflow, whiteSpace: s.whiteSpace,
  };
}, name);
/** Contenu réel de la région « Navigation dans le document ». */
const navContents = r => r.evaluate(selector => {
  const nav = document.querySelector(selector);
  if (!nav) return null;
  return {
    text: nav.innerText, content: nav.textContent,
    buttons: [...nav.querySelectorAll('button')].map(b => b.getAttribute('aria-label') || b.textContent.trim()),
    inputTypes: [...nav.querySelectorAll('input')].map(i => i.type),
    editable: nav.querySelectorAll('input[type="number"], input[type="text"], select, textarea, [role="spinbutton"], [contenteditable]').length,
  };
}, NAV_SELECTOR);
/** Vraie saisie : clic de confiance dans le champ, sélection du contenu, insertion de texte par le navigateur. */
async function typeInto(r, text) {
  await r.control('spinbutton', GOTO);
  await r.evaluate(() => document.activeElement?.select?.());
  await r.send('Input.insertText', { text });
}
const fieldValue = r => r.control('spinbutton', GOTO, function () { return this.value; });

for (const [label, width, height] of SIZES) {
  // a. Champ de page dans l'en-tête
  test(`LISEUSE-G1 — ${label} ${width}×${height} : « Aller à la page » dans #reader-toolbar, à droite du titre, au-dessus de la lecture, hors du pied`, { timeout: 60_000 }, async () => {
    await reader(width, height, async r => {
      const field = await r.control('spinbutton', GOTO, describe);
      const where = await r.control('spinbutton', GOTO, membership);
      assert.equal(where.inToolbar, true, 'le champ est un descendant de #reader-toolbar');
      assert.equal(where.inNav, false, `le champ est absent de la région « ${NAV} »`);
      assert.ok(field.shown && field.inViewport, `champ entièrement visible : ${JSON.stringify(field)}`);
      assert.ok(field.width >= 44 && field.height >= 44, `champ ≥ 44×44 (reçu ${field.width.toFixed(1)}×${field.height.toFixed(1)})`);
      assert.ok(field.container, '.pdf-viewer-container présent');
      assert.ok(field.bottom <= field.container.top + 1, `champ au-dessus du haut de .pdf-viewer-container (bas ${field.bottom.toFixed(1)} ≤ haut ${field.container.top.toFixed(1)})`);
      const title = await titleOf(r, FIXTURE_TITLE);
      assert.ok(title, `titre « ${FIXTURE_TITLE} » visible dans l'en-tête`);
      assert.ok(field.left >= title.left - 0.5, `champ à droite du bord gauche du titre (champ ${field.left.toFixed(1)} ≥ titre ${title.left.toFixed(1)})`);
      // Le pied ne contient aucun champ de page, quel que soit le moyen de le désigner.
      assert.equal((await navContents(r)).editable, 0, `aucun champ éditable dans « ${NAV} »`);
    });
  });

  // b. Pied réduit au filet et aux flèches
  test(`LISEUSE-G2 — ${label} ${width}×${height} : pied = réglette + flèches ≥ 44 px, sans champ ni « sur N », hauteur ≤ 56 px`, { timeout: 60_000 }, async () => {
    await reader(width, height, async r => {
      const nav = (await describeAll(r, NAV_SELECTOR))[0];
      assert.ok(nav, `région « ${NAV} » présente`);
      assert.ok(nav.shown && nav.inViewport, `pied entièrement visible : ${JSON.stringify(nav)}`);
      assert.ok(nav.height <= 56, `hauteur rendue du pied ≤ 56 px (reçu ${nav.height.toFixed(1)})`);
      const content = await navContents(r);
      assert.ok(!/\bsur\s+\d+/.test(content.text) && !/\bsur\s+\d+/.test(content.content), `aucun texte « sur N » dans le pied (reçu ${JSON.stringify(content.text)})`);
      assert.equal(content.editable, 0, 'aucun spinbutton ni champ éditable dans le pied');
      assert.deepEqual(content.inputTypes.filter(t => t !== 'range'), [], 'seule la réglette (input range) est un champ du pied');
      assert.deepEqual([...content.buttons].sort(), [NEXT, PREV].sort(), 'le pied ne contient que les boutons Page précédente / Page suivante');

      for (const name of [PREV, NEXT]) {
        const d = await r.control('button', name, describe), where = await r.control('button', name, membership);
        assert.equal(where.inNav, true, `${name} est dans le pied`);
        assert.ok(d.shown && d.inViewport, `${name} entièrement visible : ${JSON.stringify(d)}`);
        assert.ok(d.width >= 44 && d.height >= 44, `${name} cible ≥ 44×44 (reçu ${d.width.toFixed(1)}×${d.height.toFixed(1)})`);
      }
      const slider = await r.control('slider', PROGRESS, describe), where = await r.control('slider', PROGRESS, membership);
      assert.equal(where.inNav, true, 'la réglette est dans le pied');
      assert.ok(slider.shown && slider.inViewport && slider.width > 0, `réglette « ${PROGRESS} » visible : ${JSON.stringify(slider)}`);
    });
  });

  // c. Navigation réelle
  test(`LISEUSE-G3 — ${label} ${width}×${height} : saisie + Entrée dans l'en-tête, Échap restaure, flèches du pied`, { timeout: 90_000 }, async () => {
    await reader(width, height, async r => {
      await chooseMode(r, PAGED);
      await pageAt(r, 1);
      assert.equal((await r.control('spinbutton', GOTO, membership)).inToolbar, true, 'le champ utilisé est celui de l\'en-tête');

      // Saisie d'un numéro puis Entrée : page affichée et compteur concordants.
      await typeInto(r, '3');
      assert.equal(await fieldValue(r), '3', 'la saisie réelle est dans le champ');
      await r.key('Enter', 'Enter', 13);
      await pageAt(r, 3);

      // Échap : la valeur saisie est abandonnée, la page ne change pas.
      await typeInto(r, '5');
      assert.equal(await fieldValue(r), '5', 'valeur en cours de saisie avant Échap');
      await r.key('Escape', 'Escape', 27);
      await eventually(async () => await fieldValue(r) === '3', 'Échap restaure la valeur (page 3)');
      await pageAt(r, 3);

      // Flèches du pied : vraies cliques, une page à la fois.
      assert.equal((await r.control('button', PREV, membership)).inNav, true, 'flèche précédente dans le pied');
      await r.control('button', PREV);
      await pageAt(r, 2);
      await r.control('button', NEXT);
      await pageAt(r, 3);
      await r.control('button', NEXT);
      await pageAt(r, 4);
      assert.equal(await counter(r), 4);
      assert.equal(await dominantPage(r), 4);
    });
  });
}

// d. Titre très long (nom de fichier > 150 caractères) : une ligne, tronqué, sans débordement.
for (const [label, width, height] of SIZES) {
  test(`LISEUSE-G4 — ${label} ${width}×${height} : titre de plus de 150 caractères sur une ligne tronquée, sans débordement, commandes entières`, { timeout: 90_000 }, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lumina-long-title-'));
    try {
      const name = `${'Rapport annuel détaillé sur la conservation des archives numériques '.repeat(3)}version finale.pdf`;
      assert.ok(name.length > 150, `nom de fichier > 150 caractères (reçu ${name.length})`);
      const pdf = join(dir, name);
      await copyFile(LONG, pdf);
      await reader(width, height, async r => {
        const title = await titleOf(r, name);
        assert.ok(title, 'titre complet présent dans l\'en-tête');
        assert.ok(title.width > 0 && title.height > 0, 'titre affiché');
        assert.ok(title.height < 1.6 * title.lineHeight, `titre sur une ligne (hauteur ${title.height.toFixed(1)} < 1,6 × ${title.lineHeight})`);
        assert.ok(title.scrollWidth > title.clientWidth || title.textOverflow === 'ellipsis',
          `titre tronqué (scrollWidth ${title.scrollWidth} > clientWidth ${title.clientWidth} ou ellipsis : ${title.textOverflow})`);
        assert.ok(title.left >= -0.5 && title.right <= width + 0.5, `titre dans la fenêtre (${title.left.toFixed(1)}–${title.right.toFixed(1)})`);
        const overflow = await r.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth }));
        assert.ok(overflow.scrollWidth <= overflow.innerWidth, `aucun débordement horizontal du document (${overflow.scrollWidth} ≤ ${overflow.innerWidth})`);

        const field = await r.control('spinbutton', GOTO, describe);
        assert.equal((await r.control('spinbutton', GOTO, membership)).inToolbar, true, 'le champ de page est dans l\'en-tête');
        for (const [what, d] of [['« Aller à la page »', field], ['Retour', await r.control('button', 'Revenir à la bibliothèque', describe)], ['Ajuster', await r.control('button', 'Ajuster la page', describe)]]) {
          assert.ok(d.shown && d.inViewport, `${what} entièrement visible avec un titre long : ${JSON.stringify(d)}`);
          assert.ok(d.width >= 44 && d.height >= 44, `${what} ≥ 44×44`);
        }
        assert.ok(title.right <= field.left + 1, `le titre tronqué ne passe pas sous le champ de page (titre → ${title.right.toFixed(1)}, champ ← ${field.left.toFixed(1)})`);
      }, pdf);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
}

// e. Immersion H : le champ de page de l'en-tête disparaît avec l'en-tête puis revient.
test('LISEUSE-G5 — immersion : le champ « Aller à la page » de l’en-tête est masqué par H avec l’en-tête, puis restauré', { timeout: 60_000 }, async () => {
  await reader(1440, 900, async r => {
    const state = async () => {
      const present = await r.hasControl('spinbutton', GOTO);
      const field = present ? await r.control('spinbutton', GOTO, describe) : null;
      const where = present ? await r.control('spinbutton', GOTO, membership) : null;
      return {
        champ: Boolean(field?.shown && field.inViewport), champDansEnTete: Boolean(where?.inToolbar),
        entete: (await describeAll(r, '#reader-toolbar')).some(d => d.shown),
      };
    };
    let s;
    await eventually(async () => { s = await state(); return s.champ && s.entete; }, 'précondition : en-tête et champ visibles');
    assert.equal(s.champDansEnTete, true, 'le champ visible est dans #reader-toolbar');
    await r.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 720, y: 450 });
    await r.evaluate(() => document.activeElement?.blur());
    await press(r, 'h', 'KeyH', 72);
    await eventually(async () => { s = await state(); return !s.champ && !s.entete; }, 'H masque l\'en-tête et le champ de page');
    await r.evaluate(() => document.activeElement?.blur());
    await press(r, 'h', 'KeyH', 72);
    await eventually(async () => { s = await state(); return s.champ && s.entete && s.champDansEnTete; }, `H restaure l'en-tête et le champ (dernier état ${JSON.stringify(s)})`);
  });
});
