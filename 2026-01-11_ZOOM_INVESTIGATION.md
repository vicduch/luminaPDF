# 🔍 ZOOM CRASH INVESTIGATION
*Date: 11 January 2026*
*Author: Antigravity Auditor*

## 🚨 CRITICAL FINDING: OVERLAPPING ANIMATION LOOPS

The "White Screen of Death" during rapid zooming is caused by **overlapping animation loops** in `useZoom.ts`.

### 1. The Root Cause
When the user clicks the Zoom (+) button rapidly:
1. `App.tsx` calls `handleToolbarZoom(newScale, true)`.
2. `useZoom.ts` starts an animation loop using `requestAnimationFrame`.
3. **CRITICAL BUG**: `handleToolbarZoom` does **NOT** cancel the previous animation frame before starting a new one.

```typescript
// hooks/useZoom.ts (Current Code)
const handleToolbarZoom = useCallback((newScaleTarget: number, animate: boolean = false) => {
    // ...
    if (animate) {
        // ...
        const animateStep = (currentTime: number) => {
            // ...
            if (progress < 1) {
                animationFrameRef.current = requestAnimationFrame(animateStep);
            }
        };
        // ❌ BUG: Overwrites ref without cancelling the previous one!
        animationFrameRef.current = requestAnimationFrame(animateStep);
    }
    // ...
});
```

### 2. The Chain Reaction
1. **User clicks 5 times in 1 second.**
2. **5 concurrent animation loops** are spawned.
3. They all fight to call `setScale(...)` every 16ms.
4. React receives hundreds of state updates.
5. `TileLayer` recalculates `visibleTiles` hundreds of times.
6. `RenderPool` is flooded with `RENDER_TILE` and `CANCEL_TILE` messages.
7. **Crash**: The Worker terminates (OOM or race condition) or the Main Thread freezes.

### 3. "Zoom Capped at 300%" Mystery
The user observed zoom is capped at 300%.
- **Config**: `App.tsx` sets `maxScale: 8.0`.
- **UI CAP**: `Toolbar.tsx` explicitly hardcodes the cap:
  ```typescript
  // Toolbar.tsx
  onClick={() => setScale(Math.min(3.0, scale + 0.1))} // Hardcoded 3.0 limit
  ```
- **Discrepancy**: The engine is built for 800%, but the UI locks it at 300%.

---

## 🛠 RECOVERY PLAN

### 1. Fix `useZoom.ts` (Priority Critical)
Add `cancelAnimationFrame` guard clause at the start of `handleToolbarZoom`.

```typescript
const handleToolbarZoom = useCallback((newScaleTarget: number, animate: boolean = false) => {
    // FIX: Cancel any running animation immediately
    if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
    }
    // ... rest of code
```

### 2. Standardize Constants
Refactor `App.tsx` and `Toolbar.tsx` to use shared constants for `MIN_SCALE` (0.1) and `MAX_SCALE` (8.0), removing the hardcoded 3.0 limit in the Toolbar.

### 3. Defensive Measures
- **Error Boundary**: Implement the `PDFTileErrorBoundary` proposed in previous fix plans.
- **Throttle**: Keep the throttle idea as a UX improvement, but the core fix is the animation cancellation.

---

## ✅ CONCLUSION
The "Zoom Engine" bug is a classic async race condition. We do not need a deep architecture rewrite. We simply need to ensure only **one** zoom animation runs at a time.
