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

LuminaPDF is a high-performance web PDF reader built with React 19 + TypeScript + Vite. It uses a **Camera architecture** with GPU-accelerated CSS transforms to achieve smooth zoom and 360° panning, powered by `react-pdf` for PDF rendering with lazy loading.

> **History:** The project was fully reconstructed in February 2026 ("Project Rebirth"). The former tiled rendering engine (TileLayer, RenderPool, custom Web Workers, CoordinateSystem) was abandoned entirely in favor of this simpler, more stable architecture.

### Tech Stack

- React 19, TypeScript 5.8, Vite 6
- `react-pdf` + `pdfjs-dist` (worker loaded via CDN, not a custom legacy build)
- Tailwind CSS v3.4.19 (local NPM + PostCSS — **not CDN**)
- Electron for desktop builds
- Google Gemini AI (`@google/genai`), Supabase (optional cloud features)

## Core Architecture: Camera Model

The rendering pipeline is built around a fixed "world" that a CSS camera zooms into.

### DOM Hierarchy

```
containerRef  (overflow: auto, h-full w-full)          ← Scroll viewport
  └─ #pdf-camera  (transform: scale(S), origin: center center, willChange: transform)  ← Camera lens (GPU)
      └─ #pdf-workspace  (contentRef, display: grid, padding: 100vh 100vw)             ← Fixed world (1:1)
          └─ #pdf-scale-layer
              └─ <Document> → <LazyPage> × N
```

**Key principles:**
1. **Fixed World**: `#pdf-workspace` dimensions never change. Pages are sized at their original 1:1 PDF dimensions.
2. **Optical Zoom**: The camera (`#pdf-camera`) applies a single `transform: scale(S)` — no DOM reflowing.
3. **HD Injection**: Pages render at `width = originalWidth * debouncedScale` (high-res), then a `transform: scale(1/debouncedScale)` inverse brings them back to 1:1 size. Net result: sharp pixels inside a fixed box.
4. **360° Panning**: `padding: 100vh 100vw` around the world creates a massive scroll canvas.

### Rendering Flow

```
User zooms (wheel / button)
  │
  ├─► scale state updates immediately
  │     └─► #pdf-camera transform: scale(S) → instant visual zoom (GPU, 60fps)
  │
  └─► useDebounce(150ms) → debouncedScale stabilizes
        └─► LazyPage re-renders <Page width={original * debouncedScale}> → sharp HD pixels
```

### Component Hierarchy

```
App.tsx (root state, drag-drop, file handling, theme, reading position)
├─ Toolbar.tsx (zoom, theme, page controls, fit-to-width)
├─ OutlinePanel.tsx (PDF table of contents, named link resolution)
├─ PdfViewer.tsx (Camera orchestrator: scroll, zoom, LazyPage, centring)
│   └─ LazyPage (IntersectionObserver × 2: pre-render + page tracking)
├─ AnnotationLayer.tsx (annotation overlay)
├─ AiPanel.tsx (Gemini chat sidebar — modal on mobile)
└─ RecentFiles.tsx (dashboard grid with auto-generated thumbnails)
```

### Key Modules

| Module | Purpose |
|--------|---------|
| `src/components/PdfViewer.tsx` | Camera orchestrator: zoom, centring, HD injection, lazy loading |
| `src/utils/ThemeManager.ts` | CSS variables `--lumina-*`, theme application |
| `src/services/storage.ts` | IndexedDB persistence, reading position, thumbnail generation (JPEG 200px) |
| `src/services/geminiService.ts` | Google Gemini AI integration |
| `src/hooks/useDebounce.ts` | Quality scale stabilization (only shared hook remaining) |

### Custom Hooks

| Hook | Purpose |
|------|---------|
| `useDebounce.ts` | Debounce `scale` → `debouncedScale` (150ms) for HD injection timing |

## Critical Patterns (MUST MAINTAIN)

### 1. Camera Geometry — NEVER use `container.scrollWidth` for geometric math

With `transform-origin: center center` + `scale(S)`, the browser clips all negative-coordinate overflow (CSS Overflow Module Level 3 §2.2). When `S > 1`, the left visual edge becomes negative and is silently cropped. This makes `container.scrollWidth` **asymmetric and unreliable**:

```
container.scrollWidth = W × (1 + S) / 2   for S ≥ 1
container.scrollWidth = W                  for S < 1
```

**Single source of truth**: `contentRef.current.scrollWidth` — the layout width of `#pdf-workspace`, invariant under the parent's CSS transform.

**Correct formulas (use these everywhere):**

```typescript
// Initial centring
container.scrollTo({
  left: content.scrollWidth / 2 - container.clientWidth / 2,
  top:  content.scrollHeight / 2 - container.clientHeight / 2,
  behavior: 'instant',
});

// Zoom stabilisation (invariant projection)
const Cx = content.scrollWidth / 2;   // Fixed world centre
const Cy = content.scrollHeight / 2;
const viewCenterX = scrollLeft + clientWidth / 2;
const viewCenterY = scrollTop + clientHeight / 2;
const ratio = newScale / lastScaleRef.current;
const newCenterX = Cx + (viewCenterX - Cx) * ratio;
const newCenterY = Cy + (viewCenterY - Cy) * ratio;
container.scrollTo({ left: newCenterX - clientWidth / 2, top: newCenterY - clientHeight / 2, behavior: 'instant' });
```

**Timing**: Use double `requestAnimationFrame` (not `setTimeout`) to ensure layout is computed before reading scroll dimensions:
```typescript
requestAnimationFrame(() => requestAnimationFrame(centerDocument));
```

### 2. HD Injection Pattern

Pages must render inside a fixed-size wrapper. The inner content renders at high resolution then is visually compressed back:

```tsx
// Wrapper: fixed 1:1 world dimensions
<div style={{ width: pageDimensions.width, height: pageDimensions.height, overflow: 'hidden' }}>
  {/* Inner: HD render + inverse scale */}
  <div style={{ transform: `scale(${1 / debouncedScale})`, transformOrigin: '0 0', width: renderWidth }}>
    <Page width={renderWidth} />   {/* renderWidth = pageDimensions.width * debouncedScale */}
  </div>
</div>
```

### 3. Lazy Loading (LazyPage)

Each page uses **two separate IntersectionObservers**:
- **Pre-render observer**: 2000px `rootMargin` — triggers rendering before the user reaches the page
- **Page tracking observer**: 0px margin, 50% threshold — updates the current page number in the toolbar

Disconnect the pre-render observer immediately after first intersection to avoid repeated triggers.

### 4. Parallel Page Dimension Loading

On `Document.onLoadSuccess`, load all page viewports in parallel (never in a loop with sequential `await`):

```typescript
const results = await Promise.all(
  Array.from({ length: pdf.numPages }, (_, i) =>
    pdf.getPage(i + 1).then(p => ({ i: i + 1, vp: p.getViewport({ scale: 1 }) }))
  )
);
// Single setState call after all promises resolve
```

### 5. Fixed Panels Outside the Camera

Components with `position: fixed` (`OutlinePanel`, `AiPanel`) **must be rendered outside `#pdf-camera`**. CSS `transform` creates a new stacking context that breaks `position: fixed`.

### 6. Primitives in React Dependencies

Always pass primitive values (`scale`, `x`, `y`) — never objects — into `useEffect`/`useMemo` dependency arrays to avoid infinite re-render loops.

### 7. Tailwind: Local NPM Build Only

Tailwind is configured locally via PostCSS (`tailwind.config.js`, `postcss.config.js`). Do NOT reintroduce CDN scripts or importmap entries in `index.html`.

## Theming Architecture

Themes are applied via **CSS custom properties** injected at the `:root` level by `ThemeManager.ts`.

- Variables follow the `--lumina-*` naming convention (`--lumina-bg`, `--lumina-text`, `--lumina-bg-secondary`, etc.)
- UI components use only `.glass-premium`, `.dropdown-premium`, `.btn-action` utility classes — no hardcoded hex colors
- PDF page background inversion (for dark themes) uses an **SVG filter** approach. When a filter is active, the `LazyPage` container background is forced to white so the inversion maps correctly to the target paper color
- `color-mix(in srgb, var(--lumina-bg-secondary), transparent 25%)` is used for glassmorphism effects

## Coordinate System

- **World Space (1:1)**: Fixed DOM layout dimensions of the PDF pages and workspace, before any CSS transform. `contentRef.current.scrollWidth/Height` is the authoritative measurement.
- **Screen Space**: What the user sees after the camera `scale(S)` transform is applied.
- **Scroll Space**: The `scrollLeft`/`scrollTop` values of `containerRef`. Asymmetric when `S > 1` due to negative overflow clipping — do NOT use for geometric centre calculations.

## Lazy Loading & Performance

- `IntersectionObserver` with `rootMargin: '2000px'` pre-renders pages before they enter the viewport
- `useDebounce(scale, 150)` prevents HD re-renders during active zoom interaction
- `Promise.all` parallelises PDF page dimension queries on document open
- `useCallback` on `handlePageVisible` prevents IntersectionObserver recreation on every render

## Storage & Persistence

`src/services/storage.ts` uses **IndexedDB** for:
- Reading position (page + zoom level) — restored on file reopen
- Auto-generated JPEG thumbnails of page 1 (200px wide) — shown in the Recent Files dashboard

## Known Current Issues / Future Work

- **Dual Transform architecture** (recommended by QA Audit, not yet implemented): Replace the current `transform-origin: center center` camera with a fixed 10000×10000px scroll canvas + `transform-origin: 0 0`. This would eliminate the asymmetric overflow clipping problem permanently, simplify all centring math, and enable true symmetric 360° panning at all zoom levels.
- **Mobile touch gestures**: Pinch-to-zoom is not implemented. `touch-action: pan-y` enables native vertical scroll on tablets.
- **Multi-panel layout**: AI panel and Outline panel cannot be shown simultaneously on large screens (backlog).
- **Cloud annotation sync**: Supabase integration exists but cloud sync is not yet wired up.
- **Thumbnail compression**: Thumbnail generation is functional but no active compression is applied.
