/**
 * TileManager.ts - Logic Core for Tiled Rendering
 * 
 * Responsible for translating Viewport state (Visual) into Tile Job requests (Logic).
 * Pure Input/Output logic.
 */

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface Transform {
    x: number;
    y: number;
    scale: number;
}

export interface Tile {
    id: string;        // Unique key: "page_0_lod_1_row_2_col_3"
    row: number;
    col: number;
    lod: number;       // Zoom Level (1, 2, 4...)
    x: number;         // CSS Position relative to the layer (px)
    y: number;         // CSS Position relative to the layer (px)
    width: number;     // Width to render (px) - should be 256
    height: number;    // Height to render (px) - should be 256
    pageIndex: number; // Page index for multi-page (future proof)
}

export interface TileManagerConfig {
    tileSize: number;
    buffer: number;      // Extra rings of tiles to load
    lodLevels: number[]; // e.g., [1, 2, 4, 8]
}

export class TileManager {
    private config: TileManagerConfig;

    constructor(config: Partial<TileManagerConfig> = {}) {
        this.config = {
            tileSize: 256,
            buffer: 1,
            lodLevels: [0.125, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8],
            ...config
        };
    }

    /**
     * Calculates the set of tiles needed to cover the current viewport.
     * 
     * @param viewport - Dimensions of the viewing window (Screen pixels)
     * @param transform - Current transform applied to the content layer
     * @param contentSize - Full size of the content at Scale 1.0 (World pixels)
     */
    getVisibleTiles(
        viewport: { width: number; height: number },
        transform: Transform,
        contentSize: { width: number; height: number },
        pageIndex: number = 0
    ): Tile[] {
        const { tileSize, buffer, lodLevels } = this.config;
        const { scale, x: tx, y: ty } = transform;

        // 1. Determine LOD Level ("Floor" Strategy)
        // Find the highest supported LOD that is <= current scale
        // e.g. Scale 1.5 -> LOD 1.0. Scale 0.8 -> LOD 0.5.
        let lod = lodLevels[0];
        for (let i = lodLevels.length - 1; i >= 0; i--) {
            if (scale >= lodLevels[i]) {
                lod = lodLevels[i];
                break;
            }
        }

        // Fallback: if scale < min LOD, use min LOD (downsampled display)
        if (scale < lodLevels[0]) lod = lodLevels[0];

        // 2. Calculate Visible Rect in WORLD Space (Scale 1.0 coordinates)
        // Inverse Transform: P_world = (P_screen - Translate) / Scale

        // Visible Left/Top (Screen 0,0)
        const visibleWorldX = -tx / scale;
        const visibleWorldY = -ty / scale;

        // Visible Width/Height in World Units
        const visibleWorldW = viewport.width / scale;
        const visibleWorldH = viewport.height / scale;

        // 3. Convert Visible Rect to LOD Space
        // LOD Space = World Coordinates * LOD
        const lodX = visibleWorldX * lod;
        const lodY = visibleWorldY * lod;
        const lodW = visibleWorldW * lod;
        const lodH = visibleWorldH * lod;

        // 4. Calculate Grid Indices (with Culling)
        const startCol = Math.floor(lodX / tileSize) - buffer;
        const endCol = Math.ceil((lodX + lodW) / tileSize) + buffer;

        const startRow = Math.floor(lodY / tileSize) - buffer;
        const endRow = Math.ceil((lodY + lodH) / tileSize) + buffer;

        // 5. Generate Tiles
        const tiles: Tile[] = [];

        // Bounds of the content in LOD space
        const maxCols = Math.ceil((contentSize.width * lod) / tileSize);
        const maxRows = Math.ceil((contentSize.height * lod) / tileSize);

        for (let r = startRow; r < endRow; r++) {
            for (let c = startCol; c < endCol; c++) {
                // Culling: Check if tile is within valid content bounds
                if (c >= 0 && c < maxCols && r >= 0 && r < maxRows) {
                    tiles.push({
                        id: `page_${pageIndex}_lod_${lod}_r_${r}_c_${c}`,
                        row: r,
                        col: c,
                        lod: lod,
                        // Position in the Layer (which is scaled by 'scale')?
                        // Wait, the Layer is scaled by 'scale' in CSS.
                        // If we put an image of width 256 at x=0 inside the layer...
                        // AND the layer is transformed by 'scale'...
                        // Then visually it will be size 256 * scale.

                        // BUT we want the tile to represent the content at 'lod' scale.
                        // If scale=1.5 and lod=1.0:
                        // We load a 256px tile representing the 1.0 content.
                        // We place it at (col*256, row*256).
                        // Layer is scaled by 1.5. 
                        // Visual size = 256 * 1.5 = 384. Correct for "Stretch".

                        // What if scale=2.5 and lod=2.0?
                        // We load a 256px tile representing 2.0 content.
                        // This tile covers 128px of World Space (256 / 2).
                        // We place it at position... ?
                        // In the layer, we need to position it such that it lines up.

                        // STRATEGY: 
                        // The Layer should probably be normalized to World Space (Scale 1.0) 
                        // OR Scale LOD space?

                        // IF we use `transform: matrix(scale...)` on the Layer...
                        // And we append tiles to it as children...

                        // Option A: Layer represents "World Space" (Scale 1.0).
                        // Then a LOD 1.0 tile (256px) is placed at x*256, width=256.
                        // A LOD 2.0 tile (256px) represents 128px of World content.
                        // So we must render it with `width: 128px` (CSS) and `position: x*128, y*128`.
                        // But the canvas bitmap is 256px high-res.

                        // Calculation:
                        // World Width of Tile = tileSize / lod
                        // CSS Position x = col * (tileSize / lod)
                        // CSS Width = tileSize / lod

                        x: c * (tileSize / lod),
                        y: r * (tileSize / lod),
                        width: tileSize / lod,
                        height: tileSize / lod,
                        pageIndex
                    });
                }
            }
        }

        return tiles;
    }
}
