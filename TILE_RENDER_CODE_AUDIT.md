# 🔬 TILE RENDER CODE AUDIT (Sprint 2.2.1)

## 📋 OBJECTIF
Identifier via audit de code uniquement pourquoi certaines tuiles restent en basse résolution à fort zoom (346%+).

---

## ✅ POINT DE CONTRÔLE 1 : Formation de l'ID (`TileManager.ts`)

### Analyse
**Fichier:** `utils/TileManager.ts`, ligne 218
```typescript
tiles.push({
    id: `page_${pageIndex}_lod_${lod}_r_${row}_c_${col}`,
    // ...
});
```

### Verdict: ✅ OK
L'ID **inclut explicitement le LOD**. Un tile à LOD 0.5 aura un ID différent d'un tile à LOD 4.0 pour la même position.

**Exemple:**
- LOD 0.5: `page_0_lod_0.5_r_3_c_2`
- LOD 4.0: `page_0_lod_4_r_12_c_8` (positions différentes aussi car la grille change avec le LOD)

➡️ **Pas de collision d'ID possible entre LOD différents.**

---

## ❌ POINT DE CONTRÔLE 2 : Logique de Cache (`TileLayer.tsx`)

### Analyse Critique

**Fichier:** `components/TileLayer.tsx`, lignes 170-288

#### 2.1 - Code Problématique dans `tilesToRender`:

```typescript
const tilesToRender = useMemo(() => {
    const cache = tileCacheRef.current;
    const result: CachedTile[] = [];
    const now = Date.now();

    // Step 1: Add/update visible tiles in cache with timestamp
    for (const tile of visibleTiles) {
        if (!cache.has(tile.id)) {
            cache.set(tile.id, { ...tile, isReady: false, lastAccess: now });
        } else {
            // ⚠️ BUG ICI: On met juste à jour le timestamp, 
            // on ne vérifie PAS si isReady est true avant de pousser dans result!
            const cached = cache.get(tile.id)!;
            cached.lastAccess = now;
        }
        result.push(cache.get(tile.id)!);  // ← Pousse même si isReady: false
    }
    // ...
```

### 🐛 BUG #1 IDENTIFIÉ : Aucune vérification de ready state avant render

**Problème:** Quand `qualityScale` augmente (zoom in → nouveau LOD plus élevé):
1. `TileManager.getVisibleTiles()` génère de NOUVEAUX IDs (ex: `gen1_page_0_lod_4_r_12_c_8`)
2. Ces nouveaux tiles sont ajoutés au cache avec `isReady: false`
3. Ils sont immédiatement ajoutés à `result` et donc rendus
4. **MAIS:** `PDFTile` ne montre rien tant que le bitmap n'est pas chargé (`opacity: isVisible ? 1 : 0`)

**Impact:** C'est le comportement voulu (les nouveaux tiles HD sont invisibles jusqu'à chargement). Le problème est ailleurs.

---

#### 2.2 - Analyse des Placeholders (lignes 187-233):

```typescript
// Step 2: Find lower-LOD tiles that can serve as placeholders
const placeholders: CachedTile[] = [];

cache.forEach((cachedTile, id) => {
    // Skip if it's a current visible tile (already added)
    if (visibleTileIds.has(id)) return;

    // Patch #4: Allow ANY different LOD as placeholder (bidirectional)
    if (cachedTile.lod === currentLod) return;

    // ... overlap test ...

    if (overlaps && cachedTile.isReady) {  // ⚠️ Seulement si isReady!
        placeholders.push(cachedTile);
    }
});
```

### ✅ OK pour les placeholders
Les placeholders sont correctement filtrés : seuls les tiles `isReady: true` sont utilisés.

---

#### 2.3 - Z-ORDER DES TILES (CRITIQUE) - `PDFTile.tsx` ligne 241:

```typescript
// Higher LOD = higher z-index (sharp tiles on top)
zIndex: Math.round(tile.lod * 10),
```

**Analyse du rendu final (ligne 271-273):**
```typescript
// Combine and sort: low LOD first (background), high LOD last (foreground)
const combined = [...placeholders, ...result];
combined.sort((a, b) => a.lod - b.lod);
```

### ✅ Le Z-order semble correct
- Tri par LOD croissant dans le tableau (rendu HTML)
- `zIndex` basé sur LOD → les tiles HD (LOD élevé) ont un z-index plus haut
- **Quand un tile HD se charge, il devrait recouvrir le placeholder bas-LOD**

---

## 🚨 BUG CRITIQUE TROUVÉ : Problème de propagation `effectiveQualityScale`

### 2.4 - Dépendances du `useMemo` pour `tilesToRender`:

```typescript
}, [
    visibleTiles,        // ✅ Contient les tiles avec currentLod 
    visibleTileIds,      // ✅ Set des IDs
    currentLod,          // ✅ LOD actuel
    geometry.scale,      // ⚠️ GEOMETRY scale, pas QUALITY scale
    geometry.x,
    geometry.y,
    viewportSize.width,
    viewportSize.height,
    buffer
]);
```

### 🐛 BUG #2 : `qualityScale` pas dans les dépendances de `tilesToRender`

Bien que `visibleTiles` soit recalculé avec `qualityScale`, le problème est dans la **logique d'overlap des placeholders** (lignes 210-213):

```typescript
// Visible area in world space (using live geometry)
const visibleWorldX = -geometry.x / geometry.scale;  // ⚠️ SIGNE NÉGATIF!
const visibleWorldY = -geometry.y / geometry.scale;
```

### 🐛 BUG #3 (POTENTIEL) : Incohérence de signe dans les coordonnées

**Dans `TileManager.ts` (lignes 171-172):**
```typescript
const visibleWorldX = geometry.x / geometry.scale;  // PAS de négation
const visibleWorldY = geometry.y / geometry.scale;
```

**Dans `TileLayer.tsx` (lignes 210-211):**
```typescript
const visibleWorldX = -geometry.x / geometry.scale;  // AVEC négation!
const visibleWorldY = -geometry.y / geometry.scale;
```

➡️ **Incohérence!** Les deux calculs devraient utiliser la même formule.

---

## ❌ POINT DE CONTRÔLE 3 : Propagation du Flux

### 3.1 - `PdfViewer.tsx` → `TileLayer.tsx`

**`PdfViewer.tsx` (lignes 560-562):**
```typescript
<TileLayer
    geometry={geometry}
    qualityScale={effectiveQualityScale}  // ✅ Correct
    // ...
/>
```

**`TileLayer.tsx` dépendances du premier `useMemo` (lignes 147-158):**
```typescript
}, [
    tileManager,
    viewportSize.width,
    viewportSize.height,
    geometry.scale,
    geometry.x,
    geometry.y,
    qualityScale,          // ✅ PRÉSENT
    contentSize.width,
    contentSize.height,
    pageIndex
]);
```

### ✅ OK pour la propagation
`qualityScale` est bien passé et bien dans les dépendances du `useMemo` de `visibleTiles`.

---

### 3.2 - MAIS: `effectiveQualityScale` pas dans les dépendances de `renderPage`

**`PdfViewer.tsx` (lignes 636-651):**
```typescript
}, [
    scrollPosition,
    scale,
    pageDimensions,
    containerWidth,
    containerHeight,
    isRenderPoolReady,
    isAnnotationMode,
    handlePageClick,
    handlePageLoadSuccess,
    renderAnnotations,
    theme,
    themeVariant,
    themePalette,
    file
    // ⚠️ effectiveQualityScale n'est PAS dans les dépendances!
]);
```

### 🐛 BUG #4 : `effectiveQualityScale` absent des dépendances de `renderPage`

Cela signifie que si `effectiveQualityScale` change mais pas `scale`, le callback `renderPage` ne sera pas recréé, et donc le `TileLayer` ne sera pas re-rendu avec le nouveau `qualityScale`.

**CEPENDANT:** En pratique, `scale` change TOUJOURS en même temps que `effectiveQualityScale`, donc ce bug est probablement mineur.

---

## 🔍 SYNTHÈSE DES BUGS

| # | Bug | Sévérité | Fichier | Ligne |
|---|-----|----------|---------|-------|
| 1 | Signe inversé dans le calcul d'overlap des placeholders | **CRITIQUE** | TileLayer.tsx | 210-211 |
| 2 | `console.log` après `return` (code mort) | Mineur | TileLayer.tsx | 144-145 |
| 3 | `effectiveQualityScale` absent des deps de `renderPage` | Faible | PdfViewer.tsx | 636-651 |

---

## 🎯 ROOT CAUSE PROBABLE

Le **Bug #1 (signe inversé)** est le plus probable responsable des tiles floues :

Quand on calcule l'overlap des placeholders dans `TileLayer.tsx` :
```typescript
const visibleWorldX = -geometry.x / geometry.scale;  // AVEC négation
```

Mais dans `TileManager.ts` :
```typescript
const visibleWorldX = geometry.x / geometry.scale;   // SANS négation
```

**Conséquence:** Les zones calculées pour les overlaps sont **inversées** par rapport aux zones calculées pour les tiles visibles. Cela peut provoquer des situations où :
1. Un placeholder bas-LOD est considéré comme "overlapping" alors qu'il ne l'est pas vraiment
2. Le placeholder reste affiché car le test d'overlap est incorrect
3. Le tile HD en arrière-plan (z-index plus bas que prévu?) n'est pas visible

---

## 🔧 FIX PROPOSÉ

### Fix #1 : Corriger le signe dans `TileLayer.tsx`

**Fichier:** `components/TileLayer.tsx`, lignes 210-211

**AVANT:**
```typescript
const visibleWorldX = -geometry.x / geometry.scale;
const visibleWorldY = -geometry.y / geometry.scale;
```

**APRÈS:**
```typescript
const visibleWorldX = geometry.x / geometry.scale;
const visibleWorldY = geometry.y / geometry.scale;
```

### Fix #2 : Déplacer le `console.log` avant le `return`

**Fichier:** `components/TileLayer.tsx`, lignes 139-145

**AVANT:**
```typescript
return {
    visibleTiles: tilesWithGeneration,
    currentLod: lod,
    visibleTileIds: ids
};
// 🔬 DEBUG: Log calculated tiles
console.log(`...`);  // ← JAMAIS EXÉCUTÉ!
```

**APRÈS:**
```typescript
// 🔬 DEBUG: Log calculated tiles
console.log(`[TileLayer DEBUG] Update geometry: scale=${geometry.scale.toFixed(2)}, quality=${qualityScale.toFixed(2)} -> LOD=${lod}, visible=${tilesWithGeneration.length}`);

return {
    visibleTiles: tilesWithGeneration,
    currentLod: lod,
    visibleTileIds: ids
};
```

### Fix #3 (Optionnel) : Ajouter `effectiveQualityScale` aux deps de `renderPage`

**Fichier:** `components/PdfViewer.tsx`, vers ligne 650

Ajouter `effectiveQualityScale` à l'array de dépendances.

---

## 📊 IMPACT ATTENDU

Après le Fix #1, les placeholders seront correctement identifiés :
- Les placeholders qui ne chevauchent pas réellement la zone visible seront supprimés
- Les tiles HD qui les remplacent seront visibles
- Plus de tuiles "bloquées" en basse résolution

---

## ⚡ PROCHAINES ÉTAPES

1. **Appliquer Fix #1 et #2** (critiques)
2. **Tester à 346%+** sans browser pour valider la logique
3. **Si le problème persiste**, investiguer la priorité de rendu dans `RenderPool.ts`

---

*Généré le 2026-01-16 | Sprint 2.2.1 | Audit Code-Only*
