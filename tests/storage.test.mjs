// LUM-4 — conservation locale (PDF, progression, zoom, notes) : preuves en navigateur réel, boîte noire.
// Chaque scénario s'exécute dans un contexte navigateur isolé (IndexedDB vierge) ; aucune lecture du code de production.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './reader-cdp.mjs';
import {
  createSession, eventually, pause, sha256Id, readDb, seedDb, waitDb, metaById, PROBES, PERSIST_PROBE, NO_SUBTLE,
  putLog, clearPutLog, leave, visibleAlerts, clickNth, waitLibrary, clickCard, libraryNames, goHome, goTo, counter,
  setMode, currentMode, CONTINUOUS, PAGED, dominantPage, addNote, noteTitles, markerCount, zoomIn, zoomLabel,
  openTools, closeTools,
} from './storage-cdp.mjs';

const fixture = name => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const FIVE = fixture('reader-5-pages.pdf');   // 5 pages
const MIXED = fixture('reader-mixed-pages.pdf'); // 3 pages, contenu différent
const bytesFive = await readFile(FIVE);
const bytesMixed = await readFile(MIXED);
const ID_FIVE = sha256Id(bytesFive);
const ID_MIXED = sha256Id(bytesMixed);
const SHA_FORMAT = /^sha256-[0-9a-f]{64}$/;

// Deux fichiers de même nom « doc.pdf », contenus différents ; un troisième nom pour le même contenu que FIVE.
const work = await mkdtemp(join(tmpdir(), 'lumina-storage-test-'));
const same = { a: join(work, 'a', 'doc.pdf'), b: join(work, 'b', 'doc.pdf'), renamed: join(work, 'c', 'autre-nom.pdf') };
await Promise.all(['a', 'b', 'c'].map(d => mkdir(join(work, d))));
await copyFile(FIVE, same.a);
await copyFile(MIXED, same.b);
await copyFile(FIVE, same.renamed);

const browser = await launch();
test.after(async () => { await browser.close(); await rm(work, { recursive: true, force: true }); });

async function scenario(t, options, fn) {
  const r = await createSession(browser, { width: 1440, height: 1000, ...options, init: options?.init ?? [PROBES] });
  try { await fn(r); } finally { await r.close(); }
}
const note = (id, pageNumber, text) => ({ id, pageNumber, x: 40, y: 30, text, color: '#facc15', createdAt: 1_700_000_000_000 });
const need = (db, id) => { const m = metaById(db, id); assert.ok(m, `fiche ${id} absente ; fiches présentes : ${JSON.stringify(db.metadata.map(x => x.id))}`); return m; };
const ids = list => list.map(m => m.id).sort();
const settle = () => pause(3_800); // plus long que l'enregistrement périodique de 3 s
const asBase64 = bytes => Buffer.from(bytes).toString('base64');
// Préconditions de mise en place : on retrouve le document par empreinte, ou à défaut par son ancien identifiant (nom),
// afin que l'infrastructure reste exercée même quand la fonctionnalité d'identité n'existe pas encore.
const docOf = (db, id, legacy) => metaById(db, id) ?? (legacy ? metaById(db, legacy) : undefined);
const metaPuts = (log, id, legacy) => log.filter(e => e.store === 'metadata' && (e.key === id || e.key === legacy));

// ─────────────────────────────────────────────────────────────────────────────
// 1. Identité par contenu
// ─────────────────────────────────────────────────────────────────────────────

test('(a) deux PDF homonymes de contenus différents : deux documents, progressions distinctes, copies intactes', { timeout: 90_000 }, async t => {
  await scenario(t, {}, async r => {
    await r.load();
    await r.openPdf(same.a, 'library');
    await goTo(r, 3);
    await waitDb(r, db => docOf(db, ID_FIVE, 'doc.pdf')?.pageNumber === 3, 'A enregistré à la page 3');
    await r.openPdf(same.b, 'toolbar');
    await goTo(r, 2);
    const db = await waitDb(r, db => docOf(db, ID_MIXED, 'doc.pdf')?.pageNumber === 2, 'B enregistré à la page 2');

    assert.deepEqual(ids(db.metadata), [ID_FIVE, ID_MIXED].sort(), 'exactement deux fiches, identifiants sha256-<empreinte>');
    assert.ok(db.metadata.every(m => SHA_FORMAT.test(m.id) && m.name === 'doc.pdf'));
    assert.deepEqual(ids(db.files), [ID_FIVE, ID_MIXED].sort(), 'deux copies, aucune clé au nom du fichier');
    assert.equal(db.files.find(f => f.id === ID_FIVE).sha, ID_FIVE.slice(7), 'copie de A intacte');
    assert.equal(db.files.find(f => f.id === ID_MIXED).sha, ID_MIXED.slice(7), 'copie de B intacte');
    assert.equal(need(db, ID_FIVE).pageNumber, 3, 'la progression de A n\'a pas été remplacée par B');

    // Réouvrir A : sa page, sans écraser ni B ni A ; aucune sauvegarde ne mélange les valeurs des deux documents.
    await clearPutLog(r);
    await r.openPdf(same.a, 'toolbar');
    await eventually(async () => await counter(r) === 3, 'A restauré à la page 3', 8_000);
    await settle();
    const after = await readDb(r);
    assert.equal(after.metadata.length, 2);
    assert.equal(need(after, ID_FIVE).pageNumber, 3);
    assert.equal(need(after, ID_MIXED).pageNumber, 2);
    const log = await putLog(r);
    assert.ok(metaPuts(log, ID_FIVE).every(e => e.pageNumber === 3), `écritures de A avec une page étrangère/provisoire: ${JSON.stringify(metaPuts(log, ID_FIVE))}`);
    assert.ok(metaPuts(log, ID_MIXED).every(e => e.pageNumber === 2), `écritures de B avec une page étrangère/provisoire: ${JSON.stringify(metaPuts(log, ID_MIXED))}`);

    await goHome(r);
    assert.deepEqual(await waitLibrary(r, 2), ['doc.pdf', 'doc.pdf'], 'deux entrées dans la bibliothèque');
  });
});

test('(a2) même contenu sous un autre nom : même fiche, nom affiché = dernier utilisé, progression retrouvée', { timeout: 60_000 }, async t => {
  await scenario(t, {}, async r => {
    await r.load();
    await r.openPdf(same.a, 'library');
    await goTo(r, 3);
    await waitDb(r, db => docOf(db, ID_FIVE, 'doc.pdf')?.pageNumber === 3, 'A à la page 3');
    await r.openPdf(same.renamed, 'toolbar');
    await eventually(async () => await counter(r) === 3, 'progression retrouvée sous un autre nom', 8_000);
    const db = await waitDb(r, db => metaById(db, ID_FIVE)?.name === 'autre-nom.pdf', 'nom mis à jour');
    assert.equal(db.metadata.length, 1, 'une seule fiche');
    assert.equal(db.files.length, 1, 'une seule copie');
    assert.equal(db.metadata[0].pageNumber, 3);
  });
});

test('(i) hors contexte sécurisé (crypto.subtle absent) : même identifiant', { timeout: 60_000 }, async t => {
  await scenario(t, { init: [PROBES, NO_SUBTLE] }, async r => {
    await r.load();
    assert.equal(await r.evaluate(() => typeof crypto.subtle), 'undefined', 'précondition : crypto.subtle absent');
    await r.openPdf(FIVE, 'library');
    const db = await waitDb(r, db => db.metadata.length === 1, 'fiche enregistrée sans crypto.subtle');
    assert.equal(db.metadata[0].id, ID_FIVE, 'même empreinte que le calcul natif');
    assert.equal(db.files[0].id, ID_FIVE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Une seule ouverture ; 3. restauration réelle
// ─────────────────────────────────────────────────────────────────────────────

for (const via of ['barre « Choisir un PDF »', 'carte de la bibliothèque', 'glisser-déposer']) {
  test(`(b) réouverture par ${via} : page, zoom, notes, aperçu conservés, rien d'écrasé`, { timeout: 90_000 }, async t => {
    await scenario(t, {}, async r => {
      await r.load();
      await r.openPdf(FIVE, 'library');
      await goTo(r, 3);
      const label0 = await zoomLabel(r);
      await zoomIn(r, 2);
      const label = await zoomLabel(r);
      assert.notEqual(label, label0, 'le zoom a bien changé');
      const wanted = parseInt(label, 10) / 100;
      await closeTools(r);
      await addNote(r, 'note b');
      const saved = await waitDb(r, db => {
        const m = docOf(db, ID_FIVE, 'reader-5-pages.pdf');
        return m?.pageNumber === 3 && Math.abs(m.scale - wanted) < 0.01 && m.annotations?.length === 1;
      }, `page 3, zoom ${label} et note enregistrés`);
      const scale = docOf(saved, ID_FIVE, 'reader-5-pages.pdf').scale;
      await closeTools(r);

      // Un aperçu déjà présent ne doit pas être régénéré/écrasé.
      const MARKER = 'data:image/jpeg;base64,/9j/MARQUEUR-EXISTANT';
      await r.evaluate(async (id, marker) => {
        const db = await new Promise((res, rej) => { const q = indexedDB.open('LuminaDB'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
        await new Promise((res, rej) => {
          const tx = db.transaction('metadata', 'readwrite');
          const store = tx.objectStore('metadata');
          const get = store.get(id);
          get.onsuccess = () => store.put({ ...get.result, thumbnail: marker });
          tx.oncomplete = res; tx.onerror = () => rej(tx.error);
        });
        db.close();
      }, ID_FIVE, MARKER);
      await clearPutLog(r);

      if (via.startsWith('barre')) await r.openPdf(FIVE, 'toolbar');
      else {
        await goHome(r);
        await waitLibrary(r, 1);
        if (via.startsWith('carte')) { await clickCard(r, 'reader-5-pages.pdf'); await r.waitForPage(); }
        else { await r.drop(FIVE); await r.waitForPage(); }
      }
      await eventually(async () => await counter(r) === 3, 'page 3 restaurée', 8_000);
      assert.equal(await currentMode(r), 'paged', 'mode conservé');
      assert.equal(await zoomLabel(r), label, 'zoom mémorisé repris sur PC');
      await closeTools(r);
      await eventually(async () => (await noteTitles(r)).includes('note b'), 'note affichée après réouverture', 6_000);
      await settle();

      const log = metaPuts(await putLog(r), ID_FIVE, 'reader-5-pages.pdf');
      assert.ok(log.every(e => e.pageNumber === 3 && Math.abs(e.scale - scale) < 0.01 && e.notes === 1),
        `écriture provisoire ou écrasante pendant/après la réouverture: ${JSON.stringify(log)}`);
      const db = await readDb(r);
      assert.equal(db.metadata.length, 1, 'aucune fiche en double');
      const m = need(db, ID_FIVE);
      assert.equal(m.pageNumber, 3, 'page non remise à 1');
      assert.ok(Math.abs(m.scale - scale) < 0.01, `zoom non réinitialisé (${m.scale} vs ${scale})`);
      assert.deepEqual(m.annotations.map(a => a.text), ['note b'], 'notes conservées');
      assert.equal(m.thumbnailValue, MARKER, 'aperçu existant non régénéré');
      assert.equal(m.scrollMode, 'paged');
    });
  });
}

for (const [mode, label, page] of [['continuous', CONTINUOUS, 4], ['paged', PAGED, 3]]) {
  test(`(c) mode ${mode} : page ${page} mémorisée, rechargement, réouverture depuis la bibliothèque, aucune réécriture provisoire`, { timeout: 90_000 }, async t => {
    await scenario(t, {}, async r => {
      await r.load();
      await r.openPdf(FIVE, 'library');
      await setMode(r, label);
      await goTo(r, page);
      await waitDb(r, db => docOf(db, ID_FIVE, 'reader-5-pages.pdf')?.pageNumber === page && docOf(db, ID_FIVE, 'reader-5-pages.pdf')?.scrollMode === mode, `page ${page} et mode ${mode} enregistrés`);
      await settle();
      assert.equal(docOf(await readDb(r), ID_FIVE, 'reader-5-pages.pdf').pageNumber, page, 'la page mémorisée n\'est pas écrasée au repos');

      await clearPutLog(r);
      await r.reload();
      await waitLibrary(r, 1);
      await clickCard(r, 'reader-5-pages.pdf');
      await r.waitForPage();
      assert.equal(await currentMode(r), mode, 'mode restauré');
      await eventually(async () => await counter(r) === page, `compteur sur la page ${page}`, 10_000);
      if (mode === 'continuous') await eventually(async () => await dominantPage(r) === page, `vue amenée sur la page ${page}`, 10_000);
      else await eventually(async () => (await dominantPage(r)) === page, `page ${page} affichée`, 10_000);
      await settle();

      assert.equal(await counter(r), page, 'toujours sur la page mémorisée');
      assert.equal(await dominantPage(r), page, 'vue toujours sur la page mémorisée');
      const log = metaPuts(await putLog(r), ID_FIVE, 'reader-5-pages.pdf');
      assert.ok(log.every(e => e.pageNumber === page), `page provisoire enregistrée avant la fin de la restauration: ${JSON.stringify(log)}`);
      const db = await readDb(r);
      assert.equal(need(db, ID_FIVE).pageNumber, page, 'IndexedDB conserve la page après plus de 3 s');
    });
  });
}

for (const via of ['barre « Choisir un PDF »', 'carte de la bibliothèque']) {
  test(`(c2) continu : page 4 mémorisée, réouverture par ${via} sans rechargement, page 4 visible et non réécrite`, { timeout: 90_000 }, async t => {
    await scenario(t, {}, async r => {
      await r.load();
      await r.openPdf(FIVE, 'library');
      await setMode(r, CONTINUOUS);
      await goTo(r, 4);
      await waitDb(r, db => docOf(db, ID_FIVE, 'reader-5-pages.pdf')?.pageNumber === 4, 'page 4 enregistrée');
      await clearPutLog(r);
      if (via.startsWith('barre')) await r.openPdf(FIVE, 'toolbar');
      else { await goHome(r); await waitLibrary(r, 1); await clickCard(r, 'reader-5-pages.pdf'); await r.waitForPage(); }
      assert.equal(await currentMode(r), 'continuous', 'mode conservé');
      await eventually(async () => await dominantPage(r) === 4 && await counter(r) === 4, 'vue amenée sur la page 4', 10_000);
      await settle();
      assert.equal(await dominantPage(r), 4, 'toujours sur la page 4');
      const log = metaPuts(await putLog(r), ID_FIVE, 'reader-5-pages.pdf');
      assert.ok(log.every(e => e.pageNumber === 4), `page provisoire enregistrée: ${JSON.stringify(log)}`);
      assert.equal(need(await readDb(r), ID_FIVE).pageNumber, 4);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Notes
// ─────────────────────────────────────────────────────────────────────────────

test('(d) notes : conservées après rechargement, absentes d\'un autre document, jamais écrites dans sa fiche', { timeout: 120_000 }, async t => {
  await scenario(t, {}, async r => {
    await r.load();
    await r.openPdf(same.a, 'library');
    await goTo(r, 2);
    await addNote(r, 'Note du document A');
    await waitDb(r, db => docOf(db, ID_FIVE, 'doc.pdf')?.annotations?.map(a => a.text).join() === 'Note du document A', 'note enregistrée dans la fiche de A');

    await r.reload();
    await waitLibrary(r, 1);
    await clickCard(r, 'doc.pdf');
    await r.waitForPage();
    await goTo(r, 2);
    await eventually(async () => (await noteTitles(r)).includes('Note du document A'), 'note de A rechargée après rechargement', 6_000);

    // Autre document : ni affichage ni écriture croisée.
    await r.openPdf(same.b, 'toolbar');
    await goTo(r, 2);
    await pause(600);
    assert.equal(await markerCount(r), 0, 'aucune note de A affichée sur B');
    assert.ok(!(await noteTitles(r)).includes('Note du document A'));
    await settle();
    let db = await readDb(r);
    assert.deepEqual(need(db, ID_MIXED).annotations, [], 'la fiche de B ne contient pas les notes de A');
    assert.deepEqual(need(db, ID_FIVE).annotations.map(a => a.text), ['Note du document A'], 'la fiche de A garde sa note');

    await addNote(r, 'Note du document B');
    db = await waitDb(r, d => docOf(d, ID_MIXED, 'doc.pdf')?.annotations?.length === 1, 'note de B enregistrée');
    assert.deepEqual(need(db, ID_MIXED).annotations.map(a => a.text), ['Note du document B']);
    assert.deepEqual(need(db, ID_FIVE).annotations.map(a => a.text), ['Note du document A'], 'la note de B n\'est pas écrite dans la fiche de A');

    // Retour sur A : seulement sa note.
    await r.openPdf(same.a, 'toolbar');
    await goTo(r, 2);
    await eventually(async () => (await noteTitles(r)).includes('Note du document A'), 'note de A revenue', 6_000);
    assert.ok(!(await noteTitles(r)).includes('Note du document B'));
  });
});

test('(d2) notes modifiées puis supprimées : l\'état final est conservé après rechargement', { timeout: 120_000 }, async t => {
  await scenario(t, {}, async r => {
    const markerPoint = text => r.evaluate(text => {
      const m = [...document.querySelectorAll('#pdf-workspace div.rounded-full[title]')].find(e => e.getAttribute('title') === text);
      if (!m) return null;
      const b = m.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    }, text);
    await r.load();
    await r.openPdf(FIVE, 'library');
    await goTo(r, 2);
    await addNote(r, 'version 1');
    await waitDb(r, db => docOf(db, ID_FIVE, 'reader-5-pages.pdf')?.annotations?.[0]?.text === 'version 1', 'création enregistrée');

    await r.click(await markerPoint('version 1'));
    await eventually(() => r.evaluate(() => Boolean(document.querySelector('textarea[placeholder="Écrire une note..."]'))), 'éditeur ouvert');
    await r.evaluate(() => {
      const ta = document.querySelector('textarea[placeholder="Écrire une note..."]');
      ta.focus();
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, 'version 2');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await r.key('Escape', 'Escape', 27);
    await waitDb(r, db => docOf(db, ID_FIVE, 'reader-5-pages.pdf')?.annotations?.[0]?.text === 'version 2', 'modification enregistrée');

    await r.reload();
    await waitLibrary(r, 1);
    await clickCard(r, 'reader-5-pages.pdf');
    await r.waitForPage();
    await goTo(r, 2);
    await eventually(async () => (await noteTitles(r)).includes('version 2'), 'texte modifié rechargé', 6_000);

    await r.click(await markerPoint('version 2'));
    const del = await eventually(() => r.evaluate(() => {
      const b = [...document.querySelectorAll('#pdf-workspace button')].find(e => /Supprimer/.test(e.textContent + e.title));
      if (!b) return null;
      const q = b.getBoundingClientRect();
      return { x: q.x + q.width / 2, y: q.y + q.height / 2 };
    }), 'bouton de suppression de la note');
    await r.click(del);
    await waitDb(r, db => docOf(db, ID_FIVE, 'reader-5-pages.pdf')?.annotations?.length === 0, 'suppression enregistrée');

    await r.reload();
    await waitLibrary(r, 1);
    await clickCard(r, 'reader-5-pages.pdf');
    await r.waitForPage();
    await goTo(r, 2);
    await pause(800);
    assert.equal(await markerCount(r), 0, 'la note supprimée ne revient pas');
    assert.equal(need(await readDb(r), ID_FIVE).annotations.length, 0);
  });
});

test('(d0) l\'aide des notes ne dit plus « en mémoire uniquement » et mentionne cet appareil', { timeout: 60_000 }, async t => {
  await scenario(t, {}, async r => {
    await r.load();
    await r.openPdf(FIVE, 'library');
    await openTools(r);
    const text = await r.evaluate(() => document.querySelector('#reader-tools section[aria-label="Notes"]')?.innerText ?? '');
    assert.ok(text.length > 0, 'section Notes présente');
    assert.ok(!/en mémoire uniquement|non sauvegardées/i.test(text), `ancienne mention encore présente: ${text}`);
    assert.ok(/appareil/i.test(text), `mention de conservation sur cet appareil attendue: ${text}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Migration automatique
// ─────────────────────────────────────────────────────────────────────────────

const legacyMeta = (id, extra = {}) => ({
  id, name: id, size: bytesFive.length, type: 'application/pdf', lastVisited: 1_760_000_000_000, pageNumber: 4, scale: 1.7,
  scrollPosition: { x: 5, y: 7 }, scrollMode: 'continuous', annotations: [note('n1', 2, 'première'), note('n2', 3, 'seconde')],
  thumbnail: 'data:image/jpeg;base64,AAAA-VIEUX-APERCU', ...extra,
});
const orphanMeta = { id: 'sans-copie.pdf', name: 'sans-copie.pdf', size: 10, type: 'application/pdf', lastVisited: 1_750_000_000_000, pageNumber: 2, scale: 1.2, scrollMode: 'paged', annotations: [note('o1', 1, 'orpheline')], thumbnail: 'data:image/jpeg;base64,ORPHELIN' };
const brokenMeta = { id: 'illisible.pdf', name: 'illisible.pdf', size: 10, type: 'application/pdf', lastVisited: 1_740_000_000_000, pageNumber: 1, scale: 1, scrollMode: 'paged', annotations: [note('b1', 1, 'illisible')] };

async function seedAndStart(r, { files, metadata, before = async () => {} }) {
  await r.openBlankOrigin();
  await seedDb(r, { files, metadata });
  await before();
  await r.load();
}
const snapshot = db => JSON.stringify({ files: [...db.files].sort((a, b) => a.id.localeCompare(b.id)), metadata: [...db.metadata].sort((a, b) => a.id.localeCompare(b.id)) });
const norm = ({ thumbnail, hasThumbnail, thumbnailValue, ...rest }) => rest;
const untouchedByMigration = db => {
  assert.deepEqual(norm(metaById(db, orphanMeta.id) ?? {}), norm(orphanMeta), 'fiche sans copie intacte');
  assert.equal(metaById(db, orphanMeta.id)?.thumbnailValue, orphanMeta.thumbnail);
  assert.deepEqual(norm(metaById(db, brokenMeta.id) ?? {}), norm(brokenMeta), 'fiche à copie illisible intacte');
  assert.equal(db.files.find(f => f.id === brokenMeta.id)?.raw, 'contenu qui n\'est pas un Blob', 'copie illisible intacte');
};
const baseSeed = () => ({
  files: [{ id: 'ancien.pdf', base64: asBase64(bytesFive) }, { id: brokenMeta.id, raw: 'contenu qui n\'est pas un Blob' }],
  metadata: [legacyMeta('ancien.pdf'), orphanMeta, brokenMeta],
});

test('(e1) migration : une fiche ancienne devient sha256-…, toutes données conservées, ancienne clé retirée ; idempotente', { timeout: 90_000 }, async t => {
  await scenario(t, {}, async r => {
    await seedAndStart(r, baseSeed());
    const db = await waitDb(r, d => d.files.some(f => f.id === ID_FIVE) && !d.metadata.some(m => m.id === 'ancien.pdf'), 'fiche convertie', 15_000);

    const m = need(db, ID_FIVE);
    assert.ok(m, 'fiche sha256 créée');
    const expected = legacyMeta(ID_FIVE, { name: 'ancien.pdf' });
    for (const k of ['name', 'size', 'type', 'lastVisited', 'pageNumber', 'scale', 'scrollPosition', 'scrollMode', 'annotations']) assert.deepEqual(m[k], expected[k], `champ ${k} conservé`);
    assert.equal(m.thumbnailValue, expected.thumbnail, 'aperçu conservé');
    assert.equal(db.files.find(f => f.id === ID_FIVE).sha, ID_FIVE.slice(7), 'copie convertie octet pour octet');
    assert.ok(!db.files.some(f => f.id === 'ancien.pdf'), 'ancienne copie retirée');
    untouchedByMigration(db);
    assert.deepEqual(db.stores.sort(), ['files', 'metadata']);
    assert.equal(db.version, 1);

    // Idempotence : un second démarrage ne change rien.
    const first = snapshot(db);
    await r.reload();
    await pause(3_000);
    assert.equal(snapshot(await readDb(r)), first, 'second démarrage sans effet');

    // La progression migrée est bien celle que lit le lecteur.
    await eventually(async () => (await libraryNames(r)).includes('ancien.pdf'), 'carte du document migré', 10_000);
    await clickCard(r, 'ancien.pdf');
    await r.waitForPage();
    await eventually(async () => await counter(r) === 4, 'progression migrée restaurée', 10_000);
    assert.equal(await currentMode(r), 'continuous');
  });
});

for (const newer of ['ancienne fiche plus récente', 'fiche sha256 plus récente']) {
  test(`(e2) migration avec fiche sha256 existante (${newer}) : fusion sans perte`, { timeout: 90_000 }, async t => {
    await scenario(t, {}, async r => {
      const legacyIsNewer = newer.startsWith('ancienne');
      const legacy = legacyMeta('ancien.pdf', { lastVisited: legacyIsNewer ? 1_760_000_000_000 : 1_750_000_000_000, annotations: [note('n1', 2, 'première'), note('n2', 3, 'seconde récente')] });
      const existing = {
        id: ID_FIVE, name: 'deja-la.pdf', size: bytesFive.length, type: 'application/pdf', lastVisited: legacyIsNewer ? 1_750_000_000_000 : 1_760_000_000_000,
        pageNumber: 5, scale: 1.1, scrollPosition: { x: 1, y: 2 }, scrollMode: 'paged', annotations: [note('n2', 3, 'seconde ancienne'), note('n9', 1, 'neuvième')],
        thumbnail: 'data:image/jpeg;base64,APERCU-EXISTANT',
      };
      await seedAndStart(r, {
        files: [{ id: 'ancien.pdf', base64: asBase64(bytesFive) }, { id: ID_FIVE, base64: asBase64(bytesFive) }],
        metadata: [legacy, existing, orphanMeta],
      });
      const db = await waitDb(r, d => !d.metadata.some(m => m.id === 'ancien.pdf') && !d.files.some(f => f.id === 'ancien.pdf'), 'fusion terminée', 15_000);
      const m = need(db, ID_FIVE);
      const winner = legacyIsNewer ? legacy : existing;
      assert.equal(db.metadata.filter(x => x.id === ID_FIVE).length, 1);
      assert.equal(m.lastVisited, winner.lastVisited, 'lastVisited le plus récent conservé');
      for (const k of ['pageNumber', 'scale', 'scrollMode', 'scrollPosition']) assert.deepEqual(m[k], winner[k], `progression la plus récente (${k})`);
      assert.deepEqual(m.annotations.map(a => a.id).sort(), ['n1', 'n2', 'n9'], 'union des notes par identifiant, sans doublon');
      assert.equal(m.thumbnailValue, existing.thumbnail, 'aperçu existant conservé');
      assert.equal(db.files.filter(f => f.id === ID_FIVE).length, 1);
      assert.equal(db.files.find(f => f.id === ID_FIVE).sha, ID_FIVE.slice(7));
      assert.deepEqual(metaById(db, orphanMeta.id).annotations, orphanMeta.annotations, 'fiche sans copie intacte');
      const first = snapshot(db);
      await r.reload();
      await pause(3_000);
      assert.equal(snapshot(await readDb(r)), first, 'idempotent');
    });
  });
}

test('(e3) migration de deux anciennes fiches de même contenu (+ fiche sans copie) : une seule fiche sha256, progression récente, union des notes', { timeout: 90_000 }, async t => {
  await scenario(t, {}, async r => {
    const recent = legacyMeta('recent.pdf', { lastVisited: 1_760_000_000_000, pageNumber: 4, annotations: [note('n1', 2, 'première'), note('n2', 3, 'seconde')], thumbnail: 'data:image/jpeg;base64,APERCU-R' });
    const older = legacyMeta('ancien-nom.pdf', { lastVisited: 1_700_000_000_000, pageNumber: 2, scale: 1.3, scrollMode: 'paged', scrollPosition: { x: 0, y: 0 }, annotations: [note('n2', 3, 'seconde'), note('n3', 5, 'troisième')], thumbnail: 'data:image/jpeg;base64,APERCU-A' });
    await seedAndStart(r, {
      files: [{ id: 'recent.pdf', base64: asBase64(bytesFive) }, { id: 'ancien-nom.pdf', base64: asBase64(bytesFive) }],
      metadata: [recent, older, orphanMeta],
    });
    const db = await waitDb(r, d => d.files.some(f => f.id === ID_FIVE) && !d.files.some(f => /\.pdf$/.test(f.id)), 'conversion terminée', 15_000);
    assert.deepEqual(db.metadata.map(m => m.id).sort(), [ID_FIVE, orphanMeta.id].sort(), 'anciennes fiches retirées, fiche sans copie conservée');
    assert.deepEqual(db.files.map(f => f.id), [ID_FIVE]);
    assert.equal(db.files[0].sha, ID_FIVE.slice(7));
    const m = need(db, ID_FIVE);
    assert.equal(m.pageNumber, 4, 'progression la plus récente');
    assert.equal(m.scale, 1.7);
    assert.equal(m.scrollMode, 'continuous');
    assert.equal(m.lastVisited, recent.lastVisited);
    assert.deepEqual(m.annotations.map(a => a.id).sort(), ['n1', 'n2', 'n3'], 'union des notes');
    assert.ok(['data:image/jpeg;base64,APERCU-R', 'data:image/jpeg;base64,APERCU-A'].includes(m.thumbnailValue), 'un des aperçus existants conservé');
    assert.deepEqual(metaById(db, orphanMeta.id).annotations, orphanMeta.annotations);
    const first = snapshot(db);
    await r.reload();
    await pause(3_000);
    assert.equal(snapshot(await readDb(r)), first, 'second démarrage idempotent');
  });
});

test('(e4) migration interrompue par une erreur d\'écriture : rien n\'est effacé, reprise au démarrage suivant', { timeout: 90_000 }, async t => {
  await scenario(t, {}, async r => {
    await seedAndStart(r, {
      ...baseSeed(),
      before: () => r.evaluate(() => { sessionStorage.setItem('__failPut', '1'); sessionStorage.setItem('__failPrefix', 'sha256-'); }),
    });
    await pause(5_000);
    let db = await readDb(r);
    assert.equal(db.files.find(f => f.id === 'ancien.pdf')?.sha, ID_FIVE.slice(7), 'ancienne copie toujours là');
    assert.equal(metaById(db, 'ancien.pdf')?.annotations?.length, 2, 'ancienne fiche et ses notes toujours là');
    assert.equal(metaById(db, 'ancien.pdf')?.pageNumber, 4);
    assert.ok(!db.metadata.some(m => SHA_FORMAT.test(m.id)) || db.files.some(f => f.id === ID_FIVE), 'pas de fiche sha256 sans copie');
    untouchedByMigration(db);

    await r.evaluate(() => { sessionStorage.removeItem('__failPut'); sessionStorage.removeItem('__failPrefix'); });
    await r.reload();
    db = await waitDb(r, d => d.files.some(f => f.id === ID_FIVE) && !d.metadata.some(m => m.id === 'ancien.pdf'), 'migration reprise', 15_000);
    assert.equal(need(db, ID_FIVE).pageNumber, 4);
    assert.deepEqual(need(db, ID_FIVE).annotations.map(a => a.id).sort(), ['n1', 'n2']);
    untouchedByMigration(db);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Sortie
// ─────────────────────────────────────────────────────────────────────────────

for (const kind of ['visibilitychange', 'pagehide']) {
  test(`(f) sortie par ${kind} : progression enregistrée sans attendre l'enregistrement périodique`, { timeout: 60_000 }, async t => {
    await scenario(t, {}, async r => {
      await r.load();
      await r.openPdf(FIVE, 'library');
      await waitDb(r, db => db.metadata.length === 1, 'document enregistré à l\'ouverture');
      await pause(500);
      await r.evaluate(() => { window.__freezeTimers = true; }); // neutralise le minuteur périodique : seule la sortie peut enregistrer
      await goTo(r, 3);
      await leave(r, kind);
      await waitDb(r, db => db.metadata.some(m => m.pageNumber === 3), 'page 3 enregistrée à la sortie', 2_500);
    });
  });
}

test('(f2) sortie : une note en attente est enregistrée sans attendre l\'enregistrement périodique', { timeout: 60_000 }, async t => {
  await scenario(t, {}, async r => {
    await r.load();
    await r.openPdf(FIVE, 'library');
    await waitDb(r, db => db.metadata.length === 1, 'document enregistré');
    await pause(500);
    await r.evaluate(() => { window.__freezeTimers = true; });
    await addNote(r, 'note de sortie');
    await goTo(r, 2);
    await leave(r, 'pagehide');
    await waitDb(r, db => db.metadata.some(m => m.pageNumber === 2 && m.annotations?.some(a => a.text === 'note de sortie')), 'note et page enregistrées à la sortie', 2_500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Stockage protégé et erreurs visibles
// ─────────────────────────────────────────────────────────────────────────────

const frenchAlert = text => /\b(le|la|les|du|des|pas|sur|votre|document|enregistr\w*|impossible|stockage|espace|appareil|notes?|progression)\b/i.test(text);

test('(g1) échec d\'enregistrement du PDF (quota) : message visible en français, document lisible, rien d\'effacé', { timeout: 90_000 }, async t => {
  await scenario(t, {}, async r => {
    await r.load();
    await r.openPdf(same.b, 'library');
    const before = await waitDb(r, db => docOf(db, ID_MIXED, 'doc.pdf'), 'B enregistré avant la panne');
    assert.deepEqual(await visibleAlerts(r), [], 'aucune alerte tant que tout va bien');

    await r.evaluate(() => { window.__failPut = true; });
    await r.openPdf(FIVE, 'toolbar'); // l'enregistrement de A échoue
    const alerts = await eventually(async () => { const a = await visibleAlerts(r); return a.length ? a : false; }, 'alerte visible (role="alert")', 8_000);
    assert.ok(alerts.some(frenchAlert), `message en français attendu: ${JSON.stringify(alerts)}`);
    await goTo(r, 2); // le document reste lisible
    assert.equal(await dominantPage(r), 2);
    const after = await readDb(r);
    assert.deepEqual(metaById(after, ID_MIXED), metaById(before, ID_MIXED), 'la fiche existante n\'a pas bougé');
    assert.equal(after.files.find(f => f.id === ID_MIXED)?.sha, ID_MIXED.slice(7), 'la copie existante est intacte');
  });
});

test('(g2) échec d\'enregistrement de la progression : message visible, lecture possible', { timeout: 90_000 }, async t => {
  await scenario(t, {}, async r => {
    await r.load();
    await r.openPdf(FIVE, 'library');
    await waitDb(r, db => docOf(db, ID_FIVE, 'reader-5-pages.pdf'), 'document enregistré');
    await pause(500);
    assert.deepEqual(await visibleAlerts(r), []);
    await r.evaluate(() => { window.__failPut = true; });
    await goTo(r, 3);
    const alerts = await eventually(async () => { const a = await visibleAlerts(r); return a.length ? a : false; }, 'alerte visible après échec de progression', 9_000);
    assert.ok(alerts.some(frenchAlert), `message en français attendu: ${JSON.stringify(alerts)}`);
    await goTo(r, 4);
    assert.equal(await dominantPage(r), 4, 'le document reste lisible');
    const db = await readDb(r);
    assert.equal(db.files.find(f => f.id === ID_FIVE)?.sha, ID_FIVE.slice(7), 'copie intacte');
    assert.ok(metaById(db, ID_FIVE), 'fiche non effacée');
  });
});

test('(g3) échec d\'enregistrement d\'une note : message visible, document lisible', { timeout: 90_000 }, async t => {
  await scenario(t, {}, async r => {
    await r.load();
    await r.openPdf(FIVE, 'library');
    await waitDb(r, db => docOf(db, ID_FIVE, 'reader-5-pages.pdf'), 'document enregistré');
    await pause(500);
    assert.deepEqual(await visibleAlerts(r), []);
    await r.evaluate(() => { window.__failPut = true; });
    await addNote(r, 'note qui ne peut pas être enregistrée');
    const alerts = await eventually(async () => { const a = await visibleAlerts(r); return a.length ? a : false; }, 'alerte visible après échec de note', 9_000);
    assert.ok(alerts.some(frenchAlert), `message en français attendu: ${JSON.stringify(alerts)}`);
    await goTo(r, 2);
    assert.equal(await dominantPage(r), 2, 'le document reste lisible');
    assert.equal((await readDb(r)).files.find(f => f.id === ID_FIVE)?.sha, ID_FIVE.slice(7));
  });
});

test('(j) stockage persistant demandé, sans bloquer si refusé', { timeout: 60_000 }, async t => {
  await scenario(t, { init: [PROBES, PERSIST_PROBE('deny')] }, async r => {
    await r.load();
    await r.openPdf(FIVE, 'library'); // refus du navigateur : l'ouverture et l'enregistrement continuent
    await waitDb(r, db => docOf(db, ID_FIVE, 'reader-5-pages.pdf'), 'document enregistré malgré le refus');
    const calls = await eventually(async () => { const n = Number(await r.evaluate(() => sessionStorage.getItem('__persistCalls') || 0)); return n >= 1 ? n : false; }, 'navigator.storage.persist() appelé', 8_000);
    assert.ok(calls >= 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Retrait confirmé
// ─────────────────────────────────────────────────────────────────────────────

test('(h) retrait : annuler ne retire rien, confirmer retire seulement ce document (pas son homonyme)', { timeout: 120_000 }, async t => {
  await scenario(t, {}, async r => {
    await r.load();
    await r.openPdf(same.a, 'library');
    await goTo(r, 3);
    await waitDb(r, db => docOf(db, ID_FIVE, 'doc.pdf')?.pageNumber === 3, 'A enregistré');
    await r.openPdf(same.b, 'toolbar');
    await goTo(r, 2);
    await waitDb(r, db => docOf(db, ID_MIXED, 'doc.pdf')?.pageNumber === 2, 'B enregistré');
    await goHome(r);
    await waitLibrary(r, 2);
    // Les cartes sont triées par dernière lecture : B (ouvert en dernier) d'abord, A ensuite.
    const NAME = 'Retirer doc.pdf de la bibliothèque';

    r.policy.accept = false;
    assert.equal(await clickNth(r, 'button', NAME, 0), 2, 'un bouton de retrait par carte, au nom accessible exact');
    await eventually(async () => r.dialogs.length === 1, 'confirmation native affichée', 4_000);
    assert.equal(r.dialogs[0].type, 'confirm');
    assert.ok(r.dialogs[0].message.includes('doc.pdf'), `nom du document dans la confirmation: ${r.dialogs[0].message}`);
    assert.ok(/copie/i.test(r.dialogs[0].message) && /progression/i.test(r.dialogs[0].message) && /notes/i.test(r.dialogs[0].message), `la confirmation précise copie, progression et notes: ${r.dialogs[0].message}`);
    await pause(800);
    let db = await readDb(r);
    assert.deepEqual(ids(db.metadata), [ID_FIVE, ID_MIXED].sort(), 'annuler ne retire rien');
    assert.deepEqual(ids(db.files), [ID_FIVE, ID_MIXED].sort());
    assert.equal((await libraryNames(r)).length, 2);

    r.policy.accept = true;
    await clickNth(r, 'button', NAME, 1); // la carte de A
    await eventually(async () => r.dialogs.length === 2, 'seconde confirmation', 4_000);
    db = await waitDb(r, d => d.metadata.length === 1, 'un seul document retiré', 6_000);
    assert.deepEqual(ids(db.metadata), [ID_MIXED], 'seul A est retiré, l\'homonyme B reste');
    assert.deepEqual(ids(db.files), [ID_MIXED], 'copie de A effacée, copie de B conservée');
    assert.equal(db.files[0].sha, ID_MIXED.slice(7), 'copie de B intacte');
    assert.equal(need(db, ID_MIXED).pageNumber, 2, 'progression de B intacte');
    assert.deepEqual(await waitLibrary(r, 1), ['doc.pdf']);
  });
});
