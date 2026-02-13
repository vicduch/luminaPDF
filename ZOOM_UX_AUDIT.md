# ZOOM_UX_AUDIT.md — Sprint 2.2 : Audit Qualité Visuelle & Ergonomie Zoom

**Date** : 2026-01-11  
**Auditeur** : Agent IA  
**Commit Base** : Post-Sprint 2.1 (Crash fix)

---

## 📋 Synthèse Exécutive

Ce document analyse trois problèmes signalés par l'utilisateur :
1. **Tuiles floues** à fort zoom (327%+)
2. **Effet "Ressort"** lors de clics rapides sur les boutons +/- du zoom
3. **Pas de zoom insuffisant** (trop faible)
4. **Layout rigide** (scrollbar décalée, absence d'overscroll horizontal)

---

## 1. 🔍 DIAGNOSTIC : Tuiles Floues

### 1.1 Analyse du Code

#### Fichiers Examinés
- `utils/TileManager.ts` (lignes 117-253)
- `components/TileLayer.tsx` (lignes 114-156)
- `components/PdfViewer.tsx` (lignes 484-548)

#### Observations Clés

**A. Calcul de LOD (Level of Detail)**

```typescript
// TileManager.ts:149-156
let lod = lodLevels[lodLevels.length - 1]; // Default to highest (8)
for (let i = 0; i < lodLevels.length; i++) {
    if (lodLevels[i] >= qualityScale) {
        lod = lodLevels[i];
        break;
    }
}
```

Les niveaux LOD disponibles sont : `[0.125, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8]`

**🔴 PROBLÈME DÉTECTÉ : LOD Maximum = 8**

À 327% de zoom (`scale = 3.27`), le système sélectionne `LOD = 4` (le plus petit LOD ≥ 3.27).  
À 400%+, il sélectionne `LOD = 4` ou `LOD = 6`.  
À +500%, il sélectionne `LOD = 6` ou `LOD = 8`.

La configuration actuelle (`maxScale: 8.0` dans App.tsx:150-151) permet des zooms jusqu'à 800%, mais le LOD maximum est 8 — donc au-delà de 800%, les tuiles seront interpolées à la hausse (upscaling), créant du **flou**.

**B. Décalage Géométrie vs Qualité (Debounce)**

```typescript
// PdfViewer.tsx:484
const renderQualityScale = useDebounce(scale, 150);
```

Le `qualityScale` est debounced à 150ms. Cela signifie :
- Pendant un zoom rapide, les tuiles peuvent temporairement utiliser un LOD plus bas
- Si l'utilisateur zoome puis **scrolle immédiatement**, le LOD peut rester "bloqué" sur l'ancienne valeur

**C. Calcul de Visibilité des Tuiles (Problème potentiel)**

```typescript
// TileManager.ts:169-172
const visibleWorldX = -geometry.x / geometry.scale;
const visibleWorldY = -geometry.y / geometry.scale;
const visibleWorldW = viewport.width / geometry.scale;
const visibleWorldH = viewport.height / geometry.scale;
```

Le calcul utilise `geometry.x` et `geometry.y` qui proviennent de `scrollPosition` :

```typescript
// PdfViewer.tsx:501-505
const geometry = {
    scale: scale,  // Live scale
    x: scrollPosition.x,  // ScrollLeft
    y: scrollPosition.y - pageOffset  // ScrollTop - offset de page
};
```

**🟡 ATTENTION** : La formule `visibleWorldX = -geometry.x / geometry.scale` suppose que `geometry.x` est une translation CSS (négative pour scrollLeft positif). Or, `scrollPosition.x` est directement `container.scrollLeft`, qui est **positif** quand on scrolle vers la droite.

**→ INVERSION DE SIGNE POTENTIELLE** : Le calcul `visibleWorldX = -scrollLeft / scale` donne un X négatif quand on scrolle vers la droite, ce qui **devrait être positif**.

### 1.2 Cause Racine Identifiée

| Symptôme | Cause | Fichier:Ligne |
|----------|-------|---------------|
| Tuiles du bas floues | **Debounce de 150ms** sur `qualityScale` — les tuiles du haut sont chargées en HD pendant le scroll, mais le LOD peut ne pas se mettre à jour immédiatement pour les tuiles du bas | `PdfViewer.tsx:484` |
| Flou à 327%+ | **LOD 4 insuffisant** pour afficher les détails à cet agrandissement. Le LOD 6 ou 8 devrait être utilisé. | `TileManager.ts:109` |
| Flou persistant | **Inversion de signe** possible dans le calcul World Space — les tuiles visibles sont mal calculées | `TileManager.ts:169-172` |

### 1.3 Recommandations

#### Fix Prioritaire A : Vérifier le signe de geometry.x/y

```typescript
// TileManager.ts:169-172 — AVANT
const visibleWorldX = -geometry.x / geometry.scale;
const visibleWorldY = -geometry.y / geometry.scale;

// APRÈS (si scrollPosition est utilisé directement)
const visibleWorldX = geometry.x / geometry.scale;  // Plus de négation
const visibleWorldY = geometry.y / geometry.scale;
```

**Note** : Il faut vérifier la convention utilisée. Si la convention est :
- `geometry.x = scrollLeft` → pas de négation
- `geometry.x = -scrollLeft` (translation CSS) → négation correcte

#### Fix Prioritaire B : Réduire le debounce ou le rendre adaptatif

```typescript
// PdfViewer.tsx — Option 1 : Réduire le debounce
const renderQualityScale = useDebounce(scale, 80);  // 80ms au lieu de 150ms

// Option 2 : Debounce adaptatif basé sur le delta de zoom
const effectiveQualityScale = useMemo(() => {
    // Si le scale actuel est PLUS GRAND que le debounced, utiliser immédiatement
    // (zoom in = besoin de HD immédiat)
    if (scale > renderQualityScale * 1.1) {
        return scale;  // Upgrade immédiat
    }
    // Zoom out = OK de garder le debounced (évite de charger des LOD inutiles)
    return renderQualityScale;
}, [scale, renderQualityScale]);
```

---

## 2. 🎢 DIAGNOSTIC : Effet "Ressort" du Zoom

### 2.1 Analyse du Code

#### Fichiers Examinés
- `hooks/useZoom.ts` (lignes 302-359)
- `App.tsx` (ligne 417)

#### Observations Clés

**A. Animation dans handleToolbarZoom**

```typescript
// useZoom.ts:310-342
if (animate) {
    onZoomStart?.();
    const startTime = performance.now();
    const duration = config.animationDuration;  // 200ms par défaut

    const animateStep = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const currentScale = oldScale + (newScale - oldScale) * easeOut;

        // Capture focal point à CHAQUE frame!
        const focalPoint = captureFocalPoint();  // ⚠️ PROBLÈME
        pendingZoomRef.current = { ... };
        setScale(currentScale);

        if (progress < 1) {
            animationFrameRef.current = requestAnimationFrame(animateStep);
        }
    };
}
```

**🔴 PROBLÈME DÉTECTÉ : Focal Point recalculé à chaque frame**

Le `captureFocalPoint()` est appelé **à chaque frame d'animation** (ligne 326). Or, le focal point devrait être capturé **une seule fois** au début de l'animation, sinon il "dérive" pendant le zoom.

**B. Animation non annulée correctement**

```typescript
// useZoom.ts:274-278
if (animationFrameRef.current) {
    cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
}
```

Ce code est présent dans `handleWheelZoom`, mais **pas systématiquement** avant chaque `handleToolbarZoom`. Si l'utilisateur clique rapidement 2 fois sur "+", une seconde animation peut démarrer avant la fin de la première, causant un conflit.

**C. Utilisation de `animate: true` dans la Toolbar**

```typescript
// App.tsx:417
setScale={(s) => zoom.handleToolbarZoom(s, true)}
```

L'animation est **toujours activée** pour le zoom toolbar. Combinée avec :

```typescript
// Toolbar.tsx:157, 161
onClick={() => setScale(Math.max(0.5, scale - 0.1))}
onClick={() => setScale(Math.min(3.0, scale + 0.1))}
```

Le pas de zoom de **0.1 (10%)** combiné avec une animation de 200ms crée l'effet ressort.

### 2.2 Cause Racine Identifiée

| Symptôme | Cause | Fichier:Ligne |
|----------|-------|
| Effet Ressort visuellement | **Focal point recalculé à chaque frame** — le point d'ancrage se déplace pendant l'animation | `useZoom.ts:326` |
| Animations qui s'accumulent | **Pas de cancel systématique** avant une nouvelle animation | `useZoom.ts:302-342` |
| Rebond inattendu | `oldScale` dans l'animation capture la valeur du state React, qui peut être différente de la valeur visuelle | `useZoom.ts:323` → `oldScale + (newScale - oldScale)` |

### 2.3 Recommandations

#### Fix A : Capturer le focal point UNE SEULE FOIS

```typescript
// useZoom.ts — AVANT
const animateStep = (currentTime: number) => {
    // ...
    const focalPoint = captureFocalPoint();  // ❌ Chaque frame
    // ...
};

// APRÈS
if (animate) {
    onZoomStart?.();
    
    // ✅ Capturer UNE fois avant l'animation
    const focalPoint = captureFocalPoint();
    
    const startTime = performance.now();
    const duration = config.animationDuration;

    const animateStep = (currentTime: number) => {
        // ...
        pendingZoomRef.current = {
            mode: ZoomMode.CENTER,
            oldScale: scale,  // Note: utiliser currentScale serait mieux
            newScale: currentScale,
            focalPoint  // ✅ Réutiliser le même point
        };
        // ...
    };
}
```

#### Fix B : Annuler les animations précédentes

```typescript
// useZoom.ts:302 — AJOUTER au début de handleToolbarZoom
const handleToolbarZoom = useCallback((newScaleTarget: number, animate: boolean = false) => {
    // ✅ AJOUTER : Annuler animation en cours
    if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
    }
    
    currentMode.current = ZoomMode.CENTER;
    // ... reste du code
}, [...]);
```

#### Fix C : Option désactiver l'animation

Pour les clics rapides, désactiver l'animation peut être plus fluide :

```typescript
// App.tsx:417 — Option : Désactiver l'animation
setScale={(s) => zoom.handleToolbarZoom(s, false)}  // animate = false
```

---

## 3. 📐 DIAGNOSTIC : Pas de Zoom Insuffisant

### 3.1 Analyse du Code

```typescript
// Toolbar.tsx:157, 161
onClick={() => setScale(Math.max(0.5, scale - 0.1))}  // -10%
onClick={() => setScale(Math.min(3.0, scale + 0.1))}  // +10%
```

**🔴 PROBLÈME DÉTECTÉ :**
1. Le pas de **0.1 (±10%)** est linéaire, pas logarithmique
2. Les limites sont **0.5 - 3.0** (hardcodées), alors que App.tsx permet **0.1 - 8.0**
3. À 10% de zoom, +10% = +1% absolu. À 300% de zoom, +10% = +30% absolu. → **incohérent**

### 3.2 Recommandations

#### Fix A : Zoom Logarithmique dans Toolbar

Le zoom molette utilise déjà une approche multiplicative :

```typescript
// useZoom.ts:264
const zoomFactor = Math.pow(1.0015, -e.deltaY * speedFactor);
```

Appliquer la même logique au Toolbar :

```typescript
// Toolbar.tsx — AVANT
onClick={() => setScale(Math.max(0.5, scale - 0.1))}
onClick={() => setScale(Math.min(3.0, scale + 0.1))}

// APRÈS — Zoom multiplicatif (20% par clic)
const ZOOM_FACTOR = 1.25;  // +25% par clic
onClick={() => setScale(Math.max(0.1, scale / ZOOM_FACTOR))}  // Zoom out
onClick={() => setScale(Math.min(8.0, scale * ZOOM_FACTOR))}  // Zoom in
```

Ou avec un pas configurable :

```typescript
// Constantes recommandées
const ZOOM_STEP = 1.25;      // 25% multiplicatif par clic
const MIN_SCALE = 0.1;       // Aligné avec App.tsx
const MAX_SCALE = 8.0;       // Aligné avec App.tsx
```

---

## 4. 🖼️ DIAGNOSTIC : Layout Rigide

### 4.1 Analyse du Code

#### Fichiers Examinés
- `components/PdfViewer.tsx` (lignes 631-743)
- `App.tsx` (lignes 447-480)

#### Observations Clés

**A. Conteneur Principal**

```typescript
// PdfViewer.tsx:632-637
<div
    ref={containerRef}
    id="pdf-scroll-container"
    className="h-full w-full overflow-auto relative"
    onScroll={handleScroll}
>
```

Le conteneur utilise `overflow-auto`, ce qui est correct pour le scroll. Cependant :

**B. Contenu Centré sans Marges**

```typescript
// PdfViewer.tsx:646-648
<div className="min-h-full flex flex-col items-center justify-start py-4 w-full">
```

Ce `div` :
- Centre horizontalement le contenu (`items-center`)
- A un padding vertical de 16px (`py-4`)
- Utilise `w-full` → pas de marge latérale

**🔴 PROBLÈME : Pas d'overscroll horizontal**  
Quand le document est plus large que le viewport (zoom > fit), on ne peut pas scroller "au-delà" du bord du document pour avoir une marge visuelle.

**C. Wrapper de Content**

```typescript
// PdfViewer.tsx:682-685
<div
    ref={contentRef}
    className={`flex gap-4 ${scrollMode === ScrollMode.CONTINUOUS ? 'flex-col' : ''}`}
>
```

Ce `div` ne définit pas de dimensions explicites — il s'adapte au contenu.

### 4.2 Recommandations

#### Fix A : Ajouter du padding horizontal pour l'overscroll

```typescript
// PdfViewer.tsx:646-648 — AVANT
<div className="min-h-full flex flex-col items-center justify-start py-4 w-full">

// APRÈS — Ajouter padding horizontal
<div className="min-h-full flex flex-col items-center justify-start py-4 w-full px-8">
```

Ou mieux, utiliser un min-width pour forcer l'overscroll :

```typescript
// APRÈS — Avec min-width pour overscroll
<div 
    className="min-h-full flex flex-col items-center justify-start py-4"
    style={{
        minWidth: 'max(100%, calc(100% + 64px))',  // Au moins 32px de marge de chaque côté
        paddingLeft: '32px',
        paddingRight: '32px'
    }}
>
```

#### Fix B : Scrollbar "décalée"

Le problème de scrollbar décalée vient probablement du layout parent :

```typescript
// App.tsx:451-452
<div className="w-full h-full relative flex flex-row">
    <div className="flex-1 relative h-full w-full overflow-hidden">
```

La classe `overflow-hidden` sur le parent empêche le scroll de se propager correctement. Vérifier si c'est intentionnel.

**Solution** : Remplacer `w-full` par `min-w-0` sur le flex enfant pour éviter les débordements :

```typescript
// App.tsx:452 — AVANT
<div className="flex-1 relative h-full w-full overflow-hidden">

// APRÈS
<div className="flex-1 relative h-full min-w-0 overflow-hidden">
```

---

## 5. 📋 PLAN D'IMPLÉMENTATION POUR L'AGENT DÉVELOPPEUR

### Phase 1 : Fix Critique (Flou)

| Priorité | Fichier | Action | Lignes |
|----------|---------|--------|--------|
| P0 | `TileManager.ts` | Vérifier et corriger le signe de `visibleWorldX/Y` | 169-172 |
| P0 | `PdfViewer.tsx` | Réduire debounce `qualityScale` à 80ms | 484 |
| P1 | `PdfViewer.tsx` | Ajouter upgrade immédiat si `scale > qualityScale * 1.1` | 488-495 |

### Phase 2 : Fix Ergonomie (Ressort)

| Priorité | Fichier | Action | Lignes |
|----------|---------|--------|--------|
| P0 | `useZoom.ts` | Capturer `focalPoint` avant la boucle d'animation | 310 |
| P1 | `useZoom.ts` | Ajouter `cancelAnimationFrame` au début de `handleToolbarZoom` | 302 |
| P2 | `App.tsx` | Optionnel : passer `animate: false` à la Toolbar | 417 |

### Phase 3 : Fix Zoom Step

| Priorité | Fichier | Action | Lignes |
|----------|---------|--------|--------|
| P0 | `Toolbar.tsx` | Remplacer `±0.1` par facteur multiplicatif `×1.25 / ÷1.25` | 157, 161 |
| P1 | `Toolbar.tsx` | Aligner les limites avec App.tsx (`minScale: 0.1, maxScale: 8.0`) | 157, 161 |

### Phase 4 : Fix Layout

| Priorité | Fichier | Action | Lignes |
|----------|---------|--------|--------|
| P1 | `PdfViewer.tsx` | Ajouter `px-8` ou padding explicite au wrapper | 647 |
| P2 | `App.tsx` | Remplacer `w-full` par `min-w-0` sur le flex enfant | 452 |

---

## 6. 🧪 TESTS RECOMMANDÉS POST-FIX

### Test 1 : Validation Anti-Flou
1. Charger un PDF
2. Zoomer à 327%
3. Scroller jusqu'en bas du document
4. **Vérifier** : Les tuiles du bas doivent être nettes (LOD 4 minimum)

### Test 2 : Validation Anti-Ressort
1. Charger un PDF
2. Cliquer 5 fois rapidement sur "+"
3. **Vérifier** : Le zoom doit augmenter de façon monotone, sans rebond

### Test 3 : Validation Zoom Step
1. À 100%, cliquer sur "+"
2. **Vérifier** : Zoom passe à ~125%
3. À 200%, cliquer sur "+"
4. **Vérifier** : Zoom passe à ~250% (pas 210%)

### Test 4 : Validation Overscroll
1. Zoomer à 200%+
2. Scroller horizontalement jusqu'au bord droit
3. **Vérifier** : Il y a une marge de ~32px après le bord du document

---

## 📎 Annexes

### A. Diagramme des Transformations de Coordonnées

```
Screen Space (pixels écran)
    │
    ▼ Inverse Transform: P_world = (P_screen - scroll) / scale
    │
World Space (unités PDF @ 100%)
    │
    ▼ × LOD
    │
LOD Space (pixels à résolution LOD)
    │
    ▼ ÷ tileSize
    │
Tile Grid Space (indices row/col)
```

### B. Niveaux LOD Recommandés

Actuel : `[0.125, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8]`

Proposition (plus granulaire au-dessus de 4) :  
`[0.125, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 5, 6, 7, 8, 10]`

---

**Fin du rapport d'audit.**
