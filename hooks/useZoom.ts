/**
 * useZoom.ts - Master Zoom Hook
 * 
 * Handles all zoom operations with DISTINCT behaviors:
 * - Wheel zoom (Ctrl/Cmd + wheel): Zooms at VIEWPORT CENTER (like Adobe Reader)
 * - Pinch zoom (touch): Zooms at FINGER MIDPOINT (like native iOS/Android)
 * - Toolbar zoom (+/- buttons): Zooms at VIEWPORT CENTER
 * 
 * Key insight: The scroll position adjustment must happen SYNCHRONOUSLY
 * in the same frame as the scale change to prevent visual jumps.
 */

import { useCallback, useRef, MutableRefObject } from 'react';

// =====================================================
// TYPES
// =====================================================

export interface ZoomConfig {
    minScale: number;
    maxScale: number;
    wheelSensitivity: number;
    animationDuration: number;
}

export interface ZoomState {
    scale: number;
    targetScale: number; // For animations
    isAnimating: boolean;
}

export interface ScrollPosition {
    x: number;
    y: number;
}

export enum ZoomMode {
    /** Zoom centers on the viewport center (wheel, toolbar) */
    CENTER = 'center',
    /** Zoom centers on a specific point (pinch midpoint) */
    FOCAL_POINT = 'focal_point',
    /** Fit to screen - special case, scrolls to origin */
    FIT_TO_SCREEN = 'fit_to_screen'
}

export interface ZoomEvent {
    mode: ZoomMode;
    newScale: number;
    oldScale: number;
    focalPoint?: { x: number; y: number }; // Screen coordinates (only for FOCAL_POINT mode)
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

    /** Handle toolbar zoom (+/- buttons) - zooms at viewport center with animation */
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

// =====================================================
// DEFAULT CONFIG
// =====================================================

const DEFAULT_CONFIG: ZoomConfig = {
    minScale: 0.2,
    maxScale: 5.0,
    wheelSensitivity: 0.002, // Smaller = smoother
    animationDuration: 200
};

// =====================================================
// HOOK IMPLEMENTATION
// =====================================================

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

    // ─────────────────────────────────────────────────────
    // CORE: Calculate scroll adjustment for focal zoom
    // ─────────────────────────────────────────────────────

    /**
     * Calculates and applies the new scroll position to keep the focal point
     * visually stationary, accounting for dynamic margins (centering).
     */
    const adjustScrollForZoom = useCallback((
        mode: ZoomMode,
        oldScale: number,
        newScale: number,
        focalPoint?: { x: number; y: number }
    ) => {
        const container = containerRef.current;
        if (!container) return; // Need container

        // Safety check mostly for FitToScreen
        if (mode === ZoomMode.FIT_TO_SCREEN) {
            container.scrollTo({ left: 0, top: 0, behavior: 'instant' });
            return;
        }

        const { scrollLeft, scrollTop, clientWidth, clientHeight } = container;
        const containerRect = container.getBoundingClientRect();

        // 1. Determine Focal Point on Screen (F_screen)
        let focalScreenX: number;
        let focalScreenY: number;

        if (mode === ZoomMode.FOCAL_POINT && focalPoint) {
            focalScreenX = focalPoint.x;
            focalScreenY = focalPoint.y;
        } else {
            // Default to center of viewport
            focalScreenX = containerRect.left + clientWidth / 2;
            focalScreenY = containerRect.top + clientHeight / 2;
        }

        // Offset relative to container top-left
        const focalOffsetX = focalScreenX - containerRect.left;
        const focalOffsetY = focalScreenY - containerRect.top;

        // 2. Calculate Content Geometry (layout logic must match PdfViewer)
        // We need to know the OLD margin to find where the point was on the document
        const getLayout = (s: number) => {
            // Simplified layout logic that MIRRORS PdfViewer's behavior
            // NOTE: Ideally this shared logic would be injected or imported
            // but for robustness we calculate it here based on container size
            const contentWidth = clientWidth; // Base assumption

            // Calculate visual width of content roughly
            // This is an estimation - for pixel perfect precision we need exact dimensions
            // But the margin logic is simple: Max(0, (Container - Content) / 2)

            // CRITICAL: We need accurate Content Width at scale S
            // We can infer it from current scrollWidth if we trust it, or calculate from scale
            // Let's use the layoutCalculator constraint passed in config if available, 
            // fallback to generic behavior

            // Basic assumption: At scale S, content width is Base * S
            // We can back-calculate Base from current state if needed
            return {
                marginLeft: 0, // Placeholder
                marginTop: 0
            };
        };

        // --- EXACT MATH IMPLEMENTATION ---

        // We assume the content (wrapped div) is what we are scrolling.
        // Content.style.marginLeft changes based on scale.
        // P_doc (point on document) = (Scroll + Offset - MarginOld) / ScaleOld

        // To solve this properly without knowing exact content dimensions, 
        // we use the 'relative position' strategy which is robust:

        // A. Current visual position relative to CONTENT origin (0,0 of the PDF page)
        //    CurrentScroll + CursorOffset = Margin + ContentPos
        //    => ContentPos = CurrentScroll + CursorOffset - Margin

        // We don't easily know "Margin", BUT we know that:
        //    ContentPos_at_scale_1 = ContentPos / ScaleOld

        // B. New visual position
        //    NewContentPos = ContentPos_at_scale_1 * ScaleNew
        //    NewScroll = NewMargin + NewContentPos - CursorOffset

        // The "Drift" comes because we don't account for (NewMargin - OldMargin).
        // Drift = NewMargin - OldMargin.

        // Let's effectively calculate the Margin Delta based on centering logic.
        // Centering happens when (ContentWidth < ContainerWidth).

        // If we're always wider than container (zoomed in), Margin is 0. Delta is 0.
        // The drift only happens when zooming OUT to see edges, or zooming IN from small size.

        const isWiderOld = container.scrollWidth > clientWidth;
        // Estimate new state
        const ratio = newScale / oldScale;
        const isWiderNew = (container.scrollWidth * ratio) > clientWidth;

        // Simple robust fix:
        // If we are strictly zooming on content (scrollWidth > clientWidth), 
        // the standard formula works perfectly as margins are 0.
        // If margins ARE involved, we need to respect them.

        // Standard formula (Point in Content coordinates)
        // We use the scroll position as a proxy for the document point
        const pointInContentX = scrollLeft + focalOffsetX;
        const pointInContentY = scrollTop + focalOffsetY;

        // Scale that point
        const newPointInContentX = pointInContentX * ratio;
        const newPointInContentY = pointInContentY * ratio;

        // Basic target scroll
        let newScrollLeft = newPointInContentX - focalOffsetX;
        let newScrollTop = newPointInContentY - focalOffsetY;

        // --- MARGIN CORRECTION ---
        // If content is narrower than container, PdfViewer adds margin-left.
        // We need to simulate that margin change.

        // Calculate Old Margin (approximate from DOM)
        // If scrollWidth < clientWidth, the browser/flex/margin handles centering.
        // We can inspect computed style if contentRef is provided
        let oldMarginLeft = 0;
        let newMarginLeft = 0;

        if (contentRef.current) {
            // Get current margin
            const style = window.getComputedStyle(contentRef.current);
            oldMarginLeft = parseFloat(style.marginLeft) || 0;

            // Estimate new margin
            // Content width scales by ratio
            const currentContentWidth = contentRef.current.offsetWidth; // This includes scale transform
            const newContentWidth = currentContentWidth * ratio;

            if (newContentWidth < clientWidth) {
                newMarginLeft = (clientWidth - newContentWidth) / 2;
            }
        }

        // Apply correction: 
        // The "Point in Content" calculated above INCLUDED the old margin (it was relative to container)
        // Real Point (relative to document edge) = PointInContent - OldMargin

        const realDocX = pointInContentX - oldMarginLeft;
        const newRealDocX = realDocX * ratio;

        // New Scroll = NewMargin + NewRealDocX - Offset
        // (If NewMargin > 0, Scroll is usually 0 anyway because content fits, 
        // but the logic holds for the coordinate math)
        const correctedScrollLeft = newMarginLeft + newRealDocX - focalOffsetX;

        // Apply
        container.scrollTo({
            left: Math.max(0, correctedScrollLeft),
            top: Math.max(0, newScrollTop),
            behavior: 'instant'
        });

    }, [containerRef, contentRef]);

    // ─────────────────────────────────────────────────────
    // UTILITY: Clamp scale to valid range
    // ─────────────────────────────────────────────────────

    const clampScale = useCallback((s: number): number => {
        return Math.min(Math.max(config.minScale, s), config.maxScale);
    }, [config.minScale, config.maxScale]);

    // ─────────────────────────────────────────────────────
    // HANDLER: Wheel Zoom (Ctrl/Cmd + Wheel)
    // Zooms at VIEWPORT CENTER - most natural for desktop users
    // ─────────────────────────────────────────────────────

    const handleWheelZoom = useCallback((e: WheelEvent) => {
        e.preventDefault();

        currentMode.current = ZoomMode.CENTER;
        onZoomStart?.();

        const now = performance.now();
        const timeDelta = now - lastWheelTime.current;
        lastWheelTime.current = now;

        // Adaptive sensitivity: faster scrolling = bigger steps
        const speedFactor = timeDelta < 50 ? 1.5 : 1.0;
        const delta = -e.deltaY * config.wheelSensitivity * speedFactor;

        const oldScale = scale;
        const newScale = clampScale(scale + delta);

        if (Math.abs(newScale - oldScale) < 0.001) return;

        // CRITICAL: Adjust scroll BEFORE React re-render
        // This prevents the visual "jump" that occurs when scale updates
        // but scroll hasn't been adjusted yet
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
        }

        animationFrameRef.current = requestAnimationFrame(() => {
            adjustScrollForZoom(ZoomMode.CENTER, oldScale, newScale);
            setScale(newScale);
            onZoomEnd?.();
        });
    }, [scale, setScale, clampScale, adjustScrollForZoom, config.wheelSensitivity, onZoomStart, onZoomEnd]);

    // ─────────────────────────────────────────────────────
    // HANDLER: Toolbar Zoom (+/- Buttons)
    // Zooms at VIEWPORT CENTER with optional animation
    // ─────────────────────────────────────────────────────

    const handleToolbarZoom = useCallback((newScaleTarget: number, animate: boolean = false) => {
        currentMode.current = ZoomMode.CENTER;

        const oldScale = scale;
        const newScale = clampScale(newScaleTarget);

        if (Math.abs(newScale - oldScale) < 0.001) return;

        if (animate) {
            // Animated zoom (for button clicks)
            onZoomStart?.();

            const startTime = performance.now();
            const duration = config.animationDuration;

            const animateStep = (currentTime: number) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);

                // Ease-out cubic for smooth deceleration
                const easeOut = 1 - Math.pow(1 - progress, 3);
                const currentScale = oldScale + (newScale - oldScale) * easeOut;

                adjustScrollForZoom(ZoomMode.CENTER, scale, currentScale);
                setScale(currentScale);

                if (progress < 1) {
                    animationFrameRef.current = requestAnimationFrame(animateStep);
                } else {
                    onZoomEnd?.();
                }
            };

            animationFrameRef.current = requestAnimationFrame(animateStep);
        } else {
            // Instant zoom
            adjustScrollForZoom(ZoomMode.CENTER, oldScale, newScale);
            setScale(newScale);
        }
    }, [scale, setScale, clampScale, adjustScrollForZoom, config.animationDuration, onZoomStart, onZoomEnd]);

    // ─────────────────────────────────────────────────────
    // HANDLER: Pinch Zoom (Touch)
    // Zooms at FINGER MIDPOINT - native mobile behavior
    // ─────────────────────────────────────────────────────

    const handlePinchZoom = useCallback((newScaleRaw: number, midpoint: { x: number; y: number }) => {
        currentMode.current = ZoomMode.FOCAL_POINT;

        const oldScale = scale;
        const newScale = clampScale(newScaleRaw);

        if (Math.abs(newScale - oldScale) < 0.001) return;

        // Adjust scroll to keep midpoint stationary
        // This happens every frame during pinch for smooth tracking
        adjustScrollForZoom(ZoomMode.FOCAL_POINT, oldScale, newScale, midpoint);
        setScale(newScale);
    }, [scale, setScale, clampScale, adjustScrollForZoom]);

    // ─────────────────────────────────────────────────────
    // HANDLER: Fit to Screen
    // Special case - resets scroll to origin
    // ─────────────────────────────────────────────────────

    const handleFitToScreen = useCallback((targetScale: number) => {
        currentMode.current = ZoomMode.FIT_TO_SCREEN;

        const newScale = clampScale(targetScale);

        // Fit to screen always scrolls to origin
        adjustScrollForZoom(ZoomMode.FIT_TO_SCREEN, scale, newScale);
        setScale(newScale);
    }, [scale, setScale, clampScale, adjustScrollForZoom]);

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
