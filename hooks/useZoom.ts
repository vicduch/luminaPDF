/**
 * useZoom.ts - Stable Zoom Hook
 *
 * Implement a "Stable Zoom" pattern using normalized coordinates:
 * 1. CAPTURE: Before scale update, capture the focal point as normalized coords (0-1)
 * 2. UPDATE: Call setScale (triggers React re-render)
 * 3. RESTORE: In useLayoutEffect, before browser paint, restore scroll position
 *
 * This pattern guarantees the focal point remains visually stationary regardless
 * of React's async rendering or layout changes.
 */

import { useCallback, useRef, useLayoutEffect, MutableRefObject } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface ZoomConfig {
    minScale: number;
    maxScale: number;
    wheelSensitivity: number;
    animationDuration: number;
}

export interface ZoomState {
    scale: number;
    targetScale: number;
    isAnimating: boolean;
}

export enum ZoomMode {
    /** Zoom centers on the Viewport center (wheel, toolbar) */
    CENTER = 'center',
    /** Zoom centers on a specific point (pinch midpoint) */
    FOCAL_POINT = 'focal_point',
    /** Fit to screen - special case, scrolls to origin */
    FIT_TO_SCREEN = 'fit_to_screen'
}

/** Normalized focal point (coordinates 0-1 relative to content) */
interface NormalizedFocalPoint {
    /** X position as ratio of content width (0 = left edge, 1 = right edge) */
    ratioX: number;
    /** Y position as ratio of content height */
    ratioY: number;
    /** Offset from container left to focal point (px) */
    offsetX: number;
    /** Offset from container top to focal point (px) */
    offsetY: number;
}

/** Pending zoom operation to be completed in useLayoutEffect */
interface PendingZoom {
    mode: ZoomMode;
    oldScale: number;
    newScale: number;
    focalPoint: NormalizedFocalPoint | null;
}

export interface UseZoomOptions {
    containerRef: MutableRefObject<HTMLElement | null>;
    contentRef: MutableRefObject<HTMLElement | null>;
    scale: number;
    setScale: (scale: number) => void;
    config?: Partial<ZoomConfig>;
    onZoomStart?: () => void;
    onZoomEnd?: () => void;
}

export interface UseZoomReturn {
    /** Handle wheel zoom (Ctrl/Cmd + wheel) - zooms at viewport center */
    handleWheelZoom: (e: WheelEvent) => void;
    /** Handle toolbar zoom (+/- buttons) - zooms at viewport center */
    handleToolbarZoom: (newScale: number, animate?: boolean) => void;
    /** Handle pinch zoom update - zooms at finger midpoint */
    handlePinchZoom: (newScale: number, midpoint: { x: number; y: number }) => void;
    /** Handle fit to screen - special calculation */
    handleFitToScreen: (targetScale: number) => void;
    /** Clamp scale to valid range */
    clampScale: (scale: number) => number;
    /** Current zoom mode for debugging */
    currentMode: MutableRefObject<ZoomMode | null>;
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: ZoomConfig = {
    minScale: 0.2,
    maxScale: 5.0,
    wheelSensitivity: 0.002,
    animationDuration: 200
};

// ─────────────────────────────────────────────────────────────────────────────
// HOOK IMPLEMENTATION
// ─────────────────────────────────────────────────────────────────────────────

export function useZoom({
    containerRef,
    contentRef,
    scale,
    setScale,
    config: userConfig,
    onZoomStart,
    onZoomEnd
}: UseZoomOptions): UseZoomReturn {

    const config = { ...DEFAULT_CONFIG, ...userConfig };
    const currentMode = useRef<ZoomMode | null>(null);
    const lastWheelTime = useRef<number>(0);
    const animationFrameRef = useRef<number | null>(null);

    // ═══════════════════════════════════════════════════════════════════════
    // STABLE ZOOM STATE
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Stores pending zoom operation to be completed after React render.
     * This ref persists across renders and is consumed by useLayoutEffect.
     */
    const pendingZoomRef = useRef<PendingZoom | null>(null);

    // ═══════════════════════════════════════════════════════════════════════
    // CORE: Capture Focal Point (Pre-Update)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Captures the current focal point as normalized coordinates.
     * Called BEFORE setScale to freeze the visual anchor point.
     *
     * @param screenX - Focal point X in screen coordinates (or null for center)
     * @param screenY - Focal point Y in screen coordinates (or null for center)
     */
    const captureFocalPoint = useCallback((
        screenX?: number,
        screenY?: number
    ): NormalizedFocalPoint | null => {
        const container = containerRef.current;
        const content = contentRef.current;

        if (!container || !content) return null;

        const containerRect = container.getBoundingClientRect();
        const { scrollLeft, scrollTop, clientWidth, clientHeight } = container;

        // Determine focal point on screen
        const focalScreenX = screenX ?? (containerRect.left + clientWidth / 2);
        const focalScreenY = screenY ?? (containerRect.top + clientHeight / 2);

        // Offset from container origin
        const offsetX = focalScreenX - containerRect.left;
        const offsetY = focalScreenY - containerRect.top;

        // Position in content coordinates (accounting for scroll)
        const contentX = scrollLeft + offsetX;
        const contentY = scrollTop + offsetY;

        // Content dimensions at current scale
        const contentWidth = content.scrollWidth;
        const contentHeight = content.scrollHeight;

        // Normalize to 0-1 range
        const ratioX = contentWidth > 0 ? contentX / contentWidth : 0.5;
        const ratioY = contentHeight > 0 ? contentY / contentHeight : 0.5;

        return { ratioX, ratioY, offsetX, offsetY };

    }, [containerRef, contentRef]);

    // ═══════════════════════════════════════════════════════════════════════
    // CORE: Restore Scroll Position (Post-Update)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * useLayoutEffect runs synchronously after React DOM mutations but BEFORE
     * the browser paints. This is the perfect time to adjust scroll position
     * based on the new layout.
     */
    useLayoutEffect(() => {
        const pending = pendingZoomRef.current;
        if (!pending) return;

        // Consume the pending zoom
        pendingZoomRef.current = null;

        const container = containerRef.current;
        const content = contentRef.current;

        if (!container || !content) {
            onZoomEnd?.();
            return;
        }

        const { mode, focalPoint } = pending;

        // FIT_TO_SCREEN: Simply scroll to origin
        if (mode === ZoomMode.FIT_TO_SCREEN) {
            container.scrollTo({ left: 0, top: 0, behavior: 'instant' });
            onZoomEnd?.();
            return;
        }

        // No focal point captured (shouldn't happen, but fallback)
        if (!focalPoint) {
            onZoomEnd?.();
            return;
        }

        // Calculate new scroll position to restore focal point
        const { ratioX, ratioY, offsetX, offsetY } = focalPoint;

        // New content dimensions (after React re-rendered with new scale)
        const newContentWidth = content.scrollWidth;
        const newContentHeight = content.scrollHeight;

        // Position in new content coordinates
        const newContentX = ratioX * newContentWidth;
        const newContentY = ratioY * newContentHeight;

        // New scroll position to place focal point at same screen offset
        const newScrollLeft = newContentX - offsetX;
        const newScrollTop = newContentY - offsetY;

        // Apply scroll immediately (before paint)
        container.scrollTo({
            left: Math.max(0, newScrollLeft),
            top: Math.max(0, newScrollTop),
            behavior: 'instant'
        });

        onZoomEnd?.();

    }, [scale, containerRef, contentRef, onZoomEnd]);

    // ═══════════════════════════════════════════════════════════════════════
    // UTILITY: Clamp Scale
    // ═══════════════════════════════════════════════════════════════════════

    const clampScale = useCallback((s: number): number => {
        return Math.min(Math.max(config.minScale, s), config.maxScale);
    }, [config.minScale, config.maxScale]);

    // ═══════════════════════════════════════════════════════════════════════
    // HANDLER: Wheel Zoom (Ctrl/Cmd + Wheel)
    // ═══════════════════════════════════════════════════════════════════════

    const handleWheelZoom = useCallback((e: WheelEvent) => {
        e.preventDefault();

        currentMode.current = ZoomMode.CENTER;
        onZoomStart?.();

        // Adaptive sensitivity based on scroll speed
        const now = performance.now();
        const timeDelta = now - lastWheelTime.current;
        lastWheelTime.current = now;

        const speedFactor = timeDelta < 50 ? 1.5 : 1.0;
        const delta = -e.deltaY * config.wheelSensitivity * speedFactor;

        const oldScale = scale;
        const newScale = clampScale(scale + delta);

        if (Math.abs(newScale - oldScale) < 0.001) {
            onZoomEnd?.();
            return;
        }

        // Cancel any pending animation frame
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }

        // ✅ CAPTURE: Freeze focal point before state update
        const focalPoint = captureFocalPoint(); // Center of viewport

        // ✅ STORE: Save pending zoom for useLayoutEffect
        pendingZoomRef.current = {
            mode: ZoomMode.CENTER,
            oldScale,
            newScale,
            focalPoint
        };

        // ✅ UPDATE: Trigger React re-render
        setScale(newScale);

        // Note: onZoomEnd will be called in useLayoutEffect after scroll restore

    }, [scale, setScale, clampScale, captureFocalPoint, config.wheelSensitivity, onZoomStart, onZoomEnd]);

    // ═══════════════════════════════════════════════════════════════════════
    // HANDLER: Toolbar Zoom (+/- Buttons)
    // ═══════════════════════════════════════════════════════════════════════

    const handleToolbarZoom = useCallback((newScaleTarget: number, animate: boolean = false) => {
        currentMode.current = ZoomMode.CENTER;

        const oldScale = scale;
        const newScale = clampScale(newScaleTarget);

        if (Math.abs(newScale - oldScale) < 0.001) return;

        if (animate) {
            // Animated zoom: multiple setScale calls with intermediate values
            onZoomStart?.();

            const startTime = performance.now();
            const duration = config.animationDuration;

            const animateStep = (currentTime: number) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);

                // Ease-out cubic
                const easeOut = 1 - Math.pow(1 - progress, 3);
                const currentScale = oldScale + (newScale - oldScale) * easeOut;

                // Capture and store for each frame
                const focalPoint = captureFocalPoint();
                pendingZoomRef.current = {
                    mode: ZoomMode.CENTER,
                    oldScale: scale,
                    newScale: currentScale,
                    focalPoint
                };

                setScale(currentScale);

                if (progress < 1) {
                    animationFrameRef.current = requestAnimationFrame(animateStep);
                }
                // onZoomEnd called by useLayoutEffect on final frame
            };

            animationFrameRef.current = requestAnimationFrame(animateStep);

        } else {
            // Instant zoom
            onZoomStart?.();

            const focalPoint = captureFocalPoint();
            pendingZoomRef.current = {
                mode: ZoomMode.CENTER,
                oldScale,
                newScale,
                focalPoint
            };

            setScale(newScale);
        }

    }, [scale, setScale, clampScale, captureFocalPoint, config.animationDuration, onZoomStart]);

    // ═══════════════════════════════════════════════════════════════════════
    // HANDLER: Pinch Zoom (Touch)
    // ═══════════════════════════════════════════════════════════════════════

    const handlePinchZoom = useCallback((newScaleRaw: number, midpoint: { x: number; y: number }) => {
        currentMode.current = ZoomMode.FOCAL_POINT;

        const oldScale = scale;
        const newScale = clampScale(newScaleRaw);

        if (Math.abs(newScale - oldScale) < 0.001) return;

        // ✅ CAPTURE: Focal point is the finger midpoint
        const focalPoint = captureFocalPoint(midpoint.x, midpoint.y);

        // ✅ STORE
        pendingZoomRef.current = {
            mode: ZoomMode.FOCAL_POINT,
            oldScale,
            newScale,
            focalPoint
        };

        // ✅ UPDATE
        setScale(newScale);

    }, [scale, setScale, clampScale, captureFocalPoint]);

    // ═══════════════════════════════════════════════════════════════════════
    // HANDLER: Fit to Screen
    // ═══════════════════════════════════════════════════════════════════════

    const handleFitToScreen = useCallback((targetScale: number) => {
        currentMode.current = ZoomMode.FIT_TO_SCREEN;
        onZoomStart?.();

        const oldScale = scale;
        const newScale = clampScale(targetScale);

        // FIT_TO_SCREEN doesn't need focal point - always scrolls to origin
        pendingZoomRef.current = {
            mode: ZoomMode.FIT_TO_SCREEN,
            oldScale,
            newScale,
            focalPoint: null
        };

        setScale(newScale);

    }, [scale, setScale, clampScale, onZoomStart]);

    // ═══════════════════════════════════════════════════════════════════════
    // RETURN
    // ═══════════════════════════════════════════════════════════════════════

    return {
        handleWheelZoom,
        handleToolbarZoom,
        handlePinchZoom,
        handleFitToScreen,
        clampScale,
        currentMode
    };
}

export default useZoom;
