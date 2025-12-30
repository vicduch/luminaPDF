/**
 * TileManager.ts - Tiled Rendering Engine
 *
 * Transforms viewport state into a list of tile render jobs.
 * Implements a Level-of-Detail (LOD) system for efficient multi-resolution rendering.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * COORDINATE SYSTEMS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. SCREEN SPACE
 *    - Origin: Top-left of the viewport container
 *    - Units: Physical screen pixels
 *    - Example: Mouse position, viewport dimensions
 *
 * 2. WORLD SPACE (Scale 1.0)
 *    - Origin: Top-left of the document content
 *    - Units: Logical document pixels at 100% zoom
 *    - This is the canonical coordinate system for the PDF
 *    - Example: A 612x792 pt PDF page
 *
 * 3. LOD SPACE (Scale = LOD Level)
 *    - Origin: Same as World Space
 *    - Units: Pixels at the selected LOD resolution
 *    - LOD 2.0 means 2x the pixels of World Space
 *    - Example: At LOD 2, a 612pt page becomes 1224 LOD-pixels wide
 *
 * 4. TILE GRID SPACE
 *    - Origin: Top-left of LOD Space
 *    - Units: Tile indices (row, col)
 *    - Each tile is tileSize × tileSize pixels in LOD Space
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * LOD SELECTION STRATEGY: CEILING (Sharp Quality)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * We use a "Ceiling" strategy: select the smallest LOD level >= current scale.
 *
 * This ensures tiles are rendered at HIGHER resolution than displayed,
 * then downscaled by CSS. Result: sharp rendering, no blur from upscaling.
 *
 * Example with lodLevels = [0.5, 1, 2, 4]:
 *   - Scale 0.8 → LOD 1.0 (downsample 1.0 → 0.8)
 *   - Scale 1.2 → LOD 2.0 (downsample 2.0 → 1.2)
 *   - Scale 3.5 → LOD 4.0 (downsample 4.0 → 3.5)
 *
 * Trade-off: Higher memory/render cost, but maximum visual quality.
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface Transform {
    x: number;      // Translation X (CSS transform)
    y: number;      // Translation Y (CSS transform)
    scale: number;  // Current zoom scale
}

export interface Tile {
    /** Unique identifier: "page_{p}_lod_{l}_r_{r}_c_{c}" */
    id: string;
    /** Row index in tile grid (LOD Space) */
    row: number;
    /** Column index in tile grid (LOD Space) */
    col: number;
    /** LOD level this tile was rendered at */
    lod: number;
    /** X position in World Space (for CSS positioning) */
    x: number;
    /** Y position in World Space (for CSS positioning) */
    y: number;
    /** Width in World Space (CSS width, will be scaled by transform) */
    width: number;
    /** Height in World Space */
    height: number;
    /** Page index (0-based) */
    pageIndex: number;
}

export interface TileManagerConfig {
    /** Size of each tile in LOD-space pixels (default: 256) */
    tileSize: number;
    /** Extra rings of tiles to preload around visible area */
    buffer: number;
    /** Available LOD levels, sorted ascending */
    lodLevels: number[];
}

// ─────────────────────────────────────────────────────────────────────────────
// TILE MANAGER
// ─────────────────────────────────────────────────────────────────────────────

export class TileManager {
    private readonly config: TileManagerConfig;

    constructor(config: Partial<TileManagerConfig> = {}) {
        this.config = {
            tileSize: 256,
            buffer: 1,
            // Granular LOD levels for smooth quality transitions
            lodLevels: [0.125, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8],
            ...config
        };

        // Ensure lodLevels are sorted ascending
        this.config.lodLevels.sort((a, b) => a - b);
    }

    /**
     * Computes the tiles required to cover the current viewport.
     *
     * @param viewport - Screen dimensions of the viewing container
     * @param transform - Current CSS transform {x, y, scale}
     * @param contentSize - Document size in World Space (at scale 1.0)
     * @param pageIndex - Page index for multi-page documents
     * @returns Array of Tile objects to render
     */
    getVisibleTiles(
        viewport: { width: number; height: number },
        transform: Transform,
        contentSize: { width: number; height: number },
        pageIndex: number = 0
    ): Tile[] {
        const { tileSize, buffer, lodLevels } = this.config;
        const { scale, x: tx, y: ty } = transform;

        // ─────────────────────────────────────────────────────────────────────
        // STEP 1: Select LOD Level (Ceiling Strategy)
        // ─────────────────────────────────────────────────────────────────────

        let lod = lodLevels[lodLevels.length - 1]; // Default to highest

        for (let i = 0; i < lodLevels.length; i++) {
            if (lodLevels[i] >= scale) {
                lod = lodLevels[i];
                break;
            }
        }

        // Edge case: scale exceeds max LOD → use max (will be upscaled slightly)
        if (scale > lodLevels[lodLevels.length - 1]) {
            lod = lodLevels[lodLevels.length - 1];
        }

        // ─────────────────────────────────────────────────────────────────────
        // STEP 2: Transform Screen → World Space
        // ─────────────────────────────────────────────────────────────────────

        // The visible rectangle in World Space coordinates
        // Inverse of CSS transform: P_world = (P_screen - translate) / scale
        const visibleWorldX = -tx / scale;
        const visibleWorldY = -ty / scale;
        const visibleWorldW = viewport.width / scale;
        const visibleWorldH = viewport.height / scale;

        // ─────────────────────────────────────────────────────────────────────
        // STEP 3: Transform World → LOD Space
        // ─────────────────────────────────────────────────────────────────────

        // LOD Space = World Space × LOD
        // Higher LOD = more pixels = finer grid
        const lodX = visibleWorldX * lod;
        const lodY = visibleWorldY * lod;
        const lodW = visibleWorldW * lod;
        const lodH = visibleWorldH * lod;

        // ─────────────────────────────────────────────────────────────────────
        // STEP 4: Compute Tile Grid Indices
        // ─────────────────────────────────────────────────────────────────────

        const startCol = Math.floor(lodX / tileSize) - buffer;
        const endCol = Math.ceil((lodX + lodW) / tileSize) + buffer;
        const startRow = Math.floor(lodY / tileSize) - buffer;
        const endRow = Math.ceil((lodY + lodH) / tileSize) + buffer;

        // Content bounds in tile-grid units
        const maxCols = Math.ceil((contentSize.width * lod) / tileSize);
        const maxRows = Math.ceil((contentSize.height * lod) / tileSize);

        // ─────────────────────────────────────────────────────────────────────
        // STEP 5: Generate Tile Objects
        // ─────────────────────────────────────────────────────────────────────

        const tiles: Tile[] = [];

        // World-space size of one tile
        // A tile covers (tileSize / lod) world units
        const tileWorldSize = tileSize / lod;

        for (let row = startRow; row < endRow; row++) {
            for (let col = startCol; col < endCol; col++) {
                // Frustum culling: skip tiles outside content bounds
                if (col < 0 || col >= maxCols || row < 0 || row >= maxRows) {
                    continue;
                }

                tiles.push({
                    id: `page_${pageIndex}_lod_${lod}_r_${row}_c_${col}`,
                    row,
                    col,
                    lod,
                    // Position in World Space (CSS will apply scale transform)
                    x: col * tileWorldSize,
                    y: row * tileWorldSize,
                    // Size in World Space
                    width: tileWorldSize,
                    height: tileWorldSize,
                    pageIndex
                });
            }
        }

        return tiles;
    }

    /**
     * Returns the current LOD level that would be selected for a given scale.
     * Useful for debugging and UI display.
     */
    getLodForScale(scale: number): number {
        const { lodLevels } = this.config;

        for (let i = 0; i < lodLevels.length; i++) {
            if (lodLevels[i] >= scale) {
                return lodLevels[i];
            }
        }

        return lodLevels[lodLevels.length - 1];
    }
}
