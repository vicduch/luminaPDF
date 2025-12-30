/**
 * useTouchGestures.ts - Professional Touch Gesture Handler
 * 
 * Implements production-quality touch gestures:
 * - Pinch-to-zoom with precise focal point tracking
 * - Pan/scroll with momentum (inertia)
 * - Double-tap to zoom (2x / reset)
 * - Rubber band effect at zoom limits
 * 
 * Design principles:
 * - All calculations happen in requestAnimationFrame for 60fps
 * - Focal point (midpoint between fingers) remains stationary during pinch
 * - Smooth interpolation prevents saccades
 */

import React, { useRef, useCallback, MutableRefObject } from 'react';

// =====================================================
// TYPES
// =====================================================

export interface TouchGestureConfig {
    /** Minimum scale allowed */
    minScale: number;
    /** Maximum scale allowed */
    maxScale: number;
    /** Scale for double-tap zoom */
    doubleTapScale: number;
    /** Threshold to detect swipe vs tap (pixels) */
    swipeThreshold: number;
    /** Time window for double-tap detection (ms) */
    doubleTapWindow: number;
    /** Enable rubber band effect at limits */
    enableRubberBand: boolean;
    /** Rubber band resistance (higher = stiffer) */
    rubberBandResistance: number;
    /** Enable momentum scrolling */
    enableMomentum: boolean;
    /** Momentum friction (0-1, higher = more friction) */
    momentumFriction: number;
}

export interface TouchState {
    /** Is a pinch gesture currently active? */
    isPinching: boolean;
    /** Is a pan gesture currently active? */
    isPanning: boolean;
    /** Current pinch midpoint (screen coords) */
    pinchMidpoint: { x: number; y: number } | null;
    /** Initial distance between fingers at pinch start */
    initialPinchDistance: number | null;
    /** Scale value when pinch started */
    initialPinchScale: number;
}

export interface UseTouchGesturesOptions {
    containerRef: MutableRefObject<HTMLElement | null>;
    scale: number;
    onPinchZoom: (newScale: number, midpoint: { x: number; y: number }) => void;
    onPinchStart?: () => void;
    onPinchEnd?: (finalScale: number) => void;
    onDoubleTap?: (point: { x: number; y: number }, currentScale: number) => void;
    onSwipe?: (direction: 'left' | 'right') => void;
    config?: Partial<TouchGestureConfig>;
}

export interface UseTouchGesturesReturn {
    /** Attach to element's onTouchStart */
    onTouchStart: (e: React.TouchEvent) => void;
    /** Attach to element's onTouchMove */
    onTouchMove: (e: React.TouchEvent) => void;
    /** Attach to element's onTouchEnd */
    onTouchEnd: (e: React.TouchEvent) => void;
    /** Current touch state for debugging */
    touchState: MutableRefObject<TouchState>;
}

// =====================================================
// DEFAULT CONFIG
// =====================================================

const DEFAULT_CONFIG: TouchGestureConfig = {
    minScale: 0.2,
    maxScale: 5.0,
    doubleTapScale: 2.0,
    swipeThreshold: 50,
    doubleTapWindow: 300,
    enableRubberBand: true,
    rubberBandResistance: 0.3,
    enableMomentum: true,
    momentumFriction: 0.92
};

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

/** Calculate distance between two touch points */
function getTouchDistance(touches: React.TouchList): number {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
}

/** Calculate midpoint between two touch points */
function getTouchMidpoint(touches: React.TouchList): { x: number; y: number } {
    if (touches.length < 2) {
        return { x: touches[0]?.clientX ?? 0, y: touches[0]?.clientY ?? 0 };
    }
    return {
        x: (touches[0].clientX + touches[1].clientX) / 2,
        y: (touches[0].clientY + touches[1].clientY) / 2
    };
}

/** Apply rubber band effect when exceeding limits */
function applyRubberBand(
    value: number,
    min: number,
    max: number,
    resistance: number
): number {
    if (value < min) {
        const overflow = min - value;
        return min - overflow * resistance;
    }
    if (value > max) {
        const overflow = value - max;
        return max + overflow * resistance;
    }
    return value;
}

// =====================================================
// HOOK IMPLEMENTATION
// =====================================================

export function useTouchGestures({
    containerRef,
    scale,
    onPinchZoom,
    onPinchStart,
    onPinchEnd,
    onDoubleTap,
    onSwipe,
    config: userConfig
}: UseTouchGesturesOptions): UseTouchGesturesReturn {
    const config = { ...DEFAULT_CONFIG, ...userConfig };

    // Touch state
    const touchState = useRef<TouchState>({
        isPinching: false,
        isPanning: false,
        pinchMidpoint: null,
        initialPinchDistance: null,
        initialPinchScale: 1
    });

    // Tap detection
    const lastTapTime = useRef<number>(0);
    const lastTapPosition = useRef<{ x: number; y: number } | null>(null);

    // Swipe detection
    const swipeStartPosition = useRef<{ x: number; y: number } | null>(null);

    // Animation frame reference
    const rafRef = useRef<number | null>(null);

    // Momentum state
    const velocityRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const lastMoveTime = useRef<number>(0);
    const lastMovePosition = useRef<{ x: number; y: number } | null>(null);

    // ─────────────────────────────────────────────────────
    // TOUCH START
    // ─────────────────────────────────────────────────────

    const onTouchStart = useCallback((e: React.TouchEvent) => {
        const touches = e.touches;

        if (touches.length === 2) {
            // ═══════════════════════════════════════════════
            // PINCH START
            // ═══════════════════════════════════════════════
            e.preventDefault(); // Prevent browser zoom

            const distance = getTouchDistance(touches);
            const midpoint = getTouchMidpoint(touches);

            touchState.current = {
                isPinching: true,
                isPanning: false,
                pinchMidpoint: midpoint,
                initialPinchDistance: distance,
                initialPinchScale: scale
            };

            onPinchStart?.();

        } else if (touches.length === 1) {
            // ═══════════════════════════════════════════════
            // SINGLE TOUCH START (potential tap, swipe, or pan)
            // ═══════════════════════════════════════════════
            touchState.current = {
                ...touchState.current,
                isPinching: false,
                isPanning: false
            };

            swipeStartPosition.current = {
                x: touches[0].clientX,
                y: touches[0].clientY
            };

            // For double-tap detection
            const now = performance.now();
            const tapPosition = { x: touches[0].clientX, y: touches[0].clientY };

            if (
                lastTapPosition.current &&
                now - lastTapTime.current < config.doubleTapWindow
            ) {
                // Check if taps are close together
                const dx = tapPosition.x - lastTapPosition.current.x;
                const dy = tapPosition.y - lastTapPosition.current.y;
                const distance = Math.hypot(dx, dy);

                if (distance < 50) {
                    // Double tap detected!
                    e.preventDefault();
                    onDoubleTap?.(tapPosition, scale);
                    lastTapTime.current = 0;
                    lastTapPosition.current = null;
                    return;
                }
            }

            lastTapTime.current = now;
            lastTapPosition.current = tapPosition;

            // Momentum tracking
            lastMoveTime.current = now;
            lastMovePosition.current = tapPosition;
            velocityRef.current = { x: 0, y: 0 };
        }
    }, [scale, config.doubleTapWindow, onPinchStart, onDoubleTap]);

    // ─────────────────────────────────────────────────────
    // TOUCH MOVE
    // ─────────────────────────────────────────────────────

    const onTouchMove = useCallback((e: React.TouchEvent) => {
        const touches = e.touches;

        if (touches.length === 2 && touchState.current.isPinching) {
            // ═══════════════════════════════════════════════
            // PINCH MOVE - This is where the magic happens
            // ═══════════════════════════════════════════════
            e.preventDefault();

            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
            }

            rafRef.current = requestAnimationFrame(() => {
                const state = touchState.current;
                if (!state.initialPinchDistance || !state.pinchMidpoint) return;

                const currentDistance = getTouchDistance(touches);
                const currentMidpoint = getTouchMidpoint(touches);

                // Calculate scale change
                const distanceRatio = currentDistance / state.initialPinchDistance;
                let newScale = state.initialPinchScale * distanceRatio;

                // Apply rubber band effect if enabled
                if (config.enableRubberBand) {
                    newScale = applyRubberBand(
                        newScale,
                        config.minScale,
                        config.maxScale,
                        config.rubberBandResistance
                    );
                } else {
                    newScale = Math.min(Math.max(config.minScale, newScale), config.maxScale);
                }

                // Update the stored midpoint for smooth tracking
                // We use the CURRENT midpoint, not the initial one, for accurate focal tracking
                touchState.current.pinchMidpoint = currentMidpoint;

                // Call the zoom handler with the new scale and CURRENT midpoint
                // This allows the zoom to track finger movement
                onPinchZoom(newScale, currentMidpoint);
            });

        } else if (touches.length === 1 && !touchState.current.isPinching) {
            // ═══════════════════════════════════════════════
            // SINGLE FINGER MOVE (pan/swipe)
            // ═══════════════════════════════════════════════
            touchState.current.isPanning = true;

            // Track velocity for momentum
            if (config.enableMomentum && lastMovePosition.current) {
                const now = performance.now();
                const dt = now - lastMoveTime.current;

                if (dt > 0) {
                    const dx = touches[0].clientX - lastMovePosition.current.x;
                    const dy = touches[0].clientY - lastMovePosition.current.y;

                    // Exponential moving average for smooth velocity
                    velocityRef.current = {
                        x: velocityRef.current.x * 0.5 + (dx / dt) * 0.5,
                        y: velocityRef.current.y * 0.5 + (dy / dt) * 0.5
                    };
                }

                lastMoveTime.current = now;
                lastMovePosition.current = {
                    x: touches[0].clientX,
                    y: touches[0].clientY
                };
            }
        }
    }, [config, onPinchZoom]);

    // ─────────────────────────────────────────────────────
    // TOUCH END
    // ─────────────────────────────────────────────────────

    const onTouchEnd = useCallback((e: React.TouchEvent) => {
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }

        const remainingTouches = e.touches.length;

        if (touchState.current.isPinching && remainingTouches < 2) {
            // ═══════════════════════════════════════════════
            // PINCH END
            // ═══════════════════════════════════════════════

            // Snap back from rubber band if needed
            let finalScale = scale;
            if (config.enableRubberBand) {
                if (scale < config.minScale) {
                    finalScale = config.minScale;
                } else if (scale > config.maxScale) {
                    finalScale = config.maxScale;
                }
            }

            touchState.current = {
                isPinching: false,
                isPanning: false,
                pinchMidpoint: null,
                initialPinchDistance: null,
                initialPinchScale: scale
            };

            onPinchEnd?.(finalScale);

        } else if (touchState.current.isPanning && remainingTouches === 0) {
            // ═══════════════════════════════════════════════
            // PAN/SWIPE END
            // ═══════════════════════════════════════════════

            // Check for swipe
            if (swipeStartPosition.current && e.changedTouches.length > 0) {
                const endX = e.changedTouches[0].clientX;
                const startX = swipeStartPosition.current.x;
                const distance = endX - startX;

                // Only detect horizontal swipes when not zoomed in
                if (scale <= 1.1 && Math.abs(distance) > config.swipeThreshold) {
                    const direction = distance > 0 ? 'right' : 'left';
                    onSwipe?.(direction);
                }
            }

            // Apply momentum scrolling
            if (config.enableMomentum && containerRef.current) {
                const container = containerRef.current;
                const velocity = velocityRef.current;
                const friction = config.momentumFriction;

                const applyMomentum = () => {
                    if (Math.abs(velocity.x) < 0.1 && Math.abs(velocity.y) < 0.1) {
                        return;
                    }

                    velocity.x *= friction;
                    velocity.y *= friction;

                    container.scrollBy({
                        left: -velocity.x * 16, // ~16ms per frame
                        top: -velocity.y * 16,
                        behavior: 'instant'
                    });

                    rafRef.current = requestAnimationFrame(applyMomentum);
                };

                if (Math.abs(velocity.x) > 0.5 || Math.abs(velocity.y) > 0.5) {
                    rafRef.current = requestAnimationFrame(applyMomentum);
                }
            }

            touchState.current.isPanning = false;
            swipeStartPosition.current = null;
        }
    }, [scale, config, containerRef, onPinchEnd, onSwipe]);

    return {
        onTouchStart,
        onTouchMove,
        onTouchEnd,
        touchState
    };
}

export default useTouchGestures;
