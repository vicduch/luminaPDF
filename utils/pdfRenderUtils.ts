/**
 * pdfRenderUtils.ts - PDF Rendering Utilities
 * 
 * Contains utility functions for optimized PDF rendering:
 * - Render scale calculation (discrete steps to minimize re-renders)
 * - CSS scale calculation (smooth visual zoom between steps)
 * - Theme-based canvas filters
 * - Performance optimizations
 */

// =====================================================
// TYPES
// =====================================================

export interface RenderScaleConfig {
    /** Discrete scale steps for canvas rendering */
    steps: number[];
    /** Whether to prefer higher quality (render at higher step) */
    preferHighQuality: boolean;
}

export interface PageDimensions {
    width: number;
    height: number;
}

// =====================================================
// CONSTANTS
// =====================================================

/**
 * Discrete render scale steps.
 * 
 * The canvas is rendered at these specific scales to minimize expensive re-renders.
 * Visual zoom between steps is handled via CSS transform (cheap).
 * 
 * Steps are chosen to provide good coverage across common zoom ranges:
 * - 0.5: For very zoomed out view (overview)
 * - 0.75: Comfortable reading at reduced size
 * - 1.0: Normal reading (100%)
 * - 1.25, 1.5: Slight zoom for better readability
 * - 2.0, 2.5, 3.0: High zoom for details
 * - 4.0: Maximum quality for very high zoom
 */
export const DEFAULT_RENDER_STEPS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0, 4.0];

/**
 * Maximum device pixel ratio to use.
 * Higher values increase quality but use more memory and GPU.
 */
export const MAX_DEVICE_PIXEL_RATIO = 2;

// =====================================================
// RENDER SCALE CALCULATION
// =====================================================

/**
 * Get the appropriate render scale (canvas resolution) for a given target scale.
 * 
 * Strategy: Render at the NEXT HIGHER step to ensure we never upscale
 * (which would cause blurriness). The difference is handled by CSS transform.
 * 
 * Example:
 * - Target scale 1.1 → Render at 1.25, CSS scale = 1.1/1.25 = 0.88
 * - Target scale 1.4 → Render at 1.5, CSS scale = 1.4/1.5 = 0.93
 * 
 * @param targetScale The visual scale the user wants
 * @param steps Discrete render steps (optional, defaults to DEFAULT_RENDER_STEPS)
 * @returns The render scale to use for canvas
 */
export function getRenderScale(
    targetScale: number,
    steps: number[] = DEFAULT_RENDER_STEPS
): number {
    // Find the smallest step that is >= targetScale
    const higherStep = steps.find(step => step >= targetScale);

    // If target is above all steps, use the highest
    return higherStep ?? steps[steps.length - 1];
}

/**
 * Calculate the CSS scale to apply on top of the rendered canvas.
 * 
 * This creates the smooth zoom effect between discrete render steps.
 * 
 * @param visualScale The target visual scale
 * @param renderScale The actual canvas render scale
 * @returns CSS transform scale value
 */
export function getCssScale(visualScale: number, renderScale: number): number {
    return visualScale / renderScale;
}

/**
 * Determine if a re-render is needed based on scale change.
 * 
 * We only re-render when crossing a render step boundary.
 * This dramatically reduces the number of expensive canvas operations.
 * 
 * @param oldScale Previous visual scale
 * @param newScale New visual scale
 * @param steps Render steps
 * @returns Whether a canvas re-render is needed
 */
export function needsRerender(
    oldScale: number,
    newScale: number,
    steps: number[] = DEFAULT_RENDER_STEPS
): boolean {
    const oldRenderScale = getRenderScale(oldScale, steps);
    const newRenderScale = getRenderScale(newScale, steps);
    return oldRenderScale !== newRenderScale;
}

// =====================================================
// THEME-BASED CANVAS FILTERS
// =====================================================

export type AppTheme =
    | 'light'
    | 'sepia'
    | 'dark'
    | 'midnight'
    | 'blue_night'
    | 'forest'
    | 'solarized';

/**
 * Get the CSS filter to apply to the PDF canvas based on theme.
 * 
 * These filters transform the default white background + black text
 * to match the selected theme's color scheme.
 */
export function getCanvasFilter(theme: AppTheme): string {
    switch (theme) {
        case 'dark':
            return 'invert(0.9) hue-rotate(180deg) contrast(0.8)';
        case 'midnight':
            return 'invert(1) hue-rotate(180deg)';
        case 'blue_night':
            return 'invert(0.9) hue-rotate(180deg) contrast(0.85) sepia(0.2)';
        case 'forest':
            return 'invert(0.85) hue-rotate(120deg) contrast(0.9) sepia(0.2)';
        case 'sepia':
            return 'sepia(0.3) contrast(0.95)';
        case 'solarized':
            return 'sepia(0.1) contrast(0.95)';
        case 'light':
        default:
            return 'none';
    }
}

// =====================================================
// DIMENSION CALCULATIONS
// =====================================================

/**
 * Calculate the optimal page width for the container.
 * 
 * @param containerWidth Available container width
 * @param viewMode 'single' or 'double'
 * @param scrollMode 'paged' or 'continuous'
 * @param renderScale Current render scale
 * @param gap Gap between pages in double mode
 */
export function calculatePageWidth(
    containerWidth: number,
    viewMode: 'single' | 'double',
    scrollMode: 'paged' | 'continuous',
    renderScale: number,
    gap: number = 16
): number {
    if (!containerWidth) return 300; // Minimum fallback

    let baseWidth = containerWidth;

    // In double page mode (paged), each page takes half the width minus gap
    if (viewMode === 'double' && scrollMode === 'paged') {
        baseWidth = (containerWidth - gap) / 2;
    }

    // Apply render scale
    return Math.max(100, baseWidth * renderScale);
}

/**
 * Calculate the exact dimensions of the content for a given scale.
 */
export function calculateContentDimensions(
    containerWidth: number,
    viewMode: 'single' | 'double',
    scrollMode: 'paged' | 'continuous',
    scale: number,
    pageRatio: number = 1.414,
    gap: number = 16
): { width: number; height: number } {
    if (!containerWidth) return { width: 0, height: 0 };

    // 1. Calculate base width (width of a single page/row at scale 1)
    let baseWidth = containerWidth;
    if (viewMode === 'double' && scrollMode === 'paged') {
        baseWidth = (containerWidth - gap) / 2;
    }

    // 2. Calculate displayed width (at current scale)
    // Note: logic must match PdfViewer's render logic exactly
    // We use the same formula: Math.max(100, baseWidth * renderScale) logic 
    // but here we deal with 'visual' scale directly.

    // The logic in PdfViewer uses: pageWidth = baseWidth * renderStep;
    // Then CSS transforms it by (scale / renderStep).
    // Effectively: visualPageWidth = baseWidth * scale.

    const visualPageWidth = Math.max(100 * (scale / getRenderScale(scale)), baseWidth * scale);

    // 3. Calculate total content width/height
    let totalWidth = visualPageWidth;

    if (viewMode === 'double' && scrollMode === 'paged') {
        // Gap depends on CSS scale to be visually constant (16px)
        // So visual width contribution is just `gap` (16)
        // Old logic: gap * cssScale -> incorrect
        // New logic: gap
        totalWidth = visualPageWidth * 2 + gap;
    }

    const visualPageHeight = visualPageWidth * pageRatio;

    return { width: totalWidth, height: visualPageHeight };
}

/**
 * Calculate expected margins for a given scale to center the content.
 */
export function calculateExactMargins(
    containerWidth: number,
    containerHeight: number,
    contentWidth: number,
    contentHeight: number,
    scrollScaleRatio: number = 1.0 // CSS Scale factor for the container if any
): { marginLeft: number; marginTop: number } {
    // Margins are applied to the transform-wrapper
    const marginLeft = Math.max(0, (containerWidth - contentWidth) / 2);
    const marginTop = Math.max(0, (containerHeight - contentHeight) / 2);

    return { marginLeft, marginTop };
}


/**
 * Calculate centering margins when content is smaller than container.
 */
export function calculateCenteringMargins(
    containerWidth: number,
    containerHeight: number,
    contentWidth: number,
    contentHeight: number
): { marginLeft: number; marginTop: number } {
    return {
        marginLeft: Math.max(0, (containerWidth - contentWidth) / 2),
        marginTop: Math.max(0, (containerHeight - contentHeight) / 2)
    };
}

// =====================================================
// FIT TO SCREEN CALCULATIONS
// =====================================================

export interface FitToScreenResult {
    scale: number;
    mode: 'width' | 'height' | 'both';
}

/**
 * Calculate the optimal scale to fit the document to the screen.
 * 
 * @param containerWidth Available container width
 * @param containerHeight Available container height
 * @param pageWidth Page width at scale 1
 * @param pageHeight Page height at scale 1
 * @param viewMode 'single' or 'double'
 * @param scrollMode 'paged' or 'continuous'
 * @param maxScale Maximum allowed scale
 */
export function calculateFitToScreenScale(
    containerWidth: number,
    containerHeight: number,
    pageWidth: number,
    pageHeight: number,
    viewMode: 'single' | 'double',
    scrollMode: 'paged' | 'continuous',
    maxScale: number = 2.0
): FitToScreenResult {
    // Reserve space for scrollbars
    const SCROLLBAR_BUFFER = 20;
    const availWidth = containerWidth - SCROLLBAR_BUFFER;
    const availHeight = containerHeight - SCROLLBAR_BUFFER;

    if (availWidth <= 0 || availHeight <= 0) {
        return { scale: 1.0, mode: 'both' };
    }

    // Calculate effective page width based on mode
    let effectivePageWidth = pageWidth;
    if (viewMode === 'double' && scrollMode === 'paged') {
        // In double mode, we're fitting TWO pages
        effectivePageWidth = pageWidth * 2 + 16; // 16px gap
    }

    // Calculate scale to fit width
    const scaleToFitWidth = availWidth / effectivePageWidth;

    // Calculate scale to fit height
    const scaleToFitHeight = availHeight / pageHeight;

    // Use the smaller scale to ensure both dimensions fit
    let finalScale = Math.min(scaleToFitWidth, scaleToFitHeight);

    // Determine which dimension is the constraint
    let mode: 'width' | 'height' | 'both' = 'both';
    if (scaleToFitWidth < scaleToFitHeight) {
        mode = 'width';
    } else if (scaleToFitHeight < scaleToFitWidth) {
        mode = 'height';
    }

    // Clamp to max scale
    finalScale = Math.min(finalScale, maxScale);

    return { scale: finalScale, mode };
}

// =====================================================
// PERFORMANCE UTILITIES
// =====================================================

/**
 * Debounce function for expensive operations.
 */
export function debounce<T extends (...args: any[]) => void>(
    fn: T,
    delay: number
): (...args: Parameters<T>) => void {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    return (...args: Parameters<T>) => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => fn(...args), delay);
    };
}

/**
 * Throttle function for scroll/zoom handlers.
 */
export function throttle<T extends (...args: any[]) => void>(
    fn: T,
    limit: number
): (...args: Parameters<T>) => void {
    let inThrottle = false;
    let lastArgs: Parameters<T> | null = null;

    return (...args: Parameters<T>) => {
        if (!inThrottle) {
            fn(...args);
            inThrottle = true;
            setTimeout(() => {
                inThrottle = false;
                if (lastArgs) {
                    fn(...lastArgs);
                    lastArgs = null;
                }
            }, limit);
        } else {
            lastArgs = args;
        }
    };
}

/**
 * Request animation frame with automatic cleanup.
 */
export function scheduleFrame(callback: () => void): () => void {
    const frameId = requestAnimationFrame(callback);
    return () => cancelAnimationFrame(frameId);
}

/**
 * Get optimal device pixel ratio (capped for performance).
 */
export function getOptimalPixelRatio(): number {
    return Math.min(MAX_DEVICE_PIXEL_RATIO, window.devicePixelRatio || 1);
}
