/**
 * PDFTile.tsx - GPU-Accelerated Tile Renderer
 *
 * Renders a single tile from the PDF render farm.
 * Manages ImageBitmap lifecycle to prevent GPU memory leaks.
 *
 * Key Features:
 * - useLayoutEffect for synchronous painting (no white flashes)
 * - Proper bitmap.close() on unmount/change
 * - Configurable tile size
 */

import React, { useEffect, useLayoutEffect, useState, useRef, useCallback } from 'react';
import { Tile } from '../utils/TileManager';
import { RenderPool } from '../utils/RenderPool';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface PDFTileProps {
    /** Tile descriptor from TileManager */
    tile: Tile;
    /** Callback when tile has been rendered to canvas */
    onReady?: (id: string) => void;
    /** Canvas resolution in pixels (default: 256) */
    tileSize?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const PDFTile: React.FC<PDFTileProps> = ({
    tile,
    onReady,
    tileSize = 256
}) => {
    // ═══════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════

    const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
    const [isVisible, setIsVisible] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // ═══════════════════════════════════════════════════════════════════════
    // FETCH TILE BITMAP
    // ═══════════════════════════════════════════════════════════════════════

    useEffect(() => {
        let isMounted = true;
        const pool = RenderPool.getInstance();

        pool.renderTile(tile)
            .then((bmp) => {
                if (isMounted) {
                    setBitmap(bmp);
                } else {
                    // Component unmounted before render complete
                    bmp.close();
                }
            })
            .catch((err) => {
                if (isMounted) {
                    console.error(`[PDFTile] Render failed for ${tile.id}:`, err);
                }
            });

        return () => {
            isMounted = false;
            pool.cancelTile(tile.id);
        };
    }, [tile.id, tile]);

    // ═══════════════════════════════════════════════════════════════════════
    // BITMAP CLEANUP (Critical for GPU memory)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * When bitmap changes or component unmounts, release the previous bitmap.
     * ImageBitmap holds GPU texture memory that MUST be explicitly released.
     */
    useEffect(() => {
        // This effect returns a cleanup function that runs when:
        // 1. `bitmap` changes (old bitmap needs to be closed)
        // 2. Component unmounts
        return () => {
            if (bitmap) {
                bitmap.close();
            }
        };
    }, [bitmap]);

    // ═══════════════════════════════════════════════════════════════════════
    // DRAW TO CANVAS (useLayoutEffect = synchronous, before paint)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * useLayoutEffect ensures the bitmap is drawn to the canvas BEFORE
     * the browser paints the frame. This eliminates white flash artifacts.
     */
    useLayoutEffect(() => {
        if (!bitmap || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { alpha: false });

        if (!ctx) {
            console.error('[PDFTile] Failed to get 2D context');
            return;
        }

        // Draw bitmap to canvas
        ctx.drawImage(bitmap, 0, 0);

        // Reveal tile with fade-in
        setIsVisible(true);

        // Notify parent that this tile is ready
        onReady?.(tile.id);

    }, [bitmap, onReady, tile.id]);

    // ═══════════════════════════════════════════════════════════════════════
    // STABLE CALLBACK FOR ONREADY
    // ═══════════════════════════════════════════════════════════════════════

    const stableOnReady = useCallback(() => {
        onReady?.(tile.id);
    }, [onReady, tile.id]);

    // ═══════════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════════

    return (
        <div
            style={{
                position: 'absolute',
                left: tile.x,
                top: tile.y,
                width: tile.width,
                height: tile.height,
                opacity: isVisible ? 1 : 0,
                transition: 'opacity 100ms ease-out',
                willChange: 'opacity',
                // Higher LOD = higher z-index (sharp tiles on top)
                zIndex: Math.round(tile.lod * 10),
                // Prevent subpixel rendering artifacts
                transform: 'translateZ(0)',
            }}
        >
            <canvas
                ref={canvasRef}
                width={tileSize}
                height={tileSize}
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'block',
                    // Crisp rendering for scaled-down tiles
                    imageRendering: 'auto',
                }}
            />
        </div>
    );
};

export default PDFTile;
