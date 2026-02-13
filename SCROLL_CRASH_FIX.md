# 🔴 SCROLL CRASH FIX (Sprint 2.1.2)

*Date : 11 Janvier 2026*

---

## 🚨 CAUSE RACINE

### Division par Zéro Non Protégée

**Localisation** : `TileManager.ts` lignes 164-167 + `TileLayer.tsx` lignes 188-191

**Problème** :
```typescript
// TileManager.ts - AUCUNE GARDE
const visibleWorldW = viewport.width / geometry.scale;  // ⚠️ Si scale = 0 → Infinity
const visibleWorldH = viewport.height / geometry.scale;

// TileLayer.tsx - MÊME PROBLÈME
const visibleWorldW = viewportSize.width / geometry.scale;
```

**Scénario de Crash** :
1. Zoom atteint un seuil → Scrollbars apparaissent.
2. ResizeObserver déclenche un re-render avec `containerWidth/Height` modifiés.
3. Pendant la transition, un render intermédiaire peut avoir `geometry.scale = 0` ou `viewportSize = { width: 0, height: 0 }`.
4. Division par 0 → `Infinity` ou `NaN`.
5. `Math.floor(Infinity)` → génération de millions de tuiles → Memory exhaustion → CRASH.

---

## ✅ FIX PROPOSÉ

### 1. Garde dans `TileManager.ts` (ligne 138)

```typescript
// AVANT la logique de calcul (début de getVisibleTiles)
if (geometry.scale <= 0 || viewport.width <= 0 || viewport.height <= 0) {
    return []; // Early exit - nothing to render
}
```

### 2. Garde dans `TileLayer.tsx` (ligne 114)

```typescript
const { visibleTiles, currentLod, visibleTileIds } = useMemo(() => {
    // Guard against invalid geometry
    if (geometry.scale <= 0 || viewportSize.width <= 0 || viewportSize.height <= 0) {
        return { visibleTiles: [], currentLod: 1, visibleTileIds: new Set<string>() };
    }
    
    const tiles = tileManager.getVisibleTiles(...);
    // ...reste du code
}, ...);
```

### 3. Garde dans le calcul des placeholders (TileLayer.tsx ligne 188)

```typescript
// Guard before division
if (geometry.scale <= 0) return;

const visibleWorldX = -geometry.x / geometry.scale;
```

---

## 📋 FICHIERS À MODIFIER

| Fichier | Ligne | Modification |
|---------|-------|--------------|
| `utils/TileManager.ts` | 138 | Ajouter garde en début de `getVisibleTiles` |
| `components/TileLayer.tsx` | 114 | Ajouter garde dans `useMemo` |
| `components/TileLayer.tsx` | 188 | Ajouter garde dans boucle placeholder |

---

## 🧪 VALIDATION

1. Zoom lent jusqu'à apparition des scrollbars → Pas de crash.
2. Zoom rapide (molette) → Pas de crash.
3. Resize fenêtre pendant zoom → Pas de crash.
