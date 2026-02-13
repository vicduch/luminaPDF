# 🔴 SCROLL LOOP DIAGNOSTIC (Sprint 2.1.3)

**Date :** 11 Janvier 2026  
**Auditeur :** Antigravity AI  
**Sévérité :** Critique  
**Statut :** Analyse complète

---

## 📋 RÉSUMÉ EXÉCUTIF

Ce rapport documente l'analyse de la cause racine du crash immédiat lors du scroll en mode continu ou pendant les opérations de zoom lorsque les scrollbars apparaissent. Le crash est causé par une **boucle de feedback** entre la gestion des événements scroll, les mises à jour d'état React, et les recalculs de layout.

---

## 🔍 SYMPTÔMES OBSERVÉS

| Symptôme | Description |
|----------|-------------|
| **Déclencheur** | Initiation du scroll en mode continu OU zoom quand scrollbars actives |
| **Comportement** | Gel immédiat de l'application, onglet navigateur non-responsif |
| **Timing** | Crash dans les premières millisecondes de l'action scroll/zoom |
| **Environnement** | Particulièrement sévère avec documents nécessitant scrollbars |

---

## 🚨 CAUSE RACINE #1 : Instabilité des Références Objet

### Localisation

**Fichier :** `components/PdfViewer.tsx`  
**Lignes :** 501-505, 537-540

### Code Problématique

```typescript
// DANS renderPage (useCallback) - Exécuté à chaque appel
const geometry = {           // ⚠️ NOUVEL OBJET à chaque render!
    scale: scale,
    x: scrollPosition.x,
    y: scrollPosition.y - pageOffset
};

// Plus loin...
<TileLayer
    geometry={geometry}      // ⚠️ Nouvelle référence → useMemo invalide
    viewportSize={{          // ⚠️ NOUVEL OBJET inline!
        width: containerWidth,
        height: containerHeight
    }}
/>
```

### Impact dans TileLayer.tsx

**Fichier :** `components/TileLayer.tsx`  
**Ligne :** 144

```typescript
useMemo(() => { ... }, [geometry, viewportSize, ...]);
//                       ^^^^^^^    ^^^^^^^^^^^
//                       Références qui changent à chaque frame!
```

### Séquence de la Boucle Infinie

```
1. Scroll → handleScroll → setScrollPosition
2. Re-render de PdfViewer
3. renderPage créé un NOUVEAU objet geometry
4. TileLayer reçoit une nouvelle référence
5. useMemo se réexécute (dépendance changée)
6. Recalcul des tuiles → Potentiel changement de layout
7. Si layout affecte scrollbars → Nouvel événement scroll → Retour à 1
```

---

## 🚨 CAUSE RACINE #2 : State Thrashing dans handleScroll

### Localisation

**Fichier :** `components/PdfViewer.tsx`  
**Lignes :** 199-232

### Code Problématique

```typescript
const handleScroll = useCallback(() => {
  const container = containerRef.current;
  if (!container) return;

  // ISSUE #1: Cette mise à jour d'état déclenche un re-render complet
  setScrollPosition({
    x: container.scrollLeft,
    y: container.scrollTop
  });

  if (scrollMode === ScrollMode.CONTINUOUS && numPages > 0) {
    // ... calcul visible page range ...
    
    // ISSUE #2: Autre mise à jour d'état
    setVisiblePageRange(prev => { ... });
    
    // ISSUE #3: Encore une mise à jour d'état
    if (setPageNumber && startPage !== pageNumber) {
      setPageNumber(startPage);
    }
  }
}, [...]);
```

### Analyse

- **3 mises à jour d'état** potentielles par événement scroll
- Chaque mise à jour déclenche un re-render React
- Le re-render peut modifier le layout → nouveau scroll event
- Aucun mécanisme de throttle ou debounce

---

## 🚨 CAUSE RACINE #3 : Volatilité des Spacers pendant le Zoom

### Localisation

**Fichier :** `components/PdfViewer.tsx`  
**Lignes :** 697-735

### Code Problématique

```typescript
{/* Top spacer */}
<div
  style={{
    height: CoordinateSystem.getSpacerHeight(
      visiblePageRange[0] - 1,
      pageDimensions,
      scale  // ← Valeur LIVE de scale
    ),
  }}
/>

{/* Bottom spacer */}
<div
  style={{
    height: CoordinateSystem.getSpacerHeight(
      numPages - visiblePageRange[1],
      pageDimensions,
      scale  // ← Valeur LIVE de scale
    ),
  }}
/>
```

### Analyse

Les hauteurs des spacers sont calculées avec la valeur `scale` live. Pendant les opérations de zoom :

1. Scale change → hauteurs des spacers changent
2. Hauteur totale du contenu change → position scroll devient invalide
3. Navigateur ajuste le scroll → déclenche `handleScroll`
4. `handleScroll` met à jour `visiblePageRange` basé sur nouvelle position
5. Changement de `visiblePageRange` → différentes pages rendues
6. Render des pages modifie layout → retour à l'étape 3

---

## 📊 GRAPHE DE DÉPENDANCES

```
handleScroll
    │
    ├─→ setScrollPosition ─────────────────┐
    │                                       │
    ├─→ setVisiblePageRange                │
    │       │                               │
    │       └─→ Changement hauteur spacers │
    │               │                       │
    │               └─→ Hauteur contenu ───│─→ Shift position scroll
    │                                       │          │
    └─→ setPageNumber                      │          │
                                            │          │
    renderPage (useCallback)  ←─────────────┘          │
        │                                              │
        ├─→ geometry = { scale, x: scrollPosition.x }  │
        │                                              │
        └─→ TileLayer re-render                        │
                │                                      │
                └─→ Changements layout ────────────────┘
                        │
                        └─→ Browser scroll event (BOUCLE!)
```

---

## ✅ CORRECTIFS PROPOSÉS

### Fix #1 : Mémoiser geometry et viewportSize (Priorité P0)

**Fichier :** `components/PdfViewer.tsx`

```typescript
// AVANT renderPage - Mémoiser geometry au niveau composant
const baseGeometry = useMemo(() => ({
    scale,
    x: scrollPosition.x,
    y: scrollPosition.y
}), [scale, scrollPosition.x, scrollPosition.y]);

const viewportSize = useMemo(() => ({
    width: containerWidth,
    height: containerHeight
}), [containerWidth, containerHeight]);

// Dans renderPage, calculer uniquement le offset Y
const renderPage = useCallback((pageNum: number, pageOffset: number = 0) => {
    const pageGeometry = useMemo(() => ({
        ...baseGeometry,
        y: scrollPosition.y - pageOffset
    }), [baseGeometry, scrollPosition.y, pageOffset]);
    
    return (
        <TileLayer
            geometry={pageGeometry}
            viewportSize={viewportSize}
            ...
        />
    );
}, [baseGeometry, viewportSize, scrollPosition.y, ...]);
```

### Fix #2 : Guard Réentrant pour handleScroll (Priorité P0)

**Fichier :** `components/PdfViewer.tsx`

```typescript
const isProcessingScroll = useRef(false);

const handleScroll = useCallback(() => {
  if (isProcessingScroll.current) return;
  
  isProcessingScroll.current = true;
  
  // ... logique scroll existante ...
  
  // Reset après que React a flush
  requestAnimationFrame(() => {
    isProcessingScroll.current = false;
  });
}, []);
```

### Fix #3 : Dépendances Primitives dans TileLayer (Priorité P1)

**Fichier :** `components/TileLayer.tsx`

```typescript
useMemo(() => { ... }, [
    geometry.scale, 
    geometry.x, 
    geometry.y,
    viewportSize.width, 
    viewportSize.height,
    // ...autres deps
]);
```

### Fix #4 : Stabiliser les Spacers avec Scale Debounced (Priorité P1)

**Fichier :** `components/PdfViewer.tsx`

```typescript
// Utiliser renderQualityScale (déjà debounced) pour les spacers
const spacerScale = renderQualityScale;

CoordinateSystem.getSpacerHeight(pageCount, pageDimensions, spacerScale)
```

---

## 📋 MATRICE DE PRIORITÉ

| Fix | Complexité | Impact | Priorité |
|-----|------------|--------|----------|
| Fix #1 : Mémoiser objets | Moyenne | Élevé | **P0 - Immédiat** |
| Fix #2 : Guard réentrant | Faible | Élevé | **P0 - Immédiat** |
| Fix #3 : Deps primitives | Faible | Moyen | P1 - Ce sprint |
| Fix #4 : Spacers stables | Faible | Moyen | P1 - Ce sprint |

---

## 📁 FICHIERS IMPACTÉS

| Fichier | Lignes | Modification |
|---------|--------|--------------|
| `components/PdfViewer.tsx` | 199-232 | Ajouter guard réentrant à `handleScroll` |
| `components/PdfViewer.tsx` | 497-540 | Mémoiser `geometry` et `viewportSize` |
| `components/PdfViewer.tsx` | 697-735 | Utiliser scale debounced pour spacers |
| `components/TileLayer.tsx` | 144 | Utiliser primitives dans deps `useMemo` |

---

## 🧪 CRITÈRES DE VALIDATION

- [ ] Mode continu : Scroll sans crash
- [ ] Zoom avec scrollbars : Pas de boucle infinie
- [ ] Console : Pas de milliers de logs "[TileLayer] recalculating..."
- [ ] Performance : 60fps maintenu pendant pan/zoom
- [ ] Mémoire : Usage stable pendant scroll/zoom prolongé

---

## 🔗 ISSUES CONNEXES

| Issue | Statut |
|-------|--------|
| Sprint 2.1.1 : Double négation coordonnées | ✅ CORRIGÉ |
| Sprint 2.1.2 : Division par zéro | ✅ CORRIGÉ |
| Sprint 2.1.3 : Boucle scroll infinie | 🔍 DIAGNOSTIQUÉ |

---

## 📝 CONCLUSION

La boucle de crash scroll est causée par une combinaison de :

1. **Références objet instables** passées à TileLayer
2. **State thrashing** dans le handler scroll
3. **Volatilité des spacers** pendant le zoom

Les correctifs P0 (mémorisation + guard réentrant) devraient résoudre le crash immédiat. Les correctifs P1 amélioreront la stabilité générale et les performances.

**Recommandation :** Implémenter Fix #1 et Fix #2 en priorité absolue avant tout autre développement.
