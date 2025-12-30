import { useRef, useCallback } from 'react';

export interface TransformState {
    x: number;
    y: number;
    scale: number;
}

interface UseViewportTransformOptions {
    minScale?: number;
    maxScale?: number;
    onUpdate?: (state: TransformState) => void;
}

/**
 * High-Performance Viewport Transform Hook
 * 
 * Manages the affine transformation matrix for a zoomable viewport.
 * Bypasses React state for frame-perfect 60fps updates via direct DOM manipulation.
 */
export function useViewportTransform(options: UseViewportTransformOptions = {}) {
    const { minScale = 0.1, maxScale = 10, onUpdate } = options;

    // Mutable state for performance (avoid React render cycle during gesture)
    const transform = useRef<TransformState>({ x: 0, y: 0, scale: 1 });
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const rafId = useRef<number | null>(null);

    /**
     * Apply the current transform to the DOM element
     * utilizing hardware acceleration.
     */
    const applyTransform = useCallback(() => {
        if (!viewportRef.current) return;

        // Using matrix3d or translate3d/scale for GPU composition
        // transform-origin should be set to '0 0' in CSS for this logic to work
        const { x, y, scale } = transform.current;

        // Using translate3d forces GPU layer promotion
        viewportRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;

        if (onUpdate) {
            onUpdate(transform.current);
        }

        rafId.current = null;
    }, [onUpdate]);

    /**
     * Schedule a visual update on the next animation frame
     */
    const scheduleUpdate = useCallback(() => {
        if (rafId.current) return;
        rafId.current = requestAnimationFrame(applyTransform);
    }, [applyTransform]);

    /**
     * Update transform preserving a pivot point (Cursor-centered zoom).
     * 
     * Math: P_screen = P_world * Scale + Translate
     * To keep P_screen constant:
     * NewTranslate = P_screen - (P_world * NewScale)
     * where P_world = (P_screen - OldTranslate) / OldScale
     */
    const zoomToPoint = useCallback((
        pivotX: number, // Screen Coordinate relative to container
        pivotY: number, // Screen Coordinate relative to container
        zoomFactor: number // Multiplier (e.g., 1.1 for +10%)
    ) => {
        const { x: tx, y: ty, scale: s } = transform.current;

        // 1. Calculate future scale with clamping
        const newScale = Math.min(Math.max(s * zoomFactor, minScale), maxScale);

        // Factor by which we actually changed (in case of clamping)
        const effectiveFactor = newScale / s;
        if (effectiveFactor === 1) return;

        // 2. Calculate Pivot in World Space (The constant point on the infinite grid)
        const worldX = (pivotX - tx) / s;
        const worldY = (pivotY - ty) / s;

        // 3. Calculate New Translation to keep Pivot stationary
        // pivotX = worldX * newScale + newTx
        const newTx = pivotX - (worldX * newScale);
        const newTy = pivotY - (worldY * newScale);

        // 4. Update interactions
        transform.current = {
            x: newTx,
            y: newTy,
            scale: newScale
        };

        scheduleUpdate();
    }, [minScale, maxScale, scheduleUpdate]);

    /**
     * Pan processing
     */
    const pan = useCallback((deltaX: number, deltaY: number) => {
        transform.current.x += deltaX;
        transform.current.y += deltaY;
        scheduleUpdate();
    }, [scheduleUpdate]);

    /**
     * Direct setter for specific needs (reset, fit to screen)
     */
    const setTransform = useCallback((x: number, y: number, scale: number) => {
        transform.current = { x, y, scale };
        scheduleUpdate();
    }, [scheduleUpdate]);

    return {
        viewportRef,
        transformRef: transform,
        zoomToPoint,
        pan,
        setTransform
    };
}
