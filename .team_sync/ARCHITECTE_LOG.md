# ARCHITECTE_LOG

**Note (2026-02-19, PM) :** Les entrées historiques ci-dessous restent pour traçabilité. Après Rebirth, la règle de navigation en vigueur est celle du CODER_LOG « Correction Géométrique Définitive (Aiming Engine) » : **contentRef** (scrollWidth/scrollHeight du `#pdf-workspace`) est la source de vérité pour centrage et ancrage de zoom ; **ne jamais** utiliser `container.scrollWidth` pour ces calculs. Voir `CLAUDE.md` (Critical Patterns).

---

## 2026-02-05 - Analyse Structurelle et Plan de Nettoyage
(Contenu précédent conservé par référence)

---

## 2026-02-05 - Stabilisation Documentaire
(Contenu précédent conservé par référence)

---

## 2026-02-05 - PHASE 1 : SCROLL CONTINU ET LAZY LOADING
(Terminée - Succès)

---

## 2026-02-05 - PHASE 2 : ARCHITECTURE "CAMÉRA" (Global Scale)
(En cours)

---

## 2026-02-05 - PLAN CORRECTIF : STABILISATION BASÉE SUR LE RÉFÉRENTIEL NAVIGATEUR (Sprint 2.11)

L'audit montre que les ratios focalaux calculés sur le contenu (1:1) sont erronés car ils ne reflètent pas l'expansion réelle gérée par le transform du parent. Nous basculons tous les calculs sur le référentiel `scrollWidth` du conteneur de scroll.

### 1. Correction du Centrage Initial
**Diagnostic** : L'usage de `content.scrollWidth` renvoie la taille non-scalée, décentrant le document à l'ouverture.
**Action** :
- Utiliser `container.scrollWidth` et `container.scrollHeight`.
- Formule : `left = (container.scrollWidth - container.clientWidth) / 2`.
- Cela garantit un centrage parfait quel que soit le niveau de zoom initial ou la taille du bureau.

### 2. Nouvelle Logique de Maintien du Focus
**Diagnostic** : La projection actuelle est complexe et sujette à l'erreur. La méthode des ratios sur l'espace scrollable total est plus robuste.
**Mathématiques (Capture & Restauration) :**
- **Capture (avant le changement de scale)** :
    - `Sw = container.scrollWidth` (Largeur totale scrollable actuelle)
    - `RatioX = (container.scrollLeft + container.clientWidth / 2) / Sw`
- **Restauration (dans useLayoutEffect, après rendu)** :
    - `Sw_new = container.scrollWidth` (Nouvelle largeur totale après expansion du transform)
    - `newScrollLeft = (RatioX * Sw_new) - container.clientWidth / 2`
- **Pourquoi ?** : `container.scrollWidth` est la variable de vérité du navigateur. Elle inclut l'effet du `transform: scale()` sur les enfants. En maintenant le ratio du centre visuel par rapport à cette largeur, le zoom reste parfaitement ancré.

### 3. Alignement des Variables
- Supprimer toute dépendance à `content.scrollWidth` dans les calculs de navigation.
- Garder `contentRef` uniquement pour des besoins de layout Grid, pas pour les mathématiques de scroll.

### Directive pour le Coder
Dans `PdfViewer.tsx`, modifier le `useLayoutEffect` de stabilisation. Capturer le ratio focal (basé sur `container.scrollWidth`) au moment où l'utilisateur déclenche le zoom (ou via une variable de state intermédiaire) et restaurer la position dans l'effet en utilisant la nouvelle valeur de `container.scrollWidth`. S'assurer que `transform-origin` reste à `center center`.

---

## 2026-02-19 — Phase 5 : Rendu Seamless & Performance 120fps

### Contexte
L'utilisateur signalait un flash blanc/disparition du texte à chaque changement de zoom. L'objectif était d'atteindre un comportement identique au lecteur PDF de Google Drive : amélioration progressive de la qualité sans aucune transition visible.

### Diagnostic Architectural

**Cause racine du flash :** react-pdf keye son composant Canvas avec `pageKey = \`${pageIndex}@${scale}/${rotate}\``. Modifier `width` dans `<Page>` recalcule `scale` en interne → `pageKey` change → Canvas DOM est **détruit et recréé** (unmount/remount). Pendant le remount, `Canvas.js` applique `visibility: hidden` → flash blanc.

**Tentatives échouées :**
1. Snapshot via `canvas.toDataURL()` + `<img>` overlay avec transition CSS → code mort, snapshot jamais capturé.
2. Snapshot via `drawImage` + clone du wrapper CSS (mêmes transforms) → sub-pixel shift entre l'ancien et le nouveau transform → "glitch des lettres".
3. Snapshot via `drawImage` avec redimensionnement (haute-res → basse-res flat canvas) → artefacts d'anti-aliasing, texte flou/glitchy.

### Solution Retenue : DPR-based Quality

**Principe :** `<Page width>` est **constant** (`pageDimensions.width`). La résolution est contrôlée uniquement par `devicePixelRatio`. Ainsi `pageKey` ne change jamais → le Canvas DOM **persiste**.

```
qualityDpr = committedScale × qualityBoost × clamp(1.5, 2.8, baseDpr × adaptiveBoost)
```

**Snapshot simplifié :** Comme le Canvas persiste (même élément DOM), le clone copie les pixels à l'identique (`drawImage(canvas, 0, 0)`) avec le même `style.cssText`. Zéro redimensionnement, zéro transform, zéro shift.

### Extension : 120fps Gesture Rendering

**Problème :** Les `setState(scale)` fréquents pendant un geste wheel/pinch causent une reconciliation React à chaque frame → jank.

**Solution :** Pendant le geste actif, le `transform` du `#pdf-camera` est écrit directement dans le DOM (`cameraRef.current.style.transform`). React state est synchronisé uniquement en fin de geste :
- **Wheel** : debounce 80ms → `onScaleChange(scaleRef.current)`
- **Touch** : `touchend` → `onScaleChange(scaleRefTouch.current)`

La correction de scroll (aiming) est aussi calculée inline dans le handler de geste via `applyInlineAiming`, sans passer par React.

### Liens Internes PDF

Avec la virtualisation (seules les pages visibles sont dans le DOM), react-pdf ne peut pas résoudre les liens internes. Solution :
- `<Document onItemClick>` intercepte les clics et appelle `scrollToPage()`.
- `scrollToPage()` appelle `setPageNumber()` (mode paginé) et/ou scroll DOM (mode continu).

### Validation
- ✅ Zoom sans flash (transitions invisibles)
- ✅ 120fps pendant les gestes
- ✅ Zéro glitch/shift sub-pixel
- ✅ Liens internes fonctionnels en mode virtualisé
- ✅ Build production OK, TypeScript clean