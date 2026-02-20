# TECH_ARCH.md

## Stack technique (Existante & Normalisée)

| Composant | Technologie | Version |
|-----------|-------------|---------|
| Langage | TypeScript | ~5.8.2 |
| Framework | Vite / React | 6.2.0 / 19.2.3 |
| PDF Engine | react-pdf / pdfjs-dist | 10.2.0 / 5.4.296 |
| Runtime | Electron | 39.2.7 |
| Styling | TailwindCSS | 3.4.19 (Local + PostCSS) |

## Architecture de rendu (Post-Phase 5)

### Principes fondamentaux

1. **Zoom Optique Global** : Un `transform: scale(S)` CSS unique sur `#pdf-camera` applique le zoom à tout le document. Pas de re-layout, 0ms de latence.

2. **DPR-based Quality** : La résolution de rendu est contrôlée par `devicePixelRatio` dans `<Page>`, PAS par `width`. `width` reste constant (`pageDimensions.width`) ce qui empêche react-pdf de remonter son Canvas (via `pageKey`). Le `qualityDpr` combine le `committedScale`, un boost adaptatif, et le DPR natif de l'écran.

3. **120fps Gesture Rendering** : Pendant les gestes (wheel/pinch), le `transform` du `#pdf-camera` est mis à jour par manipulation DOM directe (`cameraRef.current.style.transform`). React state est synchronisé uniquement en fin de geste (debounce 80ms pour wheel, `touchend` pour pinch).

4. **Two-Phase Scale Commit** : `debouncedScale` → `committedScale` via `useLayoutEffect`. La capture d'un clone canvas se fait AVANT que react-pdf ne clear le canvas pour le re-render HD. Le clone couvre le `visibility: hidden` de react-pdf pendant le rendu.

### Pipeline de zoom (séquence)

```
User gesture → Direct DOM transform (instant, 120fps)
          ↓ (gesture ends)
React state update (scale) → useDebounce → debouncedScale
          ↓ (150ms stabilization)
useLayoutEffect: capture canvas clone → setCommittedScale
          ↓ (synchronous re-render)
qualityDpr changes → <Page devicePixelRatio={qualityDpr}> → react-pdf re-renders
          ↓ (async render complete)
onRenderSuccess → remove canvas clone → HD pixels visible
```

### Gestion des liens internes

Les liens internes PDF (TOC, renvois, index) sont interceptés à deux niveaux :
- `<Document onItemClick>` : intercepte les clics react-pdf sur les annotations de lien.
- `useEffect` click handler : intercepte les `<a href="#...">` et résout les destinations nommées via `pdf.getDestination()`.

`scrollToPage()` gère les deux modes :
- **Mode continu** : scroll DOM vers l'élément `[data-page-number]`.
- **Mode paginé** : `setPageNumber()` pour rendre la page cible.

## Navigation & Architecture Workspace (Phase 2 - Caméra)

| Concept | Solution | Implémentation |
|----------|----------|----------------|
| Origine de transformation | Fixe et absolue | `transform-origin: 0 0` sur `#pdf-camera` pour empêcher le débordement négatif. |
| Workspace Panning | Padding Invariant | Le padding garantissant l'espace de scroll est appliqué **à l'extérieur** de l'élément scalé, empêchant sa multiplication exponentielle par le niveau de zoom. |
| Zoom Caméra | Transform CSS | `scale(S)` sur `#pdf-camera`. |
| Visée (Aiming) | Projection Spatiale Barycentrique | La cible du zoom utilise les coordonnées du geste `(e.clientX, e.clientY)` et maintient strict le delta de scroll. |
| Netteté | DPR-based | `<Page width={fixe} devicePixelRatio={qualityDpr}>`. |
| 120fps gestes | Direct DOM | `cameraRef.current.style.transform` pendant le geste. |
| Snapshot | Canvas clone | `drawImage(canvas, 0, 0)` pixel-perfect, mêmes dimensions CSS. |

## Dette technique (Reset)
- **Transform Performance** : Le scale CSS global est extrêmement performant (GPU).
- **Debounce tuning** : 150ms pour la stabilisation qualité, 80ms pour le commit wheel → React.
- **TextLayer task cancelled** : Warning bénin de PDF.js lors du démontage rapide de pages (virtualisation). Sans impact utilisateur.
