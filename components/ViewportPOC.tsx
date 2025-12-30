import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useViewportTransform, TransformState } from '../hooks/useViewportTransform';
import { TileLayer } from './TileLayer';
import { RenderPool } from '../utils/RenderPool';

interface ViewportPOCProps {
    pdfUrl?: string;
}

export const ViewportPOC: React.FC<ViewportPOCProps> = ({ pdfUrl }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    // Initial state: We must wait for workers to be READY
    const [isWorkersReady, setIsWorkersReady] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [debugInfo, setDebugInfo] = useState("Initializing Workers...");
    const [contentSize, setContentSize] = useState({ width: 612, height: 792 });

    const [gridState, setGridState] = useState<TransformState>({ x: 0, y: 0, scale: 1 });
    const [viewportSize, setViewportSize] = useState({ width: window.innerWidth, height: window.innerHeight });

    const lastUpdateRef = useRef(0);

    const handleTransformUpdate = useCallback((state: TransformState) => {
        const now = Date.now();
        if (now - lastUpdateRef.current > 50) {
            setGridState({ ...state });
            lastUpdateRef.current = now;
        }
    }, []);

    const { viewportRef, zoomToPoint, transformRef } = useViewportTransform({
        minScale: 0.1,
        maxScale: 20,
        onUpdate: handleTransformUpdate
    });

    // ─────────────────────────────────────────────────────────────
    // LOAD DOCUMENT & WAIT FOR WORKERS
    // ─────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!pdfUrl) {
            setIsLoading(false);
            setDebugInfo("No PDF path provided");
            return;
        }

        let isMounted = true;

        async function init() {
            try {
                setIsLoading(true);
                setDebugInfo(`Loading ${pdfUrl}...`);

                const pool = RenderPool.getInstance();

                // We wait for the document to be fully loaded in ALL workers
                const { width, height } = await pool.loadDocument(pdfUrl);

                if (isMounted) {
                    setContentSize({ width, height });
                    setIsWorkersReady(true);
                    setIsLoading(false);
                    setDebugInfo(`PDF Loaded (${width}x${height})`);
                    console.log("ViewportPOC: Document ready in all workers.");
                }
            } catch (err) {
                if (isMounted) {
                    setDebugInfo(`Error: ${String(err)}`);
                    setIsLoading(false);
                    console.error("ViewportPOC: Failed to init document", err);
                }
            }
        }

        init();
        return () => { isMounted = false; };
    }, [pdfUrl]);

    // ─────────────────────────────────────────────────────────────
    // EVENT LISTENERS
    // ─────────────────────────────────────────────────────────────
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const resizeObserver = new ResizeObserver((entries) => {
            for (let entry of entries) {
                setViewportSize({ width: entry.contentRect.width, height: entry.contentRect.height });
            }
        });
        resizeObserver.observe(container);

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            const rect = container.getBoundingClientRect();
            const pivotX = e.clientX - rect.left;
            const pivotY = e.clientY - rect.top;
            const deltaModeMultiplier = e.deltaMode === 1 ? 40 : (e.deltaMode === 2 ? 800 : 1);
            const normalizedDelta = e.deltaY * deltaModeMultiplier;
            const sensitivity = 0.002;
            const zoomFactor = Math.exp(-normalizedDelta * sensitivity);
            zoomToPoint(pivotX, pivotY, zoomFactor);
        };

        const handleTouchStart = (e: TouchEvent) => {
            if (e.touches.length === 2) e.preventDefault();
        };

        container.addEventListener('wheel', handleWheel, { passive: false });
        container.addEventListener('touchstart', handleTouchStart, { passive: false });

        return () => {
            resizeObserver.disconnect();
            container.removeEventListener('wheel', handleWheel);
            container.removeEventListener('touchstart', handleTouchStart);
        };
    }, [zoomToPoint]);

    return (
        <div
            ref={containerRef}
            style={{
                width: '100%',
                height: '100vh',
                overflow: 'hidden',
                position: 'relative',
                backgroundColor: '#1e1e1e',
                touchAction: 'none'
            }}
        >
            <div
                ref={viewportRef}
                style={{
                    width: `${contentSize.width}px`,
                    height: `${contentSize.height}px`,
                    transformOrigin: '0 0',
                    willChange: 'transform',
                    backgroundColor: '#ffffff'
                }}
            >
                {/* Visual debug grid */}
                <div style={{
                    position: 'absolute', inset: 0,
                    backgroundImage: 'linear-gradient(#f0f0f0 1px, transparent 1px), linear-gradient(90deg, #f0f0f0 1px, transparent 1px)',
                    backgroundSize: '256px 256px',
                    opacity: 0.5,
                    pointerEvents: 'none'
                }} />

                {/* SHOW TILE LAYER ONLY WHEN WORKERS ARE READY */}
                {isWorkersReady && (
                    <TileLayer
                        viewportTransform={gridState}
                        viewportSize={viewportSize}
                        contentSize={contentSize}
                    />
                )}
            </div>

            {/* HUD / Debug Overlay */}
            <div style={{
                position: 'absolute', top: 20, left: 20,
                background: 'rgba(0,0,0,0.8)', color: 'white', padding: '15px',
                borderRadius: '8px', pointerEvents: 'none', zIndex: 1000,
                fontFamily: 'monospace', fontSize: '12px', border: '1px solid #444'
            }}>
                <div style={{ color: isLoading ? '#ffcc00' : '#00ff00', marginBottom: '5px' }}>
                    ● {debugInfo}
                </div>
                <div>Zoom: {gridState.scale.toFixed(2)}x</div>
                <div>Viewport: {viewportSize.width}x{viewportSize.height}</div>
            </div>

            {isLoading && (
                <div style={{
                    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', color: 'white', zIndex: 900
                }}>
                    <div style={{ textAlign: 'center' }}>
                        <div className="animate-spin" style={{ width: 40, height: 40, border: '4px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto 15px' }}></div>
                        Chargement du GPU Render Farm...
                    </div>
                </div>
            )}
        </div>
    );
};
