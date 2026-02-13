# 🎯 HYBRID_ZOOM_PLAN - Architecture & Implementation

*Date : 11 Janvier 2026*

---

## 📊 ARCHITECTURE CIBLE

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ZOOM PIPELINE                                       │
│                                                                              │
│  User Input                                                                  │
│      │                                                                       │
│      ▼                                                                       │
│  visualScale ─────────────────────────────────────────────────┐              │
│  (60fps, instant)                                             │              │
│      │                                                        ▼              │
│      │                                              CSS transform: scale()   │
│      │                                              (Stretches existing      │
│      │                                               tiles - blurry OK)      │
│      │                                                                       │
│  useDebounce(150ms)                                                          │
│      │                                                                       │
│      ▼                                                                       │
│  renderScale ─────────────────────────────────────────────────┐              │
│  (throttled)                                                  │              │
│                                                               ▼              │
│                                        TileLayer receives new scale         │
│                                        → TileManager calculates LOD         │
│                                        → RenderPool renders new tiles       │
│                                                                              │
│  LAYERS (z-order):                                                           │
│  ┌─────────────────────────────────────────────────────────────┐            │
│  │  z=0   Overview Tile (LOD 0.25, full page, always visible) │            │
│  │  z=1   Placeholder Tiles (previous LOD, stretched)         │            │
│  │  z=2   Target Tiles (current LOD, sharp)                   │            │
│  └─────────────────────────────────────────────────────────────┘            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## ✅ RÉPONSES AUX QUESTIONS

### 1. Overview Tile - Où la générer ?

**Recommandation : Dans `TileLayer.tsx`**

- Générer une tuile spéciale LOD 0.125 ou 0.25 couvrant toute la page.
- ID : `page_{p}_overview`.
- La rendre une seule fois au chargement de la page, la garder **toujours en cache** (cache permanent, non-LRU).
- Régénérer uniquement si `pageNumber` ou `palette` change (via `useEffect` dédié).

```typescript
// TileLayer.tsx - Nouvelle logique
const overviewTile: Tile = {
    id: `gen${gen}_page_${pageIndex}_overview`,
    row: 0, col: 0,
    lod: OVERVIEW_LOD, // 0.25
    x: 0, y: 0,
    width: contentSize.width,
    height: contentSize.height,
    pageIndex
};
```

### 2. Debounce Scale - Comment découpler ?

**Recommandation : `useDebounce` dans `PdfViewer.tsx`**

```typescript
// PdfViewer.tsx
const renderScale = useDebounce(scale, 150);
const renderScrollPosition = useDebounce(scrollPosition, 150);

// Pass to TileLayer
<TileLayer
    viewportTransform={{
        x: -renderScrollPosition.x,
        y: -(renderScrollPosition.y - pageOffset),
        scale: renderScale
    }}
    ...
/>

// CSS uses real-time scale
<div style={{ transform: `scale(${scale / renderScale})` }}>
    <TileLayer ... />
</div>
```

- Le `TileLayer` reçoit `renderScale` (stable).
- Le div parent compense avec `scale / renderScale` pour l'effet "stretch" instantané.

### 3. Placeholders - Déjà bidirectionnel ?

**OUI ✅** - Confirmé par `TileLayer.tsx` ligne 170-172 :

```typescript
// Patch #4: Allow ANY different LOD as placeholder (bidirectional)
if (cachedTile.lod === currentLod) return;
```

Les tuiles de **n'importe quelle LOD** (supérieure ou inférieure) servent de placeholder tant qu'elles chevauchent la zone visible. Aucune modification nécessaire.

### 4. Priorité Rendu - Faut-il modifier RenderPool ?

**NON recommandé pour V1**

- La sélection actuelle "least-loaded worker" est efficace.
- Priorité centre-viewport ajouterait de la complexité pour un gain marginal.
- **Alternative simple** : Trier `visibleTiles` par distance au centre du viewport avant rendu (optionnel, Phase 4).

---

## 🛠️ MODIFICATIONS PAR FICHIER

### A. `hooks/useDebounce.ts` [NEW]

```typescript
import { useState, useEffect } from 'react';

export function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
}
```

### B. `components/TileLayer.tsx` [MODIFY]

1. **Ajouter constante** : `const OVERVIEW_LOD = 0.25;`
2. **Ajouter state** : `overviewReady` boolean.
3. **Ajouter `useEffect`** : Générer et cacher l'overview tile au montage/changement de page.
4. **Modifier `tilesToRender`** : Inclure l'overview tile en premier (z-index le plus bas).

### C. `components/PdfViewer.tsx` [MODIFY]

1. **Import** : `import { useDebounce } from '../hooks/useDebounce';`
2. **Ajouter** :
   ```typescript
   const DEBOUNCE_MS = 150;
   const renderScale = useDebounce(scale, DEBOUNCE_MS);
   const renderScrollPosition = useDebounce(scrollPosition, DEBOUNCE_MS);
   ```
3. **Modifier** le wrapper `div` du `TileLayer` pour ajouter le ratio de compensation CSS.
4. **Modifier** `viewportTransform` pour utiliser `renderScale` et `renderScrollPosition`.

---

## 📋 ORDRE D'IMPLÉMENTATION RECOMMANDÉ

| Phase | Description | Fichiers |
|-------|-------------|----------|
| 1 | Stabilité (Silent Resolution) | RenderPool.ts, PDFTile.tsx |
| 2 | Debounce Scale | useDebounce.ts (new), PdfViewer.tsx |
| 3 | Overview Tile | TileLayer.tsx |
| 4 | (Optionnel) Priorité Centre | TileLayer.tsx |

---

## 🏁 VALIDATION FINALE

| Test | Critère de Succès |
|------|-------------------|
| Zoom rapide 5s | 0 crash, 0 erreur console |
| Zoom in max | Tuiles nettes après 150ms d'arrêt |
| Zoom out max | Overview visible immédiatement, pas de gris |
| Scroll pendant zoom | Pas de décalage visuel (coordonnées sync) |
