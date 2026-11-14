// Helpers CDP pour les preuves de conservation (LUM-4). Additif : ne modifie pas reader-cdp.mjs.
import { createHash } from 'node:crypto';
import { pause, eventually } from './reader-cdp.mjs';

export { pause, eventually };
export const sha256Id = bytes => `sha256-${createHash('sha256').update(bytes).digest('hex')}`;

const APP_URL = () => {
  const url = new URL(process.env.READER_TEST_URL || 'http://127.0.0.1:3016');
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error('READER_TEST_URL must be HTTP loopback');
  }
  return url;
};
const SEED_PATH = '/__lumina_test_seed__';

/**
 * Ouvre un contexte navigateur isolé (IndexedDB propre) et une page, SANS charger l'application tout de suite.
 * `init` : sources de scripts évalués avant tout script de la page à chaque navigation.
 */
export async function createSession(browser, { width = 1280, height = 800, init = [], touch = false } = {}) {
  const url = APP_URL();
  const { browserContextId } = await browser.send('Target.createBrowserContext', { disposeOnDetach: true });
  try {
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', browserContextId });
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => browser.send(method, params, sessionId);
    const evaluate = async (fn, ...args) => {
      const result = await send('Runtime.evaluate', {
        expression: `(${fn.toString()})(...${JSON.stringify(args)})`,
        returnByValue: true, awaitPromise: true, timeout: 20_000,
      });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails).slice(0, 800));
      return result.result.value;
    };
    const dialogs = [];
    const policy = { accept: false };
    const stop = browser.onEvent(event => {
      if (event.sessionId !== sessionId) return;
      if (event.method === 'Page.javascriptDialogOpening') {
        dialogs.push({ type: event.params.type, message: event.params.message });
        // Réponse immédiate : un confirm natif bloque sinon la page et les entrées CDP.
        send('Page.handleJavaScriptDialog', { accept: policy.accept }).catch(() => {});
      }
    });
    const axNodes = async () => (await send('Accessibility.getFullAXTree')).nodes.filter(n => !n.ignored);
    const find = async (role, name) => (await axNodes()).filter(n => n.role?.value === role && n.name?.value === name);
    const hasControl = async (role, name) => (await find(role, name)).length > 0;
    const countControls = async (role, name) => (await find(role, name)).length;
    const control = async (role, name, fn = null, args = []) => {
      const matches = await find(role, name);
      if (matches.length !== 1) throw new Error(`Expected one accessible ${role} '${name}', found ${matches.length}`);
      const { object } = await send('DOM.resolveNode', { backendNodeId: matches[0].backendDOMNodeId });
      try {
        const result = await send('Runtime.callFunctionOn', {
          objectId: object.objectId,
          functionDeclaration: (fn || function () {
            this.scrollIntoView({ block: 'center', inline: 'center' });
            const r = this.getBoundingClientRect();
            if (this.disabled || r.width <= 0 || r.height <= 0 || r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight) {
              throw new Error('Control is not directly clickable in viewport');
            }
            return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
          }).toString(),
          arguments: args.map(value => ({ value })), returnByValue: true,
        });
        if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails).slice(0, 800));
        if (!fn) {
          const p = result.result.value;
          await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...p });
          await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 });
          await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 });
        }
        return result.result.value;
      } finally { await send('Runtime.releaseObject', { objectId: object.objectId }); }
    };
    const click = async p => {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...p });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 });
    };
    const key = async (key, code, windowsVirtualKeyCode) => {
      const text = key === 'Enter' ? '\r' : key === ' ' ? ' ' : undefined;
      await send('Input.dispatchKeyEvent', {
        type: 'keyDown', key, code, windowsVirtualKeyCode,
        ...(text === undefined ? {} : { text, unmodifiedText: text }),
      });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode });
    };
    const errors = [];
    browser.onEvent(event => {
      if (event.sessionId !== sessionId) return;
      if (event.method === 'Runtime.exceptionThrown') errors.push(String(event.params.exceptionDetails.exception?.description || event.params.exceptionDetails.text).slice(0, 300));
    });

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');
    await send('Network.setBypassServiceWorker', { bypass: true });
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    if (touch) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    for (const source of init) await send('Page.addScriptToEvaluateOnNewDocument', { source });

    const session = {
      send, evaluate, control, hasControl, countControls, click, key, errors, dialogs, policy,
      origin: url.origin,
      async load() {
        await send('Page.navigate', { url: url.href });
        await session.untilReady('application loaded');
      },
      /** Application montée et bibliothèque ou lecteur affiché (vide ou non), hors écran de chargement. */
      untilReady(description) {
        return eventually(() => evaluate(() => {
          const root = document.querySelector('#root');
          const text = root ? root.innerText.trim() : '';
          return document.readyState === 'complete' && text.length > 0 && !/^Chargement\.\.\.$/.test(text);
        }), description, 20_000);
      },
      async reload() {
        await send('Page.reload', { ignoreCache: true });
        await pause(300);
        await session.untilReady('application reloaded');
      },
      /** Page minimale de même origine, sans application, pour amorcer IndexedDB avant le premier chargement. */
      async openBlankOrigin() {
        await send('Fetch.enable', { patterns: [{ urlPattern: `${url.origin}${SEED_PATH}*` }] });
        const off = browser.onEvent(event => {
          if (event.sessionId === sessionId && event.method === 'Fetch.requestPaused') {
            send('Fetch.fulfillRequest', {
              requestId: event.params.requestId, responseCode: 200,
              responseHeaders: [{ name: 'Content-Type', value: 'text/html' }],
              body: Buffer.from('<!doctype html><title>seed</title>').toString('base64'),
            }).catch(() => {});
          }
        });
        try {
          await send('Page.navigate', { url: `${url.origin}${SEED_PATH}` });
          await eventually(() => evaluate(() => document.title === 'seed'), 'blank origin page');
        } finally { off(); await send('Fetch.disable'); }
      },
      /** Dépose des fichiers dans l'entrée fichier choisie par sélecteur CSS. */
      async setFiles(selector, files) {
        const { root } = await send('DOM.getDocument', { depth: 0 });
        const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector });
        if (!nodeId) throw new Error(`No element for ${selector}`);
        await send('DOM.setFileInputFiles', { nodeId, files });
      },
      /** Ouvre un PDF avec la méthode demandée. */
      async openPdf(path, via = 'toolbar') {
        const selector = via === 'toolbar' ? 'input[type="file"][aria-label="Choisir un PDF"]' : 'input[type="file"]:not([aria-label="Choisir un PDF"])';
        await eventually(() => evaluate(sel => Boolean(document.querySelector(sel)), selector), `file input (${via})`, 15_000);
        await session.setFiles(selector, [path]);
        await session.waitForPage();
      },
      async waitForPage(timeout = 25_000) {
        await eventually(() => evaluate(() => Boolean(document.querySelector('#pdf-workspace [data-page-number]'))), 'a PDF page is displayed', timeout);
      },
      async drop(path) {
        const { root } = await send('DOM.getDocument', { depth: 0 });
        void root;
        const point = await evaluate(() => ({ x: Math.round(innerWidth / 2), y: Math.round(innerHeight / 2) }));
        const base = { ...point, data: { items: [], files: [path], dragOperationsMask: 1 } };
        await send('Input.dispatchDragEvent', { type: 'dragEnter', ...base });
        await send('Input.dispatchDragEvent', { type: 'dragOver', ...base });
        await send('Input.dispatchDragEvent', { type: 'drop', ...base });
      },
      async close() {
        stop();
        try { await browser.send('Target.disposeBrowserContext', { browserContextId }); } catch { /* déjà fermé */ }
      },
    };
    return session;
  } catch (error) {
    try { await browser.send('Target.disposeBrowserContext', { browserContextId }); } catch { /* ignoré */ }
    throw error;
  }
}

// ── IndexedDB (lecture / amorçage en boîte noire) ────────────────────────────

/** Lit LuminaDB v1 : fiches (sans l'aperçu) et copies (taille + SHA-256 recalculé dans la page). */
export const readDb = r => r.evaluate(async () => {
  const db = await new Promise((resolve, reject) => {
    const q = indexedDB.open('LuminaDB');
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
    q.onblocked = () => reject(new Error('blocked'));
  });
  try {
    if (!db.objectStoreNames.contains('files') || !db.objectStoreNames.contains('metadata')) return { version: db.version, files: [], metadata: [], stores: [...db.objectStoreNames] };
    const tx = db.transaction(['files', 'metadata'], 'readonly');
    const all = name => new Promise((resolve, reject) => {
      const q = tx.objectStore(name).getAll();
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    });
    const [files, metadata] = await Promise.all([all('files'), all('metadata')]);
    const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
    const outFiles = [];
    for (const f of files) {
      if (!(f.blob instanceof Blob)) { outFiles.push({ id: f.id, raw: String(f.blob) }); continue; }
      const buffer = await f.blob.arrayBuffer();
      outFiles.push({ id: f.id, size: buffer.byteLength, sha: hex(await (window.__subtle || crypto.subtle).digest('SHA-256', buffer)) });
    }
    return {
      version: db.version, stores: [...db.objectStoreNames], files: outFiles,
      metadata: metadata.map(({ thumbnail, ...rest }) => ({ ...rest, hasThumbnail: Boolean(thumbnail), thumbnailValue: thumbnail })),
    };
  } finally { db.close(); }
});

export const metaById = (db, id) => db.metadata.find(m => m.id === id);
export const metaByName = (db, name) => db.metadata.filter(m => m.name === name);

/** Amorce LuminaDB v1 (mêmes magasins/index que l'application) sur l'origine courante, sans l'application. */
export const seedDb = (r, { files = [], metadata = [] }) => r.evaluate(async (files, metadata) => {
  const db = await new Promise((resolve, reject) => {
    const q = indexedDB.open('LuminaDB', 1);
    q.onupgradeneeded = () => {
      const d = q.result;
      d.createObjectStore('files', { keyPath: 'id' });
      d.createObjectStore('metadata', { keyPath: 'id' }).createIndex('lastVisited', 'lastVisited', { unique: false });
    };
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
  });
  const bytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['files', 'metadata'], 'readwrite');
    for (const f of files) tx.objectStore('files').put({ id: f.id, blob: 'raw' in f ? f.raw : new Blob([bytes(f.base64)], { type: 'application/pdf' }) });
    for (const m of metadata) tx.objectStore('metadata').put(m);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return true;
}, files, metadata);

// ── Observation de l'interface ───────────────────────────────────────────────

export const PAGE = 'Aller à la page', TOOLS = 'Outils de lecture';
export const CONTINUOUS = 'Lecture continue', PAGED = 'Lecture page par page';
export const HOME = 'Revenir à la bibliothèque';

export const counter = async r => Number(await r.control('spinbutton', PAGE, function () { return this.value; }));
export async function setMode(r, name) {
  await r.control('button', name);
  await eventually(() => r.control('button', name, function () { return this.getAttribute('aria-pressed') === 'true'; }), `${name} active`);
}
export const currentMode = async r => (await r.control('button', CONTINUOUS, function () { return this.getAttribute('aria-pressed') === 'true'; })) ? 'continuous' : 'paged';
export async function goTo(r, n) {
  await r.control('spinbutton', PAGE, function (n) {
    this.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(this, String(n));
    this.dispatchEvent(new Event('input', { bubbles: true }));
    this.dispatchEvent(new Event('change', { bubbles: true }));
  }, [n]);
  await r.key('Enter', 'Enter', 13);
  await eventually(async () => await counter(r) === n, `counter shows page ${n}`);
}
/** Page dont le centre géométrique de la zone de lecture est visible, indépendamment du compteur. */
export const visiblePages = r => r.evaluate(() => {
  const w = document.querySelector('#pdf-workspace')?.getBoundingClientRect();
  if (!w) return [];
  const view = { left: Math.max(0, w.left), right: Math.min(innerWidth, w.right), top: Math.max(0, w.top), bottom: Math.min(innerHeight, w.bottom) };
  return [...document.querySelectorAll('#pdf-workspace [data-page-number]')].flatMap(e => {
    const p = e.getBoundingClientRect(), style = getComputedStyle(e);
    if (p.width <= 0 || p.height <= 0 || style.visibility === 'hidden' || style.display === 'none') return [];
    const w = Math.min(p.right, view.right) - Math.max(p.left, view.left);
    const h = Math.min(p.bottom, view.bottom) - Math.max(p.top, view.top);
    return w > 40 && h > 40 ? [{ n: Number(e.dataset.pageNumber), visibleArea: w * h, top: p.top, bottom: p.bottom }] : [];
  });
});
/** Page qui occupe le plus de surface visible. */
export const dominantPage = async r => (await visiblePages(r)).sort((a, b) => b.visibleArea - a.visibleArea)[0]?.n ?? null;

export async function openTools(r) {
  if (await r.evaluate(() => Boolean(document.querySelector('#reader-tools') && getComputedStyle(document.querySelector('#reader-tools')).display !== 'none' && document.querySelector('#reader-tools').getBoundingClientRect().height > 0))) return;
  await r.control('button', TOOLS);
  await eventually(() => r.evaluate(() => { const t = document.querySelector('#reader-tools'); return Boolean(t && t.getBoundingClientRect().height > 0); }), 'tools region open');
}
export async function closeTools(r) {
  if (await r.evaluate(() => { const t = document.querySelector('#reader-tools'); return Boolean(t && t.getBoundingClientRect().height > 0); })) {
    await r.control('button', TOOLS);
    await eventually(() => r.evaluate(() => { const t = document.querySelector('#reader-tools'); return !t || t.getBoundingClientRect().height === 0; }), 'tools region closed');
  }
}
export const zoomLabel = async r => {
  await openTools(r);
  return r.evaluate(() => document.querySelector('#reader-tools output[aria-label="Zoom"]')?.textContent.trim());
};
export async function zoomIn(r, times = 1) {
  await openTools(r);
  for (let i = 0; i < times; i++) { await r.control('button', 'Augmenter le zoom'); await pause(120); }
}

/**
 * Ajoute une note sur la page affichée : outil « Ajouter une note sur la page », clic sur la page
 * (pose un repère), clic sur le repère (ouvre l'éditeur), saisie, Échap (valide), puis fin de la pose.
 */
export async function addNote(r, text) {
  await openTools(r);
  if (!await r.hasControl('button', 'Terminer la pose de note')) await r.control('button', 'Ajouter une note sur la page');
  await closeTools(r);
  const before = await r.evaluate(() => document.querySelectorAll('#pdf-workspace div.rounded-full[title]').length);
  const p = await r.evaluate(() => {
    const pages = [...document.querySelectorAll('#pdf-workspace [data-page-number]')].filter(e => e.getBoundingClientRect().width > 100);
    const el = pages.sort((a, b) => {
      const va = Math.min(a.getBoundingClientRect().bottom, innerHeight) - Math.max(a.getBoundingClientRect().top, 0);
      const vb = Math.min(b.getBoundingClientRect().bottom, innerHeight) - Math.max(b.getBoundingClientRect().top, 0);
      return vb - va;
    })[0];
    const b = el.getBoundingClientRect();
    const top = Math.max(b.top, 80), bottom = Math.min(b.bottom, innerHeight - 20);
    return { x: b.left + b.width * 0.5, y: top + (bottom - top) * 0.4, n: Number(el.dataset.pageNumber) };
  });
  // Décale chaque nouveau repère pour ne pas recouvrir le précédent.
  p.x += before * 30;
  await r.click(p);
  const marker = await eventually(() => r.evaluate(() => {
    const m = [...document.querySelectorAll('#pdf-workspace [title="Cliquez pour éditer"]')].pop();
    if (!m) return null;
    const b = m.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }), 'new note marker');
  await r.click(marker);
  await eventually(() => r.evaluate(() => Boolean(document.querySelector('textarea[placeholder="Écrire une note..."]'))), 'note editor opened');
  await r.evaluate(text => {
    const ta = document.querySelector('textarea[placeholder="Écrire une note..."]');
    ta.focus();
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, text);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
  await r.key('Escape', 'Escape', 27);
  await eventually(() => r.evaluate(() => !document.querySelector('textarea[placeholder="Écrire une note..."]')), 'note editor closed');
  await openTools(r);
  if (await r.hasControl('button', 'Terminer la pose de note')) await r.control('button', 'Terminer la pose de note');
  await closeTools(r);
  return p.n;
}
/** Textes (attribut title) des repères de notes présents dans le document. */
export const noteTitles = r => r.evaluate(() => [...new Set([...document.querySelectorAll('#pdf-workspace div[title]')].map(e => e.getAttribute('title')))]);
/** Nombre de repères de notes affichés. */
export const markerCount = r => r.evaluate(() => document.querySelectorAll('#pdf-workspace div.rounded-full[title]').length);

export async function goHome(r) {
  await r.control('button', HOME);
  await eventually(() => r.evaluate(() => !document.querySelector('#pdf-workspace [data-page-number]')), 'library displayed');
}
/** Cartes de la bibliothèque : { name, removeLabel }. */
export const libraryNames = r => r.evaluate(() => [...document.querySelectorAll('h3[title]')].map(h => h.getAttribute('title')));

/** Rend la page cachée (CDP ne gère pas `visibilitychange` seul : on émule via l'état de cycle de vie + événement). */
export async function hidePage(r) {
  await r.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

// ── Sondes injectées avant le chargement (API publiques du navigateur uniquement) ──

/**
 * - journalise (sessionStorage.__puts) toute écriture IndexedDB (put/add/cursor.update) sans la modifier ;
 * - échec simulé QuotaExceededError si `window.__failPut === true` ou `sessionStorage.__failPut === '1'`
 *   (option : `sessionStorage.__failPrefix` limite l'échec aux valeurs dont l'id commence par ce préfixe) ;
 * - `window.__freezeTimers = true` neutralise les minuteurs ≥ 400 ms (dont l'enregistrement périodique de 3 s)
 *   pour prouver qu'un enregistrement vient bien de la sortie de page.
 */
export const PROBES = `(() => {
  const read = () => { try { return JSON.parse(sessionStorage.getItem('__puts') || '[]'); } catch { return []; } };
  const log = (kind, store, value) => {
    try {
      const a = read();
      a.push({ kind, store: store && store.name, key: value && value.id, pageNumber: value && value.pageNumber, scale: value && value.scale, notes: value && value.annotations && value.annotations.length });
      sessionStorage.setItem('__puts', JSON.stringify(a.slice(-500)));
    } catch {}
  };
  const failing = value => {
    let session = false, prefix = '';
    try { session = sessionStorage.getItem('__failPut') === '1'; prefix = sessionStorage.getItem('__failPrefix') || ''; } catch {}
    if (!(window.__failPut === true || session)) return false;
    return !prefix || String(value && value.id).startsWith(prefix);
  };
  for (const method of ['put', 'add']) {
    const original = IDBObjectStore.prototype[method];
    IDBObjectStore.prototype[method] = function (value) {
      log(method, this, value);
      if (failing(value)) throw new DOMException('Simulated quota exceeded', 'QuotaExceededError');
      return original.apply(this, arguments);
    };
  }
  const update = IDBCursor.prototype.update;
  IDBCursor.prototype.update = function (value) {
    log('update', this.source, value);
    if (failing(value)) throw new DOMException('Simulated quota exceeded', 'QuotaExceededError');
    return update.apply(this, arguments);
  };
  for (const name of ['setTimeout', 'setInterval']) {
    const original = window[name];
    window[name] = function (callback, delay, ...rest) {
      if (typeof callback === 'function') {
        const inner = callback;
        callback = function (...args) { if (window.__freezeTimers && (Number(delay) || 0) >= 400) return undefined; return inner.apply(this, args); };
      }
      return original.call(this, callback, delay, ...rest);
    };
  }
})();`;
/** Compte et règle `navigator.storage.persist` (mode 'deny' = résout false). */
export const PERSIST_PROBE = mode => `(() => {
  if (!navigator.storage) return;
  const original = navigator.storage.persist && navigator.storage.persist.bind(navigator.storage);
  navigator.storage.persist = () => {
    try { sessionStorage.setItem('__persistCalls', String(Number(sessionStorage.getItem('__persistCalls') || 0) + 1)); } catch {}
    return ${mode === 'deny' ? 'Promise.resolve(false)' : 'original ? original() : Promise.resolve(false)'};
  };
})();`;
/** Simule un contexte non sécurisé : pas de crypto.subtle. */
export const NO_SUBTLE = `(() => {
  const getter = Object.getOwnPropertyDescriptor(Crypto.prototype, 'subtle').get;
  window.__subtle = getter.call(crypto); // réservé aux lectures de test (readDb)
  Object.defineProperty(Crypto.prototype, 'subtle', { configurable: true, get() { return undefined; } });
})();`;

export const putLog = r => r.evaluate(() => JSON.parse(sessionStorage.getItem('__puts') || '[]'));
export const clearPutLog = r => r.evaluate(() => { sessionStorage.setItem('__puts', '[]'); return true; });

export async function waitDb(r, predicate, description, timeout = 9_000) {
  let last;
  try {
    return await eventually(async () => { last = await readDb(r); return predicate(last) ? last : false; }, description, timeout);
  } catch (error) {
    const brief = last && JSON.stringify({ files: last.files.map(f => f.id), metadata: last.metadata.map(m => ({ id: m.id, name: m.name, pageNumber: m.pageNumber, scale: m.scale, scrollMode: m.scrollMode, notes: m.annotations?.length })) });
    throw new Error(`${error.message}; dernier état IndexedDB: ${brief}`, { cause: error });
  }
}

/** Quitte la page : `visibilitychange` (état caché émulé + événement) ou `pagehide`. */
export async function leave(r, kind) {
  await r.evaluate(kind => {
    if (kind === 'visibilitychange') {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    } else {
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
    }
  }, kind);
}

/** Alertes visibles (role="alert") avec leur texte. */
export const visibleAlerts = r => r.evaluate(() => [...document.querySelectorAll('[role="alert"]')]
  .filter(e => { const b = e.getBoundingClientRect(), s = getComputedStyle(e); return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && e.textContent.trim(); })
  .map(e => e.textContent.trim()));

/** Clique le n-ième contrôle accessible portant ce nom (ordre de l'arbre d'accessibilité). */
export async function clickNth(r, role, name, index) {
  const nodes = (await r.send('Accessibility.getFullAXTree')).nodes.filter(n => !n.ignored && n.role?.value === role && n.name?.value === name);
  if (index >= nodes.length) throw new Error(`Only ${nodes.length} accessible ${role} '${name}', wanted index ${index}`);
  const { object } = await r.send('DOM.resolveNode', { backendNodeId: nodes[index].backendDOMNodeId });
  try {
    const result = await r.send('Runtime.callFunctionOn', {
      objectId: object.objectId, returnByValue: true,
      functionDeclaration: (function () { this.scrollIntoView({ block: 'center' }); const b = this.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }).toString(),
    });
    await r.click(result.result.value);
  } finally { await r.send('Runtime.releaseObject', { objectId: object.objectId }); }
  return nodes.length;
}

/** Attend que la bibliothèque affiche exactement `count` cartes. */
export async function waitLibrary(r, count, timeout = 12_000) {
  let last = [];
  try {
    return await eventually(async () => { last = await libraryNames(r); return last.length === count ? last : false; }, `library shows ${count} card(s)`, timeout);
  } catch (error) { throw new Error(`${error.message}; cartes: ${JSON.stringify(last)}`, { cause: error }); }
}
/** Clique la n-ième carte portant ce nom (clic sur son titre, qui remonte à la carte). */
export async function clickCard(r, name, index = 0) {
  const p = await r.evaluate((name, index) => {
    const el = [...document.querySelectorAll('h3[title]')].filter(h => h.getAttribute('title') === name)[index];
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const b = el.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }, name, index);
  if (!p) throw new Error(`No library card '${name}' #${index}`);
  await r.click(p);
}
