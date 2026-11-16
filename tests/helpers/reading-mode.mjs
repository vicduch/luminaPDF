// Choix du mode de lecture par le panneau « Outils de lecture » (LUM-16, contrat de mode modifié).
// Les boutons « Lecture continue » / « Lecture page par page » ne sont plus dans la barre visible :
// ils vivent dans le groupe « Mode de lecture » du panneau #reader-tools. Boîte noire uniquement :
// arbre d'accessibilité, géométrie affichée, clavier et souris de confiance.
// Fonctionne avec les sessions de reader-cdp.mjs (openReader) et de storage-cdp.mjs (createSession).
import assert from 'node:assert/strict';
import { eventually } from '../reader-cdp.mjs';

export const CONTINUOUS = 'Lecture continue';
export const PAGED = 'Lecture page par page';
export const TOOLS = 'Outils de lecture';
export const MODE_GROUP = 'Mode de lecture';

/** Le panneau est réellement affiché (ni masqué, ni hors écran, ni de taille nulle). */
export const toolsPanelOpen = r => r.evaluate(() => {
  const e = document.querySelector('#reader-tools');
  if (!e) return false;
  const p = e.getBoundingClientRect(), s = getComputedStyle(e);
  return !e.hidden && s.display !== 'none' && s.visibility !== 'hidden' && p.width > 0 && p.height > 0
    && p.right > 0 && p.left < innerWidth && p.bottom > 0 && p.top < innerHeight;
});

export async function openToolsPanel(r) {
  if (await toolsPanelOpen(r)) return;
  await r.control('button', TOOLS);
  await eventually(async () => await toolsPanelOpen(r)
    && await r.control('button', TOOLS, function () { return this.getAttribute('aria-expanded') === 'true'; }),
  'panneau « Outils de lecture » ouvert (bouton aria-expanded=true et région affichée)');
}

/** Ferme par Échap puis attend la disparition réelle du panneau : il ne doit plus masquer le document. */
export async function closeToolsPanel(r) {
  if (!await toolsPanelOpen(r)) return;
  await r.key('Escape', 'Escape', 27);
  await eventually(async () => !await toolsPanelOpen(r), 'panneau « Outils de lecture » réellement fermé après Échap');
}

const pressed = (r, name) => r.control('button', name, function () { return this.getAttribute('aria-pressed'); });

/** État aria-pressed des deux boutons de mode, lu panneau ouvert ; l'état d'ouverture initial est restauré. */
export async function modeStates(r) {
  const wasOpen = await toolsPanelOpen(r);
  await openToolsPanel(r);
  const states = { [CONTINUOUS]: await pressed(r, CONTINUOUS), [PAGED]: await pressed(r, PAGED) };
  if (!wasOpen) await closeToolsPanel(r);
  return states;
}

/** `true` si ce bouton de mode est actif (aria-pressed="true"). */
export async function isModeActive(r, name) {
  return (await modeStates(r))[name] === 'true';
}

/**
 * Active un mode via le panneau Outils : ouvre, active à la souris, vérifie aria-pressed (actif vrai,
 * l'autre faux), puis referme (sauf `close: false`) en attendant la fermeture réelle.
 */
export async function chooseMode(r, name, { close = true } = {}) {
  assert.ok([CONTINUOUS, PAGED].includes(name), `mode inconnu : ${name}`);
  const other = name === PAGED ? CONTINUOUS : PAGED;
  await openToolsPanel(r);
  await r.control('button', name);
  await eventually(async () => await pressed(r, name) === 'true', `${name} actif (aria-pressed=true)`);
  assert.equal(await pressed(r, other), 'false', `${other} n'est plus actif`);
  if (close) await closeToolsPanel(r);
}
