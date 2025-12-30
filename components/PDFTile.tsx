import React, { useEffect, useState, useRef } from 'react';
import { Tile } from '../utils/TileManager';
import { RenderPool } from '../utils/RenderPool';

interface PDFTileProps {
    tile: Tile;
    onReady?: (id: string) => void;
}

export const PDFTile: React.FC<PDFTileProps> = ({ tile, onReady }) => {
    const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
    const [opacity, setOpacity] = useState(0);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        let active = true;
        const pool = RenderPool.getInstance();

        pool.renderTile(tile).then((bmp) => {
            if (active) {
                setBitmap(bmp);
            } else {
                bmp.close();
            }
        }).catch(err => {
            console.error("Tile render failed", err);
        });

        return () => {
            active = false;
            pool.cancelTile(tile.id);
        };
    }, [tile.id]);

    // Draw bitmap to canvas when ready
    useEffect(() => {
        if (bitmap && canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            if (ctx) {
                ctx.drawImage(bitmap, 0, 0);
                // Reveal tile
                setOpacity(1);
                // Notify parent that this tile is rendered
                if (onReady) onReady(tile.id);
            }
        }
    }, [bitmap, onReady, tile.id]);

    return (
        <div
            style={{
                position: 'absolute',
                left: `${tile.x}px`,
                top: `${tile.y}px`,
                width: `${tile.width}px`,
                height: `${tile.height}px`,
                opacity: opacity,
                transition: 'opacity 0.1s ease-in', // Faster reveal
                willChange: 'opacity',
                zIndex: tile.lod * 10 // Higher LOD tiles on top
            }}
        >
            <canvas
                ref={canvasRef}
                width={256}
                height={256}
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'block'
                }}
            />

            <div style={{
                position: 'absolute', top: 0, left: 0,
                fontSize: '8px', color: 'black', background: 'rgba(255,255,255,0.4)',
                pointerEvents: 'none'
            }}>
                {tile.id}
            </div>
        </div>
    );
};
