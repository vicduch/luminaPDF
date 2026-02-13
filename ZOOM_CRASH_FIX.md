# 🔴 ZOOM CRASH FIX PLAN (Sprint 2.1.4)

*Date : 11 Janvier 2026*

---

## 🚨 PROBLÈME

L'application crash (écran blanc) après 3-5 zooms rapides. Une erreur JavaScript non capturée dans `PDFTile` démonte tout l'arbre React.

---

## 📋 FIXES PROPOSÉS

### Fix 1 : Error Boundary pour PDFTile

**Fichier** : `components/PDFTileErrorBoundary.tsx` [NEW]

```tsx
import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
    tileId: string;
}

interface State {
    hasError: boolean;
}

export class PDFTileErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(): State {
        return { hasError: true };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.warn(`[PDFTile ${this.props.tileId}] Render error:`, error.message);
    }

    render() {
        if (this.state.hasError) {
            // Render nothing instead of crashing
            return null;
        }
        return this.props.children;
    }
}
```

**Intégration** dans `TileLayer.tsx` (ligne 324) :
```tsx
{tilesToRender.map(tile => (
    <PDFTileErrorBoundary key={tile.id} tileId={tile.id}>
        <PDFTile tile={tile} onReady={handleTileReady} palette={palette} />
    </PDFTileErrorBoundary>
))}
```

---

### Fix 2 : Mémoiser `palette` dans PdfViewer

**Fichier** : `components/PdfViewer.tsx`

**Problème** : `getRenderPalette(theme, themeVariant)` crée un nouvel objet à chaque render.

**Solution** :
```tsx
// AVANT (inline)
palette={getRenderPalette(theme, themeVariant)}

// APRÈS (mémorisé)
const palette = useMemo(
    () => getRenderPalette(theme, themeVariant),
    [theme, themeVariant]
);
// ...
palette={palette}
```

---

### Fix 3 : Throttle du Zoom Toolbar

**Fichier** : `hooks/useZoom.ts`

**Problème** : Clics rapides sur +/- déclenchent plusieurs zooms instantanés.

**Solution** : Ajouter un throttle de 100ms sur `handleToolbarZoom`.

```tsx
const lastToolbarZoomRef = useRef<number>(0);
const TOOLBAR_THROTTLE_MS = 100;

const handleToolbarZoom = useCallback((newScaleTarget: number) => {
    const now = Date.now();
    if (now - lastToolbarZoomRef.current < TOOLBAR_THROTTLE_MS) return;
    lastToolbarZoomRef.current = now;
    
    // ... reste du code existant
}, [...]);
```

---

## 📦 FICHIERS À MODIFIER

| Fichier | Action |
|---------|--------|
| `components/PDFTileErrorBoundary.tsx` | Créer |
| `components/TileLayer.tsx` | Wrapper PDFTile avec ErrorBoundary |
| `components/PdfViewer.tsx` | Mémoiser `palette` |
| `hooks/useZoom.ts` | Throttle `handleToolbarZoom` |

---

## ✅ VALIDATION

1. Zoom rapide (5+ clics) → Pas de crash (erreurs silencieuses)
2. Console → Warnings `[PDFTile] Render error` au lieu de crash
3. Thèmes → Pas de re-render infini en changeant de thème
