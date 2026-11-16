// UX / reprise — attentes issues du contrat public et de la maquette approuvée, jamais du code applicatif.
// Exécution ciblée : READER_TEST_URL=http://127.0.0.1:3016 node --test tests/ux-recovery.test.mjs
// Contextes Edge neufs, SW contourné par storage-cdp ; aucune preuve PWA installée ou sur appareil réel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { launch } from './reader-cdp.mjs';
import {
  createSession, eventually, pause, waitDb, readDb, goHome, clickCard, goTo,
  setMode, counter, openTools, closeTools, PAGED, CONTINUOUS,
} from './storage-cdp.mjs';
import {
  axControls, namedButton, tabTo, pageAt, pdfRect, samePdf, outlineScroll,
  DENIED_IDB, rgb, contrast, palettePaint,
} from './helpers/ux-cdp.mjs';
import { OUTLINE_COUNT, outlineTitle, buildUxOutlinePdf } from './helpers/ux-long-outline.mjs';

const fixture = name => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const FIVE = fixture('reader-5-pages.pdf'), MIXED = fixture('reader-mixed-pages.pdf');
const LONG = fixture('ux-long-outline.pdf');
const FIVE_NAME = 'reader-5-pages.pdf', MIXED_NAME = 'reader-mixed-pages.pdf';
const palettes = JSON.parse(await readFile(fixture('ux-approved-palettes.json'), 'utf8'));
const themeNames = {
  light: ['Clair'], solarized: ['Confort', 'Solarisé'], sepia: ['Sépia'], forest: ['Forêt'],
  midnight: ['Minuit'], dark: ['Sombre'], blue_night: ['Bleu nuit', 'Nuit bleue'],
  oled: ['OLED'], eink: ['eInk', 'E-Ink'],
};

let browser;
// Un seul navigateur possédé par cette suite ; chaque cas fonctionnel a sa propre base vierge.
test.before(async () => { browser = await launch(); });
test.after(async () => { if (browser) await browser.close(); });
async function scenario(fn, options = {}) {
  const r = await createSession(browser, { width: 1280, height: 900, ...options });
  try { await fn(r); } finally { await r.close(); }
}
const text = r => r.evaluate(() => document.body.innerText);
const stored = (r, count) => waitDb(r, d => d.files.length === count && d.metadata.length === count, `${count} document(s) conservé(s)`);
async function libraryControlsReady(r, names = [FIVE_NAME, MIXED_NAME]) {
  // Le texte peut précéder la publication AX : attendre les actions avant de les vérifier ou les activer.
  await eventually(async () => {
    const controls = await axControls(r);
    return names.every(name =>
      controls.filter(n => n.role === 'button' && n.name?.includes(name) && /ouvrir|reprendre|continuer.*lecture/i.test(n.name) && !/retirer/i.test(n.name)).length === 1 &&
      controls.filter(n => n.role === 'button' && n.name === `Retirer ${name} de la bibliothèque`).length === 1);
  }, `actions accessibles de la bibliothèque prêtes : ${names.join(', ')}`);
}
async function importTwo(r) {
  await r.load();
  await r.openPdf(FIVE, 'library');
  await stored(r, 1);
  await r.openPdf(MIXED, 'toolbar');
  await stored(r, 2);
  await goHome(r);
  await eventually(async () => (await text(r)).includes(FIVE_NAME) && (await text(r)).includes(MIXED_NAME), 'les deux lectures sont visibles');
  await libraryControlsReady(r);
}
async function remove(r, name) {
  const previous = r.dialogs.length;
  r.policy.accept = true;
  await r.control('button', `Retirer ${name} de la bibliothèque`);
  await eventually(() => r.dialogs.length === previous + 1, 'confirmation native du retrait');
  assert.equal(r.dialogs.at(-1).type, 'confirm');
  assert.ok(r.dialogs.at(-1).message.includes(name), 'la confirmation identifie le document retiré');
}
async function noDocument(r, name) {
  assert.ok(!(await text(r)).includes(name), `${name} ne réapparaît pas dans la bibliothèque`);
  const db = await readDb(r);
  assert.ok(!db.metadata.some(m => m.name === name), `${name} reste retiré du stockage`);
}

// Le retrait d'un document jamais relu et celui de la dernière lecture active ont des risques différents.
test('UX1 — le retrait confirmé survit à la réouverture de la bibliothèque, y compris le dernier PDF', { timeout: 65_000 }, async () => {
  await scenario(async r => {
    await importTwo(r);
    await remove(r, FIVE_NAME);
    await stored(r, 1);
    await noDocument(r, FIVE_NAME);
    // Relire le survivant puis revenir force un nouveau passage lecteur → bibliothèque.
    await clickCard(r, MIXED_NAME);
    await r.waitForPage();
    await goHome(r);
    await libraryControlsReady(r, [MIXED_NAME]);
    await noDocument(r, FIVE_NAME);
    await remove(r, MIXED_NAME);
    await stored(r, 0);
    // Couvre aussi un enregistrement différé du document qui vient d'être quitté.
    await pause(3_800);
    await noDocument(r, FIVE_NAME);
    await noDocument(r, MIXED_NAME);
    assert.equal(await r.hasControl('spinbutton', 'Aller à la page'), false, 'aucun lecteur fantôme');
    await r.load(); // réouvrir l'application sur la même base, sans réimporter le PDF
    await stored(r, 0);
    await noDocument(r, MIXED_NAME);
    await r.reload();
    await stored(r, 0);
    await noDocument(r, FIVE_NAME);
    await noDocument(r, MIXED_NAME);
    assert.match(await text(r), /premier PDF|bibliothèque.*vide|aucun (?:document|PDF)/i, 'un état vide explicite reste affiché');
  });
});

test('UX2 — héros et autre lecture : vrais boutons nommés, Tab puis Enter / Espace, retrait distinct', { timeout: 65_000 }, async () => {
  await scenario(async r => {
    await importTwo(r);
    // MIXED est la dernière lecture (héros), FIVE est une autre lecture.
    for (const [name, pages, key, code, vk] of [[MIXED_NAME, 3, 'Enter', 'Enter', 13], [FIVE_NAME, 5, ' ', 'Space', 32]]) {
      const controls = await axControls(r);
      const open = controls.filter(n => n.role === 'button' && n.name?.includes(name) && /ouvrir|reprendre|continuer.*lecture/i.test(n.name) && !/retirer/i.test(n.name));
      assert.equal(open.length, 1, `un bouton Ouvrir/Reprendre nomme explicitement ${name} ; boutons : ${controls.filter(n => n.role === 'button').map(n => n.name).join(' ; ')}`);
      const removeName = `Retirer ${name} de la bibliothèque`;
      assert.equal(await r.hasControl('button', removeName), true, 'le retrait reste une action séparée');
      assert.equal(await r.control('button', open[0].name, function () {
        return this.tagName === 'BUTTON' && !this.querySelector('button') && !this.parentElement?.closest('button');
      }), true, 'ouverture par un bouton HTML non imbriqué');
      await tabTo(r, 'button', open[0].name);
      await r.key(key, code, vk);
      await r.waitForPage();
      assert.equal(await r.control('spinbutton', 'Aller à la page', function () { return Number(this.max); }), pages, 'le bon PDF a réellement été ouvert');
      assert.equal(r.dialogs.length, 0, 'activer la lecture ne déclenche pas de retrait');
      await goHome(r);
      await stored(r, 2);
      await libraryControlsReady(r);
    }
  });
});

test('UX3 — jauge tactile accessible : souris et clavier naviguent réellement dans le PDF', { timeout: 45_000 }, async () => {
  await scenario(async r => {
    await r.load(); await r.openPdf(FIVE, 'library');
    await setMode(r, PAGED); await goTo(r, 1);
    await r.control('button', 'Ajuster la page'); await pageAt(r, 1);
    const candidates = (await axControls(r)).filter(n => n.name === 'Progression de lecture' && ['slider', 'scrollbar', 'spinbutton'].includes(n.role));
    assert.equal(candidates.length, 1, 'la jauge expose un vrai contrôle de navigation nommé Progression de lecture');
    const { role, name } = candidates[0];
    const target = await r.control(role, name, function () {
      const b = this.getBoundingClientRect();
      return { x: b.left + b.width * 0.78, y: b.top + b.height / 2, height: b.height, width: b.width };
    });
    assert.ok(target.height >= 44, `cible de la jauge ≥ 44 px de haut (reçu ${target.height})`);
    await r.click({ x: target.x, y: target.y });
    await eventually(async () => await counter(r) > 1, 'un clic dans la jauge change le compteur');
    const selected = await counter(r);
    await pageAt(r, selected);
    // Tab vérifie la disponibilité clavier même si le clic ne laisse pas le focus sur le contrôle.
    if (!await r.control(role, name, function () { return document.activeElement === this; })) await tabTo(r, role, name);
    await r.key('Home', 'Home', 36); await pageAt(r, 1);
    await r.key('End', 'End', 35); await pageAt(r, 5);
  });
});

test('UX4 — la molette défile le vrai sommaire long sans tourner ni zoomer le PDF', { timeout: 50_000 }, async () => {
  // Vérifie que la fixture versionnée correspond toujours au générateur indépendant.
  assert.deepEqual(await readFile(LONG), buildUxOutlinePdf());
  await scenario(async r => {
    await r.load(); await r.openPdf(LONG, 'library');
    await setMode(r, PAGED); await goTo(r, 3);
    await r.control('button', 'Ajuster la page'); await pageAt(r, 3);
    if (!await r.hasControl('button', 'Sommaire')) await openTools(r);
    await r.control('button', 'Sommaire');
    await eventually(async () => (await text(r)).includes(outlineTitle(OUTLINE_COUNT)), 'les vraies entrées PDF du sommaire sont présentes');
    // Les outils peuvent avoir servi à l'ouverture, mais ne doivent pas recouvrir le sommaire.
    await closeTools(r);
    const box = await eventually(() => outlineScroll(r), 'le sommaire déborde réellement');
    assert.equal(box.hitInside, true, 'le geste vise le panneau et non le PDF derrière');
    await pause(450);
    const before = await pdfRect(r), page = await counter(r);
    const issues = [];
    await r.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
    await r.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: box.x, y: box.y, deltaX: 0, deltaY: 420 });
    try {
      await eventually(async () => (await outlineScroll(r))?.top > box.top + 20, 'la molette défile effectivement le sommaire', 2_500);
    } catch (error) {
      if (!error.message.startsWith('Timed out:')) throw error;
      issues.push(error.message);
    }
    await pause(350);
    const beforeZoom = await pdfRect(r), pageBeforeZoom = await counter(r);
    try { samePdf(before, beforeZoom); } catch (error) {
      if (error.code !== 'ERR_ASSERTION') throw error;
      issues.push(error.message);
    }
    if (pageBeforeZoom !== page) issues.push(`molette ordinaire : compteur ${page} → ${pageBeforeZoom}`);
    await r.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: box.x, y: box.y, deltaX: 0, deltaY: -240, modifiers: 2 });
    await pause(650);
    try { samePdf(beforeZoom, await pdfRect(r)); } catch (error) {
      if (error.code !== 'ERR_ASSERTION') throw error;
      issues.push(`Ctrl+molette : ${error.message}`);
    }
    if (await counter(r) !== pageBeforeZoom) issues.push('Ctrl+molette a changé le compteur');
    assert.deepEqual(issues, [], issues.join(' ; '));
  });
});

test('UX5 — changer de mode ne crée pas d’entrées et un vrai Retour quitte l’application sans piège', { timeout: 45_000 }, async () => {
  await scenario(async r => {
    await r.openBlankOrigin();
    const prior = `${r.origin}/__lumina_ux_prior__?repere=avant-montage`;
    await r.evaluate(url => history.replaceState({ uxPrior: true }, '', url), prior);
    await r.load(); await r.openPdf(FIVE, 'library');
    const mounted = await r.send('Page.getNavigationHistory');
    for (const mode of [PAGED, CONTINUOUS, PAGED, CONTINUOUS]) await setMode(r, mode);
    const changed = await r.send('Page.getNavigationHistory');
    // Ne pas interrompre avant le Retour : on observe aussi l'absence de réinjection à la traversée.
    const errors = [];
    if (changed.entries.length !== mounted.entries.length || changed.currentIndex !== mounted.currentIndex) {
      errors.push(`les modes ont grossi l'historique : montage=${mounted.entries.length}/${mounted.currentIndex}, après=${changed.entries.length}/${changed.currentIndex}`);
    }
    const priorIndex = mounted.entries.findLastIndex(e => e.url === prior);
    assert.ok(priorIndex >= 0 && priorIndex < mounted.currentIndex, 'l’entrée antérieure existe réellement');
    // Autorise les éventuelles étapes légitimes déjà présentes au montage, pas un nombre arbitraire de Retour.
    // Chaque passage utilise la vraie traversée du navigateur, jamais un saut forcé à l'entrée cible.
    let h = changed;
    for (let i = 0; i < mounted.currentIndex - priorIndex && h.entries[h.currentIndex]?.url !== prior; i++) {
      const previousIndex = h.currentIndex;
      await r.evaluate(() => history.back());
      await pause(500);
      h = await r.send('Page.getNavigationHistory');
      if (h.currentIndex >= previousIndex) {
        errors.push(`Retour bloqué ou entrée réinjectée (index ${previousIndex} → ${h.currentIndex})`);
        break;
      }
    }
    if (h.entries[h.currentIndex]?.url !== prior) errors.push('Retour ne retrouve pas l’entrée préparée dans les étapes observées au montage');
    await pause(500);
    const after = await r.send('Page.getNavigationHistory');
    if (h.entries[h.currentIndex]?.url === prior && after.entries[after.currentIndex]?.url !== prior) errors.push('l’application réinjecte une entrée après le Retour');
    assert.deepEqual(errors, [], errors.join(' ; '));
  });
});

test('UX6 — stockage refusé : erreur française, pas de faux état vide, puis Réessayer récupère les lectures', { timeout: 45_000 }, async () => {
  await scenario(async r => {
    await r.load(); await r.openPdf(FIVE, 'library'); await stored(r, 1); await goHome(r);
    await r.evaluate(() => { sessionStorage.setItem('__uxDenyIdb', '1'); sessionStorage.removeItem('__uxDeniedCalls'); });
    await r.reload();
    await eventually(() => r.evaluate(() => Number(sessionStorage.getItem('__uxDeniedCalls')) > 0), 'le refus IndexedDB a bien été exercé');
    const message = await text(r);
    const issues = [];
    if (!/(impossible|erreur|refus|indisponible|échec)/i.test(message) || !/(biblioth|stockage|documents)/i.test(message)) issues.push('une erreur française doit expliquer que la bibliothèque est inaccessible');
    if (/premier PDF/i.test(message)) issues.push('le refus de stockage ne doit pas annoncer « premier PDF »');
    const retry = (await axControls(r)).filter(n => n.role === 'button' && /^réessayer$/i.test(n.name));
    if (retry.length !== 1) issues.push('un bouton accessible Réessayer doit être proposé');
    assert.deepEqual(issues, [], `${issues.join(' ; ')}. Écran obtenu : ${message.slice(0, 700)}`);
    await r.evaluate(() => sessionStorage.removeItem('__uxDenyIdb'));
    await r.control('button', retry[0].name);
    await eventually(async () => (await text(r)).includes(FIVE_NAME), 'Réessayer retrouve la lecture sans recharger');
    await stored(r, 1);
    assert.equal(await r.hasControl('button', retry[0].name), false, 'l’état d’erreur disparaît après récupération');
  }, { init: [DENIED_IDB] });
});

function paintIssues(actual, p) {
  const issues = [];
  for (const [key, expected] of Object.entries(p)) if (actual.tokens[key] !== expected) issues.push(`${key}: ${actual.tokens[key] || '(absent)'} ≠ ${expected}`);
  // Contrastes calculés indépendamment, sur les tokens effectivement affichés, pas sur _cr de la maquette.
  for (const [fg, bg] of [['text', 'surface'], ['muted', 'surface'], ['accent', 'surface'], ['text', 'desk'], ['muted', 'desk'], ['accent', 'desk'], ['ink', 'page']]) {
    if (/^#[0-9A-F]{6}$/.test(actual.tokens[fg]) && /^#[0-9A-F]{6}$/.test(actual.tokens[bg])) {
      const ratio = contrast(actual.tokens[fg], actual.tokens[bg]);
      if (ratio < 4.5) issues.push(`contraste ${fg}/${bg}: ${ratio.toFixed(2)} < 4,5`);
    } else issues.push(`contraste ${fg}/${bg} impossible à mesurer`);
  }
  const cssRgb = hex => `rgb(${rgb(hex).join(', ')})`;
  if (actual.desk !== cssRgb(p.desk)) issues.push(`fond réellement affiché: ${actual.desk} ≠ ${cssRgb(p.desk)}`);
  if (actual.text !== cssRgb(p.text)) issues.push(`texte réellement affiché: ${actual.text} ≠ ${cssRgb(p.text)}`);
  // Le bandeau peut être translucide : sa couleur de surface doit rester celle approuvée.
  const channels = actual.surface?.match(/[\d.]+/g)?.map(Number);
  if (!channels || channels.slice(0, 3).some((v, i) => Math.abs(v - rgb(p.surface)[i]) > 0.5) || (channels[3] ?? 1) < 0.8) {
    issues.push(`surface réellement affichée (panneau #reader-tools ouvert): ${actual.surface} ne correspond pas à ${p.surface}`);
  }
  // LUM-16 : l'en-tête n'a pas de fond propre ; son fond effectif est celui du bureau (ou de la surface).
  const header = actual.header?.match(/[\d.]+/g)?.map(Number);
  const sameRgb = hex => header && header.slice(0, 3).every((v, i) => Math.abs(v - rgb(hex)[i]) <= 0.5);
  if (!header || !(sameRgb(p.desk) || sameRgb(p.surface))) {
    issues.push(`fond effectif de l'en-tête #reader-toolbar: ${actual.header} n'est égal ni à desk ${p.desk} ni à surface ${p.surface}`);
  }
  return issues;
}
function filterIssues(actual, p, theme, variant) {
  const issues = [];
  const filters = actual.filters.join(' ');
  if (p.page === '#FFFFFF' && p.ink === '#000000' && theme !== 'eink') {
    if (actual.filters.length) issues.push(`${theme}/${variant} doit conserver le PDF blanc/noir sans filtre (reçu ${filters})`);
    return issues;
  }
  if (theme === 'eink' && !/grayscale\(1\)/.test(filters)) issues.push('eInk doit désaturer les images');
  if (actual.matrices.length !== 1) return [...issues, 'un filtre PDF de couleur actif doit être relié au rendu'];
  const { values: matrix, type } = actual.matrices[0];
  if (type !== 'matrix' || matrix.length !== 20 || matrix.some(v => !Number.isFinite(v))) return [...issues, 'matrice PDF inexploitable'];
  // Noir et blanc neutres ne sont pas affectés par la rotation de teinte de nuit.
  // On vérifie leurs couleurs de sortie, sans recopier la formule de l'implémentation.
  for (const [sample, target] of [[0, p.ink], [1, p.page]]) {
    const expected = rgb(target);
    for (let channel = 0; channel < 3; channel++) {
      const row = matrix.slice(channel * 5, channel * 5 + 5);
      const out = (sample * (row[0] + row[1] + row[2]) + row[3] + row[4]) * 255;
      if (Math.abs(out - expected[channel]) > 1) issues.push(`filtre PDF ${sample === 0 ? 'noir→encre' : 'blanc→papier'}, canal ${channel}: ${out.toFixed(1)} ≠ ${expected[channel]}`);
    }
  }
  return issues;
}

test('UX7 — les 18 palettes approuvées se retrouvent dans les styles affichés et le filtre PDF', { timeout: 90_000 }, async t => {
  await scenario(async r => {
    await r.load(); await r.openPdf(FIVE, 'library');
    await eventually(() => r.evaluate(() => Boolean(document.querySelector('#pdf-workspace canvas'))), 'canevas PDF prêt');
    await openTools(r);
    for (const [theme, names] of Object.entries(themeNames)) {
      for (const variant of ['jour', 'nuit']) {
        await t.test(`${names[0]} / ${variant}`, async () => {
          const p = palettes[theme][variant];
          // La fixture approuvée est elle-même contrôlée, sans adopter les anciennes valeurs de production.
          for (const [fg, bg] of [['text', 'surface'], ['muted', 'surface'], ['accent', 'surface'], ['text', 'desk'], ['muted', 'desk'], ['accent', 'desk'], ['ink', 'page']]) {
            assert.ok(contrast(p[fg], p[bg]) >= 4.5, `la référence ${theme}/${variant} garantit ${fg}/${bg} ≥ 4,5`);
          }
          await r.control('button', await namedButton(r, names));
          await r.control('button', await namedButton(r, variant === 'jour' ? ['Jour', 'Mode Jour'] : ['Nuit', 'Mode Nuit']));
          await pause(400); // transitions de couleur et rendu différé, pas une validation par valeur DOM seule
          const actual = await palettePaint(r);
          const issues = [...paintIssues(actual, p), ...filterIssues(actual, p, theme, variant)];
          assert.deepEqual(issues, [], `${theme}/${variant} : ${issues.join(' ; ')}`);
        });
      }
    }
  });
});
