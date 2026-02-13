# PLANNER_LOG.md

## 2026-02-05 - Analyse initiale et priorisation Sprint 2.2

### Contexte
Phase Discovery terminée. 3 problèmes majeurs identifiés dans les logs de bugs + 1 feature attendue (Zoom Hybride).

### Bugs analysés

| Bug | Cause racine | Impact | Fichiers |
|-----|--------------|--------|----------|
| SCROLL_CRASH | Division par zéro (scale=0 ou viewport=0) | Crash mémoire (millions de tuiles) | TileManager.ts, TileLayer.tsx |
| ZOOM_CRASH | Exception PDFTile non capturée + palette objet + pas de throttle | Démontage arbre React | PDFTile, TileLayer, PdfViewer, useZoom |
| PALETTE_LOOP | `palette` objet dans deps useEffect | Cache vidé en boucle | PdfViewer.tsx |

### Stratégie de développement

**Ordre obligatoire :** SCROLL_CRASH → ZOOM_CRASH → HYBRID_ZOOM

Justification :
- Les crashes bloquent toute utilisation normale.
- SCROLL_CRASH est le plus simple (3 gardes) et sécurise la base.
- ZOOM_CRASH nécessite SCROLL_CRASH corrigé pour tester correctement.
- HYBRID_ZOOM améliore l'UX mais requiert une base stable.

### Décomposition HYBRID_ZOOM (pour le Coder)

| Phase | Description | Fichiers | Dépend de |
|-------|-------------|----------|-----------|
| HZ-1 | Créer hook `useDebounce.ts` | hooks/useDebounce.ts (NEW) | ZOOM_CRASH |
| HZ-2 | Intégrer debounce dans PdfViewer | PdfViewer.tsx | HZ-1 |
| HZ-3 | Ajouter wrapper CSS compensation scale | PdfViewer.tsx | HZ-2 |
| HZ-4 | Implémenter Overview Tile (LOD 0.25) | TileLayer.tsx | HZ-3 |
| HZ-5 | (Optionnel) Tri radial centre-viewport | TileLayer.tsx | HZ-4 |

### Estimations complexité

- **S** (Small) : < 30 min, 1-2 fichiers, modifications localisées
- **M** (Medium) : 30-90 min, 2-4 fichiers, logique modérée
- **L** (Large) : > 90 min, 4+ fichiers, nouvelle architecture

### Risques identifiés

1. **ZOOM_CRASH ErrorBoundary** : Masque les erreurs sans les corriger. Prévoir logging pour diagnostic.
2. **Debounce 150ms** : Valeur à ajuster selon tests utilisateur (perçu trop lent ou trop rapide).
3. **Overview Tile cache permanent** : Attention à la mémoire sur PDF 1000+ pages.

---

## 2026-02-05 - Bilan Sprint 2.2.1 et planification Sprint 2.3

### Bilan Sprint 2.2.1

| Tâche | Résultat | Notes |
|-------|----------|-------|
| SCROLL_CRASH | ✅ Déjà corrigé | Gardes présentes dans le code existant |
| ZOOM_CRASH (3 fixes) | ✅ Implémenté | ErrorBoundary + palette memo + throttle |
| HYBRID_ZOOM Phases 1-3 | ✅ Implémenté | useDebounce existant, compensation CSS OK |

**Verdict :** Sprint 2.2.1 terminé avec succès. Le moteur de rendu est stable.

### Analyse Overview Tile (Phase 4)

**Question :** L'Overview Tile est-elle nécessaire maintenant ?

**Constat actuel :**
- Le système de placeholders bidirectionnel fonctionne (LOD quelconque → placeholder)
- La compensation CSS masque les transitions zoom/scroll
- Les zones grises n'apparaissent que dans des cas extrêmes (zoom très rapide + PDF lourd)

**Recommandation :** Déférer l'Overview Tile au Sprint 2.4 (optimisation). Priorité aux features utilisateur.

### Proposition Sprint 2.3 : Fonctionnalités Utilisateur

**Options analysées :**

| Feature | Valeur utilisateur | Complexité | Dépendances |
|---------|-------------------|------------|-------------|
| Intégration Gemini AI | Très haute (différenciateur) | L | Service geminiService.ts existant |
| Sélection de texte | Haute (UX fondamentale) | M | react-pdf text layer |
| Annotations | Moyenne | L | Nouveau système overlay |
| Multi-pages view | Moyenne | M | Virtualizer existant |

**Recommandation Sprint 2.3 :** Sélection de texte + Intégration Gemini

Justification :
- La sélection de texte est un prérequis pour le copier-coller et l'interaction IA
- Gemini est déjà partiellement intégré (geminiService.ts, AiPanel.tsx)
- Ces deux features se complètent : sélectionner → envoyer à l'IA

### Backlog proposé Sprint 2.3

| # | Tâche | Priorité | Complexité |
|---|-------|----------|------------|
| 1 | Activer la sélection de texte (react-pdf TextLayer) | HAUTE | M |
| 2 | Contextualiser le texte sélectionné pour Gemini | HAUTE | S |
| 3 | Améliorer AiPanel : streaming, historique | MOYENNE | M |
| 4 | Overview Tile (déféré) | BASSE | M |

---
*Planner - Sprint 2.2.1 → 2.3*
