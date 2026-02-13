# 🔴 SPRINT 2.1 REGRESSION FIX

*Date : 11 Janvier 2026*

---

## 🚨 CAUSE RACINE IDENTIFIÉE

### Le Bug : Double Négation des Coordonnées

**Localisation** : `PdfViewer.tsx` ligne 501-505 + `TileManager.ts` ligne 164-165

**Problème** :
```typescript
// PdfViewer.tsx
const geometry = {
    x: -scrollPosition.x,    // ⚠️ NÉGATIF (pour CSS transform)
    y: -(scrollPosition.y - pageOffset)  // ⚠️ NÉGATIF
};

// TileManager.ts
const visibleWorldX = -geometry.x / geometry.scale;  // ⚠️ DOUBLE NÉGATION
//                     ^ Le moins ici inverse ce qui était déjà inversé
// Résultat : -(-100) / 1.0 = +100 au lieu de continuer avec la valeur brute
```

**Conséquence** :
- Lors d'un scroll vers le bas (`scrollTop = 500`), `geometry.y = -500`.
- `TileManager` calcule `visibleWorldY = -(-500) / 1.0 = +500`.
- Cela positionne le rectangle visible **à l'opposé** de l'origine attendue.
- Les tuiles sont générées pour une zone invisible → **page coupée**.

---

## ✅ CORRECTION PROPOSÉE

### Option A : Supprimer la négation dans PdfViewer (Recommandé)

**Fichier** : `components/PdfViewer.tsx` lignes 501-505

```diff
const geometry = {
    scale: scale,
-   x: -scrollPosition.x,
-   y: -(scrollPosition.y - pageOffset)
+   x: scrollPosition.x,
+   y: scrollPosition.y - pageOffset
};
```

**Explication** : `geometry` doit représenter la position réelle du scroll en coordonnées positives. La conversion vers l'espace monde (inversion) est faite par `TileManager`.

---

### Option B : Retirer la négation dans TileManager

**Fichier** : `utils/TileManager.ts` lignes 164-165

```diff
-const visibleWorldX = -geometry.x / geometry.scale;
-const visibleWorldY = -geometry.y / geometry.scale;
+const visibleWorldX = geometry.x / geometry.scale;
+const visibleWorldY = geometry.y / geometry.scale;
```

**Note** : Cette option conserve la sémantique CSS-like dans PdfViewer mais modifie le contrat de TileManager.

---

## 📋 FICHIERS IMPACTÉS

| Fichier | Ligne(s) | Action |
|---------|----------|--------|
| `components/PdfViewer.tsx` | 503-504 | Retirer les `-` devant `scrollPosition` |

---

## 🧪 VALIDATION

Après correction :
1. Ouvrir un PDF → Page complète visible (pas de coupe).
2. Zoomer → Tuiles à la bonne position.
3. Scroller → Tuiles suivent le défilement.
