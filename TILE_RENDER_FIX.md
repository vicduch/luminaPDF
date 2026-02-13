# Sprint 2.2.1a - Correctif Tuiles Floues

**Date d'audit** : 2026-01-16
**Auditeur** : Claude (Lead Dev Expert)
**Statut** : Diagnostic complet, prêt pour implémentation

---

## Problème Signalé

Lors de zooms élevés (>300%), certaines tuiles restent floues (basse résolution / pixelisées) alors que leurs voisines passent correctement en HD.

**Exemple** : À scale 3.46, LOD attendu = 4.0, mais certaines tuiles affichent encore du contenu LOD 2.0.

---

## Analyse de la Cause Racine

### Cause Principale : Logique Placeholder Bidirectionnelle

**Fichier** : `components/TileLayer.tsx`
**Lignes** : 199-201

```typescript
// Patch #4: Allow ANY different LOD as placeholder (bidirectional)
// Skip only exact LOD matches (they're already in visible tiles)
if (cachedTile.lod === currentLod) return;
```

**Le problème** : Cette condition `===` accepte N'IMPORTE QUEL LOD différent comme placeholder (inférieur OU supérieur).

**Scénario de bug** :
1. L'utilisateur zoome de 100% (LOD 1.0) à 350% (LOD 4.0)
2. Les anciennes tuiles LOD 1.0/2.0 sont conservées comme "placeholders"
3. Les nouvelles tuiles LOD 4.0 sont générées et rendues
4. Les DEUX niveaux de LOD coexistent dans le DOM
5. En raison des transitions CSS et du timing de rendu, les tuiles basse résolution persistent visuellement

**Pourquoi c'est faux** : Les placeholders devraient UNIQUEMENT être des tuiles de **plus basse** résolution (pour montrer du contenu flou pendant le chargement HD). Garder des tuiles de plus haute résolution comme "placeholders" est incohérent.

### Cause Secondaire : Transition Opacity CSS

**Fichier** : `components/PDFTile.tsx`
**Lignes** : 237-238

```typescript
opacity: isVisible ? 1 : 0,
transition: 'opacity 100ms ease-out',
```

Quand plusieurs niveaux de LOD font un fade-in simultané, la fenêtre de 100ms crée une confusion visuelle où les tuiles basse résolution peuvent apparaître au-dessus.

---

## Solution Proposée

### Fix 1 : Filtrage Strict des Placeholders (CRITIQUE)

**Fichier** : `components/TileLayer.tsx`
**Localisation** : Lignes 199-201

**Code actuel** :
```typescript
// Patch #4: Allow ANY different LOD as placeholder (bidirectional)
// Skip only exact LOD matches (they're already in visible tiles)
if (cachedTile.lod === currentLod) return;
```

**Code corrigé** :
```typescript
// Fix Sprint 2.2.1a: Seules les tuiles LOWER LOD sont des placeholders valides
// - cachedTile.lod < currentLod : Placeholder valide (montre du flou pendant chargement HD)
// - cachedTile.lod >= currentLod : Skip (même LOD ou supérieur = pas un placeholder)
if (cachedTile.lod >= currentLod) return;
```

**Explication** : Changer `===` en `>=` garantit que seules les tuiles de résolution inférieure sont utilisées comme placeholders.

### Fix 2 : Transition Instantanée pour les Tuiles HD (RECOMMANDÉ)

**Fichier** : `components/PDFTile.tsx`
**Localisation** : Ligne 238

**Code actuel** :
```typescript
transition: 'opacity 100ms ease-out',
```

**Code corrigé** :
```typescript
// Les tuiles HD (LOD >= 2) skip la transition pour couvrir instantanément les placeholders
transition: tile.lod >= 2 ? 'none' : 'opacity 100ms ease-out',
```

**Explication** : Les tuiles haute définition apparaissent instantanément, éliminant la fenêtre de confusion visuelle.

---

## Fichiers à Modifier

| Fichier | Ligne(s) | Modification |
|---------|----------|--------------|
| `components/TileLayer.tsx` | 199-201 | `=== currentLod` → `>= currentLod` |
| `components/PDFTile.tsx` | 238 | Transition conditionnelle selon LOD |

---

## Plan de Vérification

1. **Build** : `npm run dev` - vérifier absence d'erreurs de compilation
2. **Test zoom 350%** : Toutes les tuiles visibles doivent être nettes (LOD 4.0)
3. **Test zoom rapide** : Zoom in/out rapidement - aucune tuile floue persistante
4. **Test pan à fort zoom** : Déplacement à 400% - nouvelles tuiles chargent en HD
5. **Test changement de thème** : Vérifier que l'invalidation du cache fonctionne toujours
6. **Console DevTools** : Aucune erreur de rendu

---

## Évaluation des Risques

| Changement | Risque | Impact |
|------------|--------|--------|
| Fix 1 (placeholder `>=`) | Faible | Ne retire que les placeholders inappropriés |
| Fix 2 (transition conditionnelle) | Faible | Les tuiles HD apparaissent instantanément (meilleure UX) |

**Effet secondaire possible** : Moins de placeholders signifie que l'OverviewLayer (LOD 0.25) sera brièvement visible pendant les zooms très rapides. C'est acceptable car :
- L'OverviewLayer existe toujours à z-index 0 (pas de "zone grise")
- Un aperçu bref de basse résolution est préférable à des tuiles de mauvais LOD qui persistent

---

## Contexte Technique Additionnel

### Format d'ID des Tuiles (Correct)
```typescript
// TileManager.ts:218
id: `page_${pageIndex}_lod_${lod}_r_${row}_c_${col}`
```
Le LOD EST inclus dans l'ID. Pas de collision d'ID entre différents niveaux de LOD.

### Z-Index (Correct)
```typescript
// PDFTile.tsx:241
zIndex: Math.round(tile.lod * 10)
```
LOD 4.0 = zIndex 40 > LOD 2.0 = zIndex 20. Le stacking order est correct.

### Annulation Worker (Correct)
Le `RenderPool.ts` gère correctement les annulations - les bitmaps orphelins sont fermés proprement.

---

## Conclusion

Le bug est causé par une condition trop permissive (`===` au lieu de `>=`) dans la sélection des placeholders. Le correctif est minimal (2 lignes), ciblé, et ne casse pas l'architecture existante.

**Priorité** : P0 (affecte directement l'UX à fort zoom)
**Complexité** : Faible
**Temps estimé** : 15 minutes (implémentation + tests)
