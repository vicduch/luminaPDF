import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useViewportTransform, TransformState } from '../hooks/useViewportTransform';
import { TileLayer } from './TileLayer';

/**
 * POC Viewport Component
 * Demonstrates high-performance tiled rendering foundation.
 */
export const ViewportPOC: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);

    // State for the TileLayer (Decoupled from the 60fps visual transform)
    const [gridState, setGridState] = useState<TransformState>({ x: 0, y: 0, scale: 1 });
    const [viewportSize, setViewportSize] = useState({ width: window.innerWidth, height: window.innerHeight });

    // Throttle helper ref
    const lastUpdateRef = useRef(0);

    const handleTransformUpdate = useCallback((state: TransformState) => {
        const now = Date.now();
        // Throttle React State updates to ~30fps or less to save Main Thread for the Physics/CSS
        if (now - lastUpdateRef.current > 50) { // 50ms = 20fps
            setGridState({ ...state }); // Clone to trigger update
            lastUpdateRef.current = now;
        }
    }, []);

    // Use our custom hook
    const { viewportRef, zoomToPoint, pan, transformRef } = useViewportTransform({
        minScale: 0.1,
        maxScale: 20,
        onUpdate: handleTransformUpdate
    });

    // Debug overlay state (optional, for verification)
    const [debugInfo, setDebugInfo] = useState("Scale: 1.00");

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // Update viewport size on resize
        const resizeObserver = new ResizeObserver((entries) => {
            for (let entry of entries) {
                setViewportSize({ width: entry.contentRect.width, height: entry.contentRect.height });
            }
        });
        resizeObserver.observe(container);

        // ─────────────────────────────────────────────────────────────
        // EVENT LISTENERS (Native for max performance control)
        // ─────────────────────────────────────────────────────────────

        // 1. Wheel Zoom
        const handleWheel = (e: WheelEvent) => {
            e.preventDefault(); // Stop browser scroll

            const rect = container.getBoundingClientRect();
            const pivotX = e.clientX - rect.left;
            const pivotY = e.clientY - rect.top;

            // Standardize wheel delta
            // e.deltaY > 0 means scroll down (zoom out), < 0 means scroll up (zoom in)

            // Normalisation Cross-Browser (Pixel vs Line vs Page)
            // 0 = Pixels, 1 = Lines (approx 40px), 2 = Pages (approx 800px)
            const deltaModeMultiplier = e.deltaMode === 1 ? 40 : (e.deltaMode === 2 ? 800 : 1);
            const normalizedDelta = e.deltaY * deltaModeMultiplier;

            // Sensibilité ajustée
            const sensitivity = 0.002;
            const zoomFactor = Math.exp(-normalizedDelta * sensitivity);

            zoomToPoint(pivotX, pivotY, zoomFactor);

            // Update debug info occasionally (not every frame to avoid React render lag)
            if (Math.random() > 0.9) {
                setDebugInfo(`Scale: ${transformRef.current.scale.toFixed(2)}`);
            }
        };

        // 2. Touch Gestures (Simple Pinch/Pan POC)
        // For a full production app, we would use a robust recognizer state machine
        let initialDist: number | null = null;
        let initialScale: number = 1;

        const handleTouchStart = (e: TouchEvent) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                initialDist = Math.hypot(dx, dy);
                initialScale = transformRef.current.scale;
            }
        };

        const handleTouchMove = (e: TouchEvent) => {
            e.preventDefault();

            // PAN (1 finger)
            if (e.touches.length === 1) {
                // Implement simple pan delta tracking here if needed
                // For POC, we focus on Zoom logic as requested
            }

            // PINCH (2 fingers)
            if (e.touches.length === 2 && initialDist) {
                const t1 = e.touches[0];
                const t2 = e.touches[1];

                // Current distance
                const dx = t1.clientX - t2.clientX;
                const dy = t1.clientY - t2.clientY;
                const currentDist = Math.hypot(dx, dy);

                // Focal Point (Midpoint) relative to container
                const rect = container.getBoundingClientRect();
                const midX = (t1.clientX + t2.clientX) / 2 - rect.left;
                const midY = (t1.clientY + t2.clientY) / 2 - rect.top;

                // Calculate zoom factor relative to *previous frame* is tricky with native events 
                // without state machine.
                // Easier: Calculate absolute target scale and drift.
                // But for "Zero Latency" incremental updates (like wheel), we want delta.

                // Let's use the pure setTransform or incremental approach?
                // Incremental is best for the hook we built:
                const scaleFactor = currentDist / initialDist;

                // Reset baseline for next move event to avoid compounding errors 
                // (This makes it an incremental updates stream)
                zoomToPoint(midX, midY, scaleFactor);

                // Update baseline
                initialDist = currentDist;
            }
        };

        const handleTouchEnd = () => {
            initialDist = null;
        };

        container.addEventListener('wheel', handleWheel, { passive: false });
        container.addEventListener('touchstart', handleTouchStart, { passive: false });
        container.addEventListener('touchmove', handleTouchMove, { passive: false });
        container.addEventListener('touchend', handleTouchEnd);

        return () => {
            resizeObserver.disconnect();
            container.removeEventListener('wheel', handleWheel);
            container.removeEventListener('touchstart', handleTouchStart);
            container.removeEventListener('touchmove', handleTouchMove);
            container.removeEventListener('touchend', handleTouchEnd);
        };
    }, [zoomToPoint, transformRef]);

    // ─────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────
    return (
        <div
            ref={containerRef}
            style={{
                width: '100%',
                height: '100vh',
                overflow: 'hidden',
                position: 'relative',
                backgroundColor: '#1e1e1e',
                touchAction: 'none' // Disable browser gestures
            }}
        >
            {/* VIEWPORT LAYER (GPU Accelerated) */}
            <div
                ref={viewportRef}
                style={{
                    // IMPORTANT: The conceptual size of the content at Scale 1.0
                    width: '2000px',
                    height: '3000px',
                    transformOrigin: '0 0', // CRITICAL for matrix logic
                    willChange: 'transform', // Browser optimization hint
                    backgroundColor: '#111'
                }}
            >
                {/* The Grid Visualization */}
                <div style={{
                    position: 'absolute', inset: 0,
                    backgroundImage: `
                    linear-gradient(#333 1px, transparent 1px),
                    linear-gradient(90deg, #333 1px, transparent 1px)
                `,
                    backgroundSize: '256px 256px', // Visual guide for tiles
                    opacity: 0.2,
                    pointerEvents: 'none'
                }} />

                {/* Tile Layer System */}
                <TileLayer
                    viewportTransform={gridState}
                    viewportSize={viewportSize}
                    contentSize={{ width: 2000, height: 3000 }}
                />

                {/* Content Mock Markers */}
                <div style={{ position: 'absolute', top: 500, left: 500, color: 'white', fontSize: 40 }}>
                    CONTENT START (500, 500)
                </div>
                <div style={{ position: 'absolute', top: 1500, left: 1000, color: 'white', fontSize: 40 }}>
                    CENTER (1000, 1500)
                </div>
            </div>

            {/* HUD */}
            <div style={{
                position: 'absolute', top: 20, left: 20,
                background: 'rgba(0,0,0,0.7)', color: 'white', padding: '10px',
                pointerEvents: 'none',
                zIndex: 999
            }}>
                <div>{debugInfo}</div>
                <div style={{ fontSize: '10px', marginTop: 5 }}>
                    Rendered Tiles: Use React DevTools
                </div>
            </div>
        </div>
    );
};
