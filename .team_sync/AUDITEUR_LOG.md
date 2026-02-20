# 📋 Rapport d'Audit — Jitter du Zoom Molette (Conflit useLayoutEffect)

**Date :** 2026-02-20

---

## Diagnostic Confirmé

### Bug
Le zoom molette (et potentiellement le pinch tactile) subit un sursaut visible (jitter) au moment où le debounce React commit la nouvelle valeur de `scale`.

### Cause Racine
Deux systèmes d'ancrage du scroll coexistent et entrent en conflit :

1. **`applyInlineAiming`** (L705) — Ancrage direct-DOM 120fps. Fonctionne parfaitement pendant le geste.
2. **`useLayoutEffect`** (L508) — Aiming Global. Se déclenche quand la prop React `scale` change (commit debounced).

Le garde à L511 (`scale === lastScaleRef.current`) devrait théoriquement court-circuiter l'effet car `applyInlineAiming` synchronise `lastScaleRef.current` (L710). **Mais** ce garde n'est pas suffisant :
- Le `useLayoutEffect` s'exécute dans la phase commit synchrone de React.
- Si le commit React arrive alors qu'un `requestAnimationFrame` de l'Aiming Global est encore en file d'attente (L533), celui-ci s'exécutera **après** le commit avec un `scrollLeft/Top` périmé.
- Même si le garde passe, un rAF résiduel de L533 peut toujours tirer et forcer un `scrollTo` parasite.

### Preuve de code — Le rAF résiduel

```typescript
// L533-555 — useLayoutEffect Aiming Global
aimingRafRef.current = requestAnimationFrame(() => {
  // Ce callback peut tirer APRÈS que applyInlineAiming ait stabilisé le scroll,
  // avec des valeurs scrollLeft/scrollTop capturées AVANT la stabilisation.
  container.scrollTo({
    left: scrollLeft + distanceX * (ratio - 1),  // scrollLeft périmé !
    top: scrollTop + distanceY * (ratio - 1),
    behavior: 'instant'
  });
});
```

---

## Plan de Remédiation Prescrit au Coder

### Étape 1 : Déclarer le verrou
Après les refs existantes (~L393), ajouter :
```typescript
const isInteractiveZoomRef = useRef(false);
```

### Étape 2 : Activer le verrou dans `handleWheel`
Dans `handleWheel` (L746), après `e.preventDefault()` :
```typescript
isInteractiveZoomRef.current = true;
```

### Étape 3 : Activer le verrou dans `handleTouchMove` (Pinch)
Dans `handleTouchMove` (L810), après `e.preventDefault()` :
```typescript
isInteractiveZoomRef.current = true;
```

### Étape 4 : Court-circuiter le `useLayoutEffect` Aiming Global
Dans le `useLayoutEffect` (L508), **après** le garde `isFirstRender` (L517-520) et **avant** le bloc de calcul (L522), ajouter :
```typescript
// Skip if zoom was driven by interactive gesture (wheel/pinch) —
// applyInlineAiming already handled the scroll correction in direct-DOM.
if (isInteractiveZoomRef.current) {
  lastScaleRef.current = scale;
  isInteractiveZoomRef.current = false;
  return;
}
```

### Pourquoi le reset se fait ICI et pas dans les handlers ?
Le verrou reste `true` tant que React n'a pas committé la nouvelle valeur de `scale`. C'est **uniquement** dans le `useLayoutEffect` (qui se déclenche au commit) que l'on sait que l'état React est synchronisé — c'est donc le seul endroit sûr pour réarmer le verrou à `false`. Le prochain zoom via boutons (qui ne touche pas à `isInteractiveZoomRef`) passera normalement par l'Aiming Global.

---

## Résumé des Modifications

| # | Fichier | Ligne | Action |
|---|---------|-------|--------|
| 1 | `PdfViewer.tsx` | ~393 | Ajouter `const isInteractiveZoomRef = useRef(false);` |
| 2 | `PdfViewer.tsx` | ~748 | Ajouter `isInteractiveZoomRef.current = true;` dans `handleWheel` |
| 3 | `PdfViewer.tsx` | ~812 | Ajouter `isInteractiveZoomRef.current = true;` dans `handleTouchMove` |
| 4 | `PdfViewer.tsx` | ~521 | Court-circuit dans `useLayoutEffect` avec reset du verrou |