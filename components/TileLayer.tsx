/**
 * TileLayer.tsx - Optimized Tile Rendering Layer
 *
 * Renders visible tiles with intelligent caching and LOD management.
 * Uses synchronous tile calculation (no debounce) for responsive scrolling.
 *
 * Cache Strategy:
 * - Primary: Current LOD tiles (highest priority, rendered on top)
 * - Fallback: Lower LOD tiles that cover visible area (placeholder while loading)
 * - Cleanup: Tiles outside viewport are immediately removed
 */

import React, { useMemo, useRef, useCallback } from 'react';
import { TileManager, Tile, Transform } from '../utils/TileManager';
import { PDFTile } from './PDFTile';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface TileLayerProps {
    /** Current viewport transform (position & scale) */
    viewportTransform: Transform;
    /** Viewport dimensions in screen pixels */
    viewportSize: { width: number; height: number };
    /** Content dimensions in world space (at scale 1.0) */
    contentSize: { width: number; height: number };
    /** Tile size in pixels (should match RenderPool config) */
    tileSize?: number;
    /** Extra rings of tiles to preload */
    buffer?: number;
    /** Available LOD levels */
    lodLevels?: number[];
}

/** Extended tile with render state */
interface CachedTile extends Tile {
    /** Whether this tile has been rendered */
    isReady: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const TileLayer: React.FC<TileLayerProps> = ({
    viewportTransform,
    viewportSize,
    contentSize,
    tileSize = 256,
    buffer = 1,
    lodLevels = [0.125, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8]
}) => {
    // ═══════════════════════════════════════════════════════════════════════
    // TILE MANAGER (Singleton per config)
    // ═══════════════════════════════════════════════════════════════════════

    const tileManager = useMemo(
        () => new TileManager({ tileSize, buffer, lodLevels }),
        [tileSize, buffer, lodLevels]
    );

    // ═══════════════════════════════════════════════════════════════════════
    // TILE CACHE (Persists across renders)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Cache stores rendered tiles to avoid re-requesting them.
     * Key: tile.id, Value: CachedTile with isReady flag
     */
    const tileCacheRef = useRef<Map<string, CachedTile>>(new Map());

    // ═══════════════════════════════════════════════════════════════════════
    // VISIBLE TILES CALCULATION (Synchronous, no debounce)
    // ═══════════════════════════════════════════════════════════════════════

    const { visibleTiles, currentLod, visibleTileIds } = useMemo(() => {
        const tiles = tileManager.getVisibleTiles(
            viewportSize,
            viewportTransform,
            contentSize
        );

        const lod = tiles.length > 0 ? tiles[0].lod : 1;
        const ids = new Set(tiles.map(t => t.id));

        return {
            visibleTiles: tiles,
            currentLod: lod,
            visibleTileIds: ids
        };
    }, [tileManager, viewportSize, viewportTransform, contentSize]);

    // ═══════════════════════════════════════════════════════════════════════
    // CACHE MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Build the list of tiles to render:
     * 1. Add all currently visible tiles (target LOD)
     * 2. Keep lower-LOD tiles that overlap visible area (as placeholders)
     * 3. Remove tiles that are completely outside viewport
     */
    const tilesToRender = useMemo(() => {
        const cache = tileCacheRef.current;
        const result: CachedTile[] = [];

        // Step 1: Add/update visible tiles in cache
        for (const tile of visibleTiles) {
            if (!cache.has(tile.id)) {
                cache.set(tile.id, { ...tile, isReady: false });
            }
            result.push(cache.get(tile.id)!);
        }

        // Step 2: Find lower-LOD tiles that can serve as placeholders
        // These are tiles at a lower LOD whose area overlaps the visible viewport
        const placeholders: CachedTile[] = [];

        cache.forEach((cachedTile, id) => {
            // Skip if it's a current visible tile (already added)
            if (visibleTileIds.has(id)) return;

            // Only consider lower LOD tiles as placeholders
            if (cachedTile.lod >= currentLod) return;

            // Check if this tile overlaps the visible area
            // A tile is relevant if it covers content that's currently visible
            const tileWorldX = cachedTile.x;
            const tileWorldY = cachedTile.y;
            const tileWorldW = cachedTile.width;
            const tileWorldH = cachedTile.height;

            // Visible area in world space
            const visibleWorldX = -viewportTransform.x / viewportTransform.scale;
            const visibleWorldY = -viewportTransform.y / viewportTransform.scale;
            const visibleWorldW = viewportSize.width / viewportTransform.scale;
            const visibleWorldH = viewportSize.height / viewportTransform.scale;

            // Add buffer zone
            const bufferZone = tileWorldW * buffer;
            const expandedX = visibleWorldX - bufferZone;
            const expandedY = visibleWorldY - bufferZone;
            const expandedW = visibleWorldW + bufferZone * 2;
            const expandedH = visibleWorldH + bufferZone * 2;

            // Overlap test
            const overlaps = !(
                tileWorldX + tileWorldW < expandedX ||
                tileWorldX > expandedX + expandedW ||
                tileWorldY + tileWorldH < expandedY ||
                tileWorldY > expandedY + expandedH
            );

            if (overlaps && cachedTile.isReady) {
                placeholders.push(cachedTile);
            }
        });

        // Step 3: Cleanup - remove tiles that are completely outside viewport
        const tilesToKeep = new Set<string>();

        // Keep visible tiles
        visibleTileIds.forEach(id => tilesToKeep.add(id));

        // Keep valid placeholders
        placeholders.forEach(t => tilesToKeep.add(t.id));

        // Prune cache
        cache.forEach((_, id) => {
            if (!tilesToKeep.has(id)) {
                cache.delete(id);
            }
        });

        // Combine and sort: low LOD first (background), high LOD last (foreground)
        const combined = [...placeholders, ...result];
        combined.sort((a, b) => a.lod - b.lod);

        return combined;

    }, [visibleTiles, visibleTileIds, currentLod, viewportTransform, viewportSize, buffer]);

    // ═══════════════════════════════════════════════════════════════════════
    // TILE READY CALLBACK
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Called when a PDFTile finishes rendering its bitmap.
     * Marks the tile as ready in the cache.
     */
    const handleTileReady = useCallback((id: string) => {
        const cache = tileCacheRef.current;
        const tile = cache.get(id);
        if (tile) {
            tile.isReady = true;
        }
    }, []);

    // ═══════════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════════

    return (
        <div
            className="absolute inset-0 pointer-events-none"
            style={{ overflow: 'hidden' }}
        >
            {tilesToRender.map(tile => (
                <PDFTile
                    key={tile.id}
                    tile={tile}
                    onReady={handleTileReady}
                />
            ))}
        </div>
    );
};

export default TileLayer;
