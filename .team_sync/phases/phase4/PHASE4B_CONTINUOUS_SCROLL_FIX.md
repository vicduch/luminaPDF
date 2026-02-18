# Phase 4B — Fix: ScrollMode.CONTINUOUS Scroll Blockage

Date: 2026-02-18
Statut: **Implémenté — Tests manuels en attente**

---

## 1. Symptôme

En mode `ScrollMode.CONTINUOUS` sur un PDF de 350+ pages, le défilement vers le haut se bloque autour de la page 52. Impossible de remonter à la page 1. Le défilement vers le bas reste fluide.

---

## 2. Analyse de la cause racine

Trois mécanismes interagissaient en boucle circulaire :

### Bug A — `shouldCleanup` court-circuite `isRendered`

```typescript
// PdfViewer.tsx L117-120 (avant correctif)
const distanceFromCurrent = currentPage ? Math.abs(pageNumber - currentPage) : Infinity;
const isPriority = distanceFromCurrent <= 3;
const shouldCleanup = distanceFromCurrent > 10; // ← BUG PRINCIPAL
```

Quand `currentPage = 62`, toutes les pages 1-51 ont `shouldCleanup = true`.
Le rendu conditionnel `{isRendered && !shouldCleanup ? ... : placeholder}` affichait le placeholder pour ces pages, **même si elles étaient dans la zone de 2000px de l'IntersectionObserver** (`isRendered = true`).

### Bug B — `isPriority` dans les deps de l'observer cause un churn massif

```typescript
// L221 (avant correctif)
}, [pageNumber, onVisible, containerRef, isPriority]); // ← isPriority instable
```

`isPriority` change à chaque changement de `currentPage`. Sur 350 pages, chaque pas de défilement provoquait **350 cycles teardown/recreate d'IntersectionObserver**. Les fires de `activeObserver` (qui met à jour `currentPage`) étaient manqués pendant le recreate → `currentPage` se bloquait à une valeur haute → `shouldCleanup` restait `true` pour les pages basses → boucle de blocage.

### Bug C — `currentPage` dans le comparateur `React.memo`

```typescript
// L367 (avant correctif)
&& prev.currentPage === next.currentPage; // ← force 350 re-renders par pas de scroll
```

Chaque changement de `currentPage` forçait le re-render de toutes les 350 instances `LazyPage`, alimentant le churn d'observers.

### Diagramme de causalité

```
currentPage change
  → React.memo(currentPage) → 350 re-renders
      → isPriority change → 350 observer teardown/recreate
          → activeObserver fires manqués → currentPage bloqué
              → shouldCleanup=true pour pages <(currentPage-10)
                  → isRendered ignoré → placeholder affiché
                      → pas de rendu de contenu → scroll bloqué ↩
```

---

## 3. Correctifs appliqués

### FIX-1 — Supprimer `shouldCleanup` (`PdfViewer.tsx` L117-120)

```typescript
// Avant
const distanceFromCurrent = currentPage ? Math.abs(pageNumber - currentPage) : Infinity;
const isPriority = distanceFromCurrent <= 3;
const shouldCleanup = distanceFromCurrent > 10;

// Après
const distanceFromCurrent = currentPage ? Math.abs(pageNumber - currentPage) : Infinity;
const isPriority = distanceFromCurrent <= 3; // conservé uniquement pour <Page loading>
```

La virtualisation est désormais **exclusivement pilotée par l'IntersectionObserver** : une page rend son contenu quand elle est dans la zone de 2000px, et affiche le placeholder quand elle en sort. Plus aucune logique basée sur la distance à `currentPage`.

### FIX-2 — `rootMargin` stable + retrait de `isPriority` des deps (`L205-219`)

```typescript
// Avant
const rootMargin = isPriority ? '1000px' : '2000px';
const renderObserver = new IntersectionObserver(..., { root, rootMargin });
}, [pageNumber, onVisible, containerRef, isPriority]);

// Après
const renderObserver = new IntersectionObserver(..., { root, rootMargin: '2000px' });
}, [pageNumber, onVisible, containerRef]);
```

Les observers ne sont créés qu'une seule fois par page (à son montage). Zéro churn sur le défilement.

### FIX-3 — Condition de rendu (`L270`)

```typescript
// Avant
{isRendered && !shouldCleanup ? (

// Après
{isRendered ? (
```

### FIX-4 — Retrait de `currentPage` du comparateur `React.memo` (`L354-367`)

```typescript
// Avant
&& prev.currentPage === next.currentPage; // 350 re-renders/pas de scroll

// Après
// ligne supprimée — currentPage n'est plus dans le comparateur
```

Les 350 instances `LazyPage` ne re-rendent plus à chaque changement de `currentPage`. Seuls les props qui affectent réellement le rendu visuel (scale, theme, annotations…) déclenchent un re-render.

---

## 4. Comportement après correctif

| Scénario | Avant | Après |
|----------|-------|-------|
| Scroll vers le haut sur 350 pages | Bloqué à ~page 52 | Fluide jusqu'à page 1 |
| Observers créés par pas de scroll | 350 teardown/recreate | 0 (stables) |
| Re-renders `LazyPage` par `currentPage` change | 350 | 0 |
| Pages en dehors des 2000px | Placeholder ✅ | Placeholder ✅ |
| Pages dans les 2000px | Parfois bloquées en placeholder ❌ | Contenu rendu ✅ |
| `loading` eager/lazy sur pages proches | ✅ | ✅ (isPriority conservé) |

---

## 5. Invariants préservés

- La virtualisation fonctionne toujours : pages hors viewport (>2000px) affichent le placeholder
- L'architecture Camera est intacte (aucune modification hors `LazyPageInner` et `React.memo`)
- `isPriority` est conservé pour l'attribut `loading` de `<Page>` (hint au browser)
- Les patterns CLAUDE.md sont respectés (primitives dans deps, pas d'objets)

---

## 6. Validation technique

```
npx tsc --noEmit   → ✅ PASS (0 erreur)
npm run build      → ✅ PASS (build en 4.53s)
```

Avertissements pre-existants (non introduits) :
- Supabase dynamic/static import mismatch (hors scope)
- pdf-engine chunk 823 kB (hors scope — Phase 3)

---

## 7. Fichiers modifiés

| Fichier | Lignes impactées | Type |
|---------|-----------------|------|
| `src/components/PdfViewer.tsx` | L117-120, L205-219, L270, L354-367 | Bug fix |

---

## 8. Tests manuels recommandés

- [ ] PDF 350+ pages, ScrollMode.CONTINUOUS : scroll rapide vers le bas jusqu'à la page 300, puis remonter vers la page 1 sans blocage
- [ ] Vérifier que les pages hors viewport affichent le placeholder (virtualisation active)
- [ ] Zoom + scroll : pas de flash de contenu pendant le zoom
- [ ] Rotation tablette en mode continu : pas de régression
- [ ] Desktop (Chrome, Firefox, Edge) : aucune régression visuelle
