# 🏁 LuminaPDF - Sprint Summary & History

## 📅 Historique des Sprints

### Phase 2 : Performance & Architecture (Janvier 2026)

| Sprint | Objectif Clé | Résultat / Fix Technique | Statut |
|--------|--------------|--------------------------|--------|
| **2.2.1** | **Stabilisation Rendu** | Investigation en cours sur les tuiles floues partielles | 🚧 WIP |
| **2.2** | **UX Zoom & Layout** | Ajout de padding layout, fix "effet ressort", zoom multiplicatif (+25%) | ✅ Done |
| **2.1.4** | **Zoom Crash Fix** | Memoization de palette, Throttle 100ms sur zoom toolbar | ✅ Done |
| **2.1.3** | **Infinite Loop Fix** | Dépendances `useMemo` primitives (`scale` vs objet `geometry`) | ✅ Done |
| **2.1.2** | **Division by Zero** | Gardes `if (scale <= 0)` pour éviter génération infinie | ✅ Done |
| **2.1** | **Architecture Hybride** | Découplage Geometry/Quality + OverviewLayer + Radial Sort | ✅ Done |
| **2.0.x** | **Core Fixes** | Support HiDPI (DPR), Fix double division, Scroll offsets | ✅ Done |

### Phase 1 : UX & Thèmes (Début Janvier 2026)

| Sprint | Objectif Clé | Résultat / Fix Technique | Statut |
|--------|--------------|--------------------------|--------|
| **1.7** | **eInk Premium** | Thème monochrome strict, icônes spécifiques | ✅ Done |
| **1.6** | **Tile Recolor** | Migration filtres CSS → Recolorisation Worker (Pixel perfect) | ✅ Done |
| **1.5** | **Themes V2** | Variantes Light/Dark indépendantes par thème | ✅ Done |
| **1.0** | **UI Foundation** | Toolbar, Sidebar, Persistence État (LocalStorage) | ✅ Done |

---

## 🚦 Patterns Techniques Établis

Ces solutions ont été validées et doivent être **maintenues** :

1.  **Primitives First** : Dans `TileLayer`, ne jamais passer d'objets (`geometry`) dans les dépendances `useEffect/useMemo`. Toujours décomposer (`geometry.scale`, `geometry.x`...).
2.  **Worker-Side Coloring** : Ne jamais utiliser `filter: invert()` CSS pour les thèmes sombres. Toujours passer la palette au worker.
3.  **Debounce Quality** : Ne jamais déclencher un rendu HD pendant un mouvement (scroll/zoom). Toujours attendre la stabilisation (~100-150ms).
4.  **Graceful Degradation** : Toujours avoir un `OverviewLayer` ou des placeholders bas LOD en arrière-plan.

---

## 🔭 Roadmap Immédiate (Next Steps)

1.  **Fix Tuiles Floues (Prio 0)** : Résoudre le problème de rafraîchissement partiel à fort zoom (Piste : Cache Invalidation).
2.  **Optimisation Mobile** : Adapter les gestures touch (pinch-to-zoom) avec la nouvelle architecture hybride.
3.  **Annotations** : Ajouter une couche vectorielle pour surligner/annoter (Canvas séparé au-dessus des tuiles).
