# Phase 4B — Validation Xiaomi Pad 6 PWA (2026-02-18)

Cible: Xiaomi Pad 6, Chrome Android, PWA installee en mode standalone.
Orientations testees: portrait (1080×2160) et paysage (2160×1080).

---

## 1. Correctifs implementes

### FIX-01 — Viewport racine : `h-screen` → `h-[100dvh]` (`App.tsx`)
- **Problème**: `h-screen = 100vh` sur Chrome Android = Large Viewport Height (LVH), incluant la zone de la address bar. Quand la address bar est visible, le layout depasse le viewport visible → barre grise en bas de l'ecran.
- **Correctif**: `h-[100dvh]` — Dynamic Viewport Height, toujours egal au viewport visible reel. Se redimensionne proprement quand la address bar apparait/disparait.
- **Impacte**: `src/App.tsx` ligne 636.
- **Desktop**: aucun impact (dvh = vh = lvh sur desktop).

### FIX-02 — `html, body` height baseline (`index.css`)
- **Problème**: `html, body { height: 100% }` dans les deux blocs CSS du fichier → depend du containing block initial qui est `100lvh`. Inconsistance avec la semantique dvh.
- **Correctif**: Double declaration avec fallback:
  ```css
  height: 100vh;   /* fallback anciens navigateurs */
  height: 100dvh;  /* override navigateurs modernes (Chrome 108+) */
  ```
- **Impacte**: `src/index.css` (deux blocs `html, body`).
- **Desktop**: transparent (browsers < Chrome 108 sur desktop utiliseront le fallback).

### FIX-03 — Manifest PWA : ajout `start_url`, `id`, `scope` (`vite.config.ts`)
- **Problème**: Le manifest ne declarait pas `start_url`, `id`, `scope`. Chrome Android peut echouer l'installation en PWA standalone sans `start_url`, ou lancer la PWA depuis une URL incorrecte apres mise a jour.
- **Correctif**: Ajout de `id: '/'`, `start_url: '/'`, `scope: '/'` dans le bloc manifest.
- **Impacte**: `vite.config.ts` → `dist/manifest.webmanifest` a la prochaine build.

---

## 2. Etat pre-existant (fonctionnel, non modifie)

Ces points etaient deja correctement implementes avant Phase 4B:

| Fonctionnalite | Etat | Detail |
|----------------|------|--------|
| `theme-color` meta sync | ✅ OK | `applyTheme()` dans ThemeManager.ts:466-470 met a jour `<meta name="theme-color">` a chaque changement de theme |
| `viewport-fit=cover` | ✅ OK | `index.html:7` — gere les encoches/safe-area correctement |
| `apple-mobile-web-app-capable` | ✅ OK | `index.html:9` |
| Pinch-to-zoom natif | ✅ OK | `PdfViewer.tsx:768-811` — touch events avec `e.preventDefault()` sur pinch |
| Swipe horizontal page | ✅ OK | `PdfViewer.tsx:813-871` — swipe avec detection des bords de scroll |
| Auto-fit sur rotation | ✅ OK | `PdfViewer.tsx:893-914` — ResizeObserver → containerDims → auto-fit scale |
| Re-centrage apres zoom | ✅ OK | Zoom stabilisation (`PdfViewer.tsx:541-588`) re-centre sur changement de scale |
| `manifest.orientation: 'any'` | ✅ OK | Accepte portrait et paysage en standalone |
| `overscroll-behavior: none` | ✅ OK | `index.css:170` — bloque pull-to-refresh |
| Touch targets min 44px | ✅ OK | `index.css:193-197` et `@media (max-width:768px)` |
| `touch-action: manipulation` | ✅ OK | Sur tous les buttons/liens (pas de double-tap zoom) |
| Persistance position lecture | ✅ OK | Sauvegarde toutes les 3s (IndexedDB), restauree a la reouverture |
| Mode `standalone` manifest | ✅ OK | Pas d'address bar en PWA installee |

---

## 3. Parcours critiques — resultats attendus par orientation

### Portrait (1080px largeur)

| Flux | Attendu | Verification |
|------|---------|--------------|
| CF-01: Ouverture PDF | Page s'affiche sans barre grise en bas | FIX-01 corrige ce point |
| CF-03: Zoom pinch | Pinch-to-zoom fluide, pas de conflit scroll | Pre-existant OK |
| CF-03: Scroll vertical | Pan vertical natif, smooth | `touchAction: pan-y pinch-zoom` |
| CF-03: Swipe page | Swipe gauche/droite pour changer de page | Pre-existant OK |
| CF-02: Navigation toolbar | Boutons atteignables au pouce | 44px minimum OK |
| CF-05: Persistance | Position restauree apres fermeture PWA | Pre-existant OK |

### Paysage (2160px largeur)

| Flux | Attendu | Verification |
|------|---------|--------------|
| Auto-fit rotation | Page re-fit au nouveau ratio paysage | ResizeObserver → auto-fit OK |
| Re-centrage | Document reste centre apres rotation | Zoom stabilisation OK |
| Toolbar visible | Toolbar toujours accessible | `flex-none` en-tete, pas de chevauchement |
| PDF plein ecran | Page occupe l'espace disponible | Auto-fit sans marge sur mobile |
| Outline panel | `position:fixed` fonctionne (hors camera) | Architecture Camera OK |

### PWA Standalone (sans address bar)

| Flux | Attendu | Verification |
|------|---------|--------------|
| Lancement | Ouvre depuis `start_url: '/'` | FIX-03 |
| Hauteur viewport | 100dvh = 100vh = 100lvh (egaux sans address bar) | Transparent |
| theme-color | Couleur de la status bar suit le theme | ThemeManager:467-470 |
| Offline | SW cache les assets statiques (Workbox) | `registerSW({ immediate: true })` |

---

## 4. Bugs residuels et risques

| Bug / Risque | Severite | Detail | Mitigation |
|-------------|----------|--------|------------|
| Mismatch `window.innerHeight` vs `100vh` en browser (non-standalone) | Faible | En mode browser Chrome (pas PWA), quand address bar visible: `window.innerHeight < 100vh`. Les positions de defilement en mode continu peuvent etre decalees de ~56px (hauteur address bar). N'affecte PAS le mode PWA standalone. | Acceptable; en standalone les valeurs sont egales. Correction complete = `P5-RFCT-XX` (Phase 5). |
| Pas de test manuel reel sur Xiaomi Pad 6 | Eleve | Cette validation est theorique (code analysis). Le test reel sur la tablette cible est necessaire pour confirmer. | Tests manuels obligatoires avant Go/No-Go. Voir section 5. |
| Re-centrage si zoom manuel + rotation | Moyen | Si l'utilisateur a zoome manuellement (`userHasZoomedRef=true`) et tourne la tablette, l'auto-fit n'est pas declenche. Le document reste a l'ancien zoom, potentiellement hors ecran. | Workaround: taper le bouton "Fit" apres rotation. Correction = Phase 4B v2 si confirmee comme bug sur tablette. |
| `100dvh` non supporte (Chrome < v108) | Negligeable | Fallback `100vh` applique. Le Xiaomi Pad 6 (Android 13+) court Chrome 108+. | Fallback en place dans FIX-02. |
| Workbox chunk size warning | Faible | `pdf-engine-BKy78GMb.js` = 823 kB (hors scope Phase 4B). | Scope Phase 3 (quality gates). |

---

## 5. Checklist de tests manuels (a realiser sur tablette)

Conditions: Xiaomi Pad 6, Chrome Android dernier, PWA installee depuis Chrome > "Ajouter a l'ecran d'accueil".

### Portrait
- [ ] Ouvrir la PWA: aucune barre grise en bas de l'ecran
- [ ] Ouvrir un PDF: premiere page s'affiche centree, pleine largeur
- [ ] Pinch-to-zoom: fluide, pas de saut de zoom
- [ ] Double-tap sur bouton toolbar: pas de zoom navigateur (manipulation OK)
- [ ] Swipe gauche: page suivante
- [ ] Swipe droit: page precedente
- [ ] Scroll vertical en mode continu: fluide, pas de blocage

### Paysage
- [ ] Rotation portrait → paysage: page se re-fit automatiquement, document reste centre
- [ ] Toolbar toujours visible et accessible apres rotation
- [ ] Swipe page fonctionne en paysage
- [ ] Rotation rapide (aller-retour): pas de crash, UI stable

### PWA Standalone
- [ ] Lancer depuis icone: pas d'address bar, ouvre `/`
- [ ] theme-color de la status bar correspond au theme actif
- [ ] Changement de theme: status bar change de couleur
- [ ] Fermer + rouvrir: position de lecture restauree

### Regression Desktop
- [ ] `npm run dev`: aucune regression visuelle sur desktop (Chrome, Firefox, Edge)
- [ ] Hauteur de l'application inchangee sur desktop (100dvh = 100vh sur desktop)

---

## 6. Validation technique

```
npx tsc --noEmit   → ✅ PASS (0 erreur)
npm run build      → ✅ PASS (build en 4.62s)
```

Fichiers modifies:
- `src/App.tsx` — 1 ligne (`h-screen` → `h-[100dvh]`)
- `src/index.css` — 2 blocs html/body avec double declaration dvh
- `vite.config.ts` — 3 champs manifest (`id`, `start_url`, `scope`)
