import React, { useMemo, useEffect, useState, useCallback } from 'react';
import { TileManager, Tile, Transform } from '../utils/TileManager';
import { PDFTile } from './PDFTile';

// Simple debounce
function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
}

interface TileLayerProps {
    viewportTransform: Transform;
    viewportSize: { width: number; height: number };
    contentSize: { width: number; height: number };
}

/**
 * TileLayer - Improved with Double Buffering
 */
export const TileLayer: React.FC<TileLayerProps> = ({
    viewportTransform,
    viewportSize,
    contentSize
}) => {
    const stableTransform = useDebounce(viewportTransform, 100);

    const tileManager = useMemo(() => new TileManager({
        tileSize: 256,
        buffer: 1,
        lodLevels: [0.125, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8]
    }), []);

    const [tileCache, setTileCache] = useState<Map<string, Tile>>(new Map());

    useEffect(() => {
        const newTiles = tileManager.getVisibleTiles(
            viewportSize,
            stableTransform,
            contentSize
        );

        setTileCache(prev => {
            const next = new Map(prev);

            newTiles.forEach(t => {
                if (!next.has(t.id)) next.set(t.id, t);
            });

            const currentLod = newTiles[0]?.lod;
            next.forEach((t: Tile, id: string) => {
                if (Math.abs(t.lod - (currentLod || 1)) > 2) {
                    next.delete(id);
                }
            });

            return next;
        });
    }, [stableTransform, viewportSize, contentSize, tileManager]);

    const handleTileReady = useCallback((id: string) => {
        // Optionnel: cleanup agressif ici
    }, []);

    const sortedTiles = useMemo(() => {
        return Array.from(tileCache.values()).sort((a: Tile, b: Tile) => a.lod - b.lod);
    }, [tileCache]);

    return (
        <div className="absolute inset-0 pointer-events-none">
            {sortedTiles.map(tile => (
                <PDFTile
                    key={tile.id}
                    tile={tile}
                    onReady={handleTileReady}
                />
            ))}
        </div>
    );
};
