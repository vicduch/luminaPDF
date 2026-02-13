# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm install              # Install dependencies
npm run dev              # Start Vite dev server (localhost:3000)
npm run build            # Production build to /dist
npm run preview          # Preview production build
npm run electron:dev     # Dev with Electron (desktop app)
npm run electron:build   # Package desktop app (NSIS installer)
```

Set `GEMINI_API_KEY` in `.env.local` for AI chat features.

## Project Overview

LuminaPDF is a high-performance web PDF reader built with React 19 + TypeScript + Vite. It uses a **tiled rendering architecture** with Web Workers to achieve 60fps interactions—breaking pages into small tiles (256-512px) rendered in parallel at varying resolutions (LOD system).

### Tech Stack
- React 19, TypeScript 5.8, Vite 6
- PDF.js (`pdfjs-dist` legacy build for worker compatibility)
- Tailwind CSS (via CDN), lucide-react icons
- Electron for desktop builds
- Google Gemini AI (`@google/genai`), Supabase (optional cloud features)

## Core Architecture: Hybrid Geometry/Quality Decoupling

The rendering pipeline splits into two independent systems:

**GEOMETRY LAYER (60fps, CSS transforms)**
- User input instantly updates `scale`, `scrollX`, `scrollY`
- Applied via CSS `transform: matrix(...)` for immediate visual feedback
- May appear blurry during motion—this is intentional

**QUALITY LAYER (Async, debounced ~150ms)**
- After geometry stabilizes, `renderQualityScale` triggers tile rendering
- Only visible tiles render (culling), sorted by radial distance (center-first)
- Sharp HD pixels replace temporary blurry tiles

### Component Hierarchy

```
App.tsx (root state, drag-drop)
├─ Toolbar.tsx (zoom, theme, page controls)
├─ PdfViewer.tsx (orchestrator: scroll, zoom, virtualizer)
│   ├─ TileLayer.tsx (tile lifecycle, LOD selection, caching)
│   │   ├─ PDFTile.tsx (individual canvas, ImageBitmap display)
│   │   └─ OverviewLayer.tsx (low-res fallback, prevents gray gaps)
│   └─ react-pdf (text layer, annotations)
└─ AiPanel.tsx (Gemini chat sidebar)
```

### Key Utilities

| Module | Purpose |
|--------|---------|
| `TileManager.ts` | Viewport → tile grid math, LOD ceiling, radial sorting |
| `RenderPool.ts` | Worker pool management, job distribution/cancellation, LRU cache |
| `CoordinateSystem.ts` | Screen ↔ World coordinate conversions |
| `ThemeManager.ts` | 9 themes × 2 variants, CSS variables, pixel recoloring palettes |
| `pdf.worker.ts` | PDF.js render, pixel-level recolorization, ImageBitmap transfer |

### Custom Hooks

| Hook | Purpose |
|------|---------|
| `useZoom.ts` | Focal-point zoom with coordinate normalization/restoration |
| `useDebounce.ts` | Geometry → quality scale stabilization |

## Critical Patterns (MUST MAINTAIN)

1. **Primitives in Dependencies**: Always use primitive values (`scale`, `x`, `y`) not objects in `useEffect`/`useMemo` dependencies. Objects cause infinite re-render loops.

2. **Worker-Side Recolorization**: Theme colors are applied in the Web Worker via pixel manipulation. Never use CSS `filter: invert()` for theming—it produces poor contrast.

3. **Debounced Quality, Live Geometry**: Pan/scroll must be instant (0 latency). Only zoom quality is debounced to prevent render thrashing.

4. **OverviewLayer Fallback**: Always maintain a low-LOD (0.25) background layer to prevent gray gaps during fast zoom/scroll.

5. **LOD Ceiling Strategy**: Render at higher resolution than displayed, then CSS downscale for sharp output.

6. **PDF.js Legacy Build**: The worker uses `pdfjs-dist/legacy/build/pdf.mjs` to avoid nested worker spawning issues.

## Coordinate System

- **World Space**: Virtual stable coordinates of the PDF document
- **Screen Space**: Actual browser window pixel coordinates
- **LOD (Level of Detail)**: Discrete zoom factors (0.25, 0.5, 1.0, 1.5, 2.0) controlling tile resolution

Use `CoordinateSystem.ts` for all conversions. Use `Math.floor`/`Math.ceil` appropriately to prevent 1px gaps between tiles.

## Theming Architecture

9 themes (Light, Sepia, Dark, Midnight, Blue Night, Forest, Solarized, OLED, eInk) × 2 variants (Light/Dark) = 18 configurations.

Pixel-level recolorization workflow:
1. PDF.js renders to OffscreenCanvas
2. Worker analyzes pixel luminance
3. Luminance maps to theme foreground/background colors
4. Outputs perfectly colorized ImageBitmap

## Worker Communication

Messages use `type` field for routing:
- `renderTile`: Request tile render with page, coords, LOD, theme palette
- `cancelJob`: Cancel in-flight render
- Worker returns `ImageBitmap` via transferable (zero-copy)

## Known Current Issues

- Partial tile blur at extreme zoom (>300%) due to LOD cache race condition
- Mobile touch gestures need refinement with new architecture
