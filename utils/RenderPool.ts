/**
 * RenderPool.ts - Web Worker Pool Manager
 *
 * Manages a pool of PDF rendering workers for parallel tile generation.
 * Implements round-robin job distribution and singleton pattern.
 */

import { Tile } from './TileManager';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Document dimensions returned after successful load */
export interface DocumentDimensions {
    width: number;
    height: number;
}

/** Configuration options for the RenderPool */
export interface RenderPoolConfig {
    /** Maximum number of workers to spawn (default: min(hardwareConcurrency, 8)) */
    maxWorkers: number;
    /** Size of rendered tiles in pixels (default: 256) */
    tileSize: number;
}

/** Internal job tracking for pending tile renders */
interface PendingTileJob {
    id: string;
    resolve: (bitmap: ImageBitmap) => void;
    reject: (error: Error) => void;
    workerIndex: number;
}

/** State of the pending document load operation */
interface PendingDocumentLoad {
    /** Resolves with document dimensions when ALL workers are ready */
    resolve: (dims: DocumentDimensions) => void;
    /** Rejects if ANY worker fails to load */
    reject: (error: Error) => void;
    /** Tracks how many workers have confirmed loading */
    loadedCount: number;
    /** Stores dimensions from first successful worker */
    dimensions: DocumentDimensions | null;
    /** Flag to prevent multiple rejections */
    rejected: boolean;
}

/** Message types from worker */
type WorkerMessageType =
    | 'DOCUMENT_LOADED'
    | 'DOCUMENT_ERROR'
    | 'TILE_READY'
    | 'TILE_ERROR';

/** Worker message payload */
interface WorkerMessage {
    type: WorkerMessageType;
    id?: string;
    bitmap?: ImageBitmap;
    error?: string;
    numPages?: number;
    width?: number;
    height?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER POOL
// ─────────────────────────────────────────────────────────────────────────────

export class RenderPool {
    private static instance: RenderPool;

    private readonly config: RenderPoolConfig;
    private readonly workers: Worker[] = [];
    private readonly jobQueue: Map<string, PendingTileJob> = new Map();

    private workerRoundRobin: number = 0;
    private pendingLoad: PendingDocumentLoad | null = null;

    // ═══════════════════════════════════════════════════════════════════════
    // LIFECYCLE
    // ═══════════════════════════════════════════════════════════════════════

    private constructor(config: Partial<RenderPoolConfig> = {}) {
        this.config = {
            maxWorkers: Math.min(navigator.hardwareConcurrency || 4, 8),
            tileSize: 256,
            ...config
        };

        this.initWorkers();
    }

    /**
     * Returns the singleton instance of RenderPool.
     * Creates it on first call.
     */
    public static getInstance(config?: Partial<RenderPoolConfig>): RenderPool {
        if (!RenderPool.instance) {
            RenderPool.instance = new RenderPool(config);
        }
        return RenderPool.instance;
    }

    /**
     * Spawns worker threads and sets up message handlers.
     */
    private initWorkers(): void {
        for (let i = 0; i < this.config.maxWorkers; i++) {
            const worker = new Worker(
                new URL('../workers/pdf.worker.ts', import.meta.url),
                { type: 'module' }
            );

            worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
                this.handleWorkerMessage(e.data, i);
            };

            worker.onerror = (e: ErrorEvent) => {
                console.error(`[RenderPool] Worker ${i} error:`, e.message);
            };

            this.workers.push(worker);
        }

        console.log(`[RenderPool] Initialized ${this.config.maxWorkers} workers`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MESSAGE HANDLING
    // ═══════════════════════════════════════════════════════════════════════

    private handleWorkerMessage(message: WorkerMessage, workerIndex: number): void {
        const { type, id, bitmap, error, width, height } = message;

        switch (type) {
            case 'DOCUMENT_LOADED':
                this.handleDocumentLoaded(workerIndex, width, height);
                break;

            case 'DOCUMENT_ERROR':
                this.handleDocumentError(workerIndex, error);
                break;

            case 'TILE_READY':
                this.handleTileReady(id!, bitmap!);
                break;

            case 'TILE_ERROR':
                this.handleTileError(id!, error);
                break;
        }
    }

    private handleDocumentLoaded(
        workerIndex: number,
        width: number | undefined,
        height: number | undefined
    ): void {
        if (!this.pendingLoad) return;

        this.pendingLoad.loadedCount++;

        // Store dimensions from first successful worker
        if (!this.pendingLoad.dimensions && width !== undefined && height !== undefined) {
            this.pendingLoad.dimensions = { width, height };
        }

        // All workers ready?
        if (this.pendingLoad.loadedCount >= this.config.maxWorkers) {
            const dims = this.pendingLoad.dimensions || { width: 612, height: 792 };
            this.pendingLoad.resolve(dims);
            this.pendingLoad = null;
        }
    }

    private handleDocumentError(workerIndex: number, error: string | undefined): void {
        if (!this.pendingLoad || this.pendingLoad.rejected) return;

        // Reject immediately on first error
        this.pendingLoad.rejected = true;
        this.pendingLoad.reject(new Error(error || 'Unknown worker error'));
        this.pendingLoad = null;
    }

    private handleTileReady(id: string, bitmap: ImageBitmap): void {
        const job = this.jobQueue.get(id);

        if (job) {
            job.resolve(bitmap);
            this.jobQueue.delete(id);
        } else {
            // Job was cancelled, release the bitmap
            bitmap.close();
        }
    }

    private handleTileError(id: string, error: string | undefined): void {
        const job = this.jobQueue.get(id);

        if (job) {
            job.reject(new Error(error || 'Tile render failed'));
            this.jobQueue.delete(id);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Loads a PDF document into all workers.
     * Returns document dimensions when ALL workers have loaded successfully.
     * Rejects immediately if ANY worker fails.
     *
     * @param url - URL or path to the PDF document
     */
    public loadDocument(url: string): Promise<DocumentDimensions> {
        // Cancel any pending load
        if (this.pendingLoad && !this.pendingLoad.rejected) {
            this.pendingLoad.reject(new Error('Load cancelled by new request'));
        }

        return new Promise<DocumentDimensions>((resolve, reject) => {
            // Initialize pending load state
            this.pendingLoad = {
                resolve,
                reject,
                loadedCount: 0,
                dimensions: null,
                rejected: false
            };

            // Broadcast load command to all workers
            for (const worker of this.workers) {
                worker.postMessage({
                    type: 'LOAD_DOCUMENT',
                    data: { url }
                });
            }
        });
    }

    /**
     * Queues a tile for rendering.
     * Returns an ImageBitmap that can be drawn to a canvas.
     *
     * @param tile - Tile descriptor from TileManager
     */
    public renderTile(tile: Tile): Promise<ImageBitmap> {
        return new Promise<ImageBitmap>((resolve, reject) => {
            // Round-robin worker selection
            const workerIndex = this.workerRoundRobin;
            this.workerRoundRobin = (this.workerRoundRobin + 1) % this.config.maxWorkers;

            const worker = this.workers[workerIndex];

            // Register job
            this.jobQueue.set(tile.id, {
                id: tile.id,
                resolve,
                reject,
                workerIndex
            });

            // Send render command
            worker.postMessage({
                type: 'RENDER_TILE',
                data: {
                    id: tile.id,
                    pageIndex: tile.pageIndex,
                    scale: tile.lod,
                    tileRect: {
                        x: tile.x,
                        y: tile.y,
                        width: tile.width,
                        height: tile.height
                    },
                    tileSize: {
                        width: this.config.tileSize,
                        height: this.config.tileSize
                    }
                }
            });
        });
    }

    /**
     * Cancels a pending tile render.
     * The worker will still complete the render, but the result will be discarded.
     *
     * @param tileId - ID of the tile to cancel
     */
    public cancelTile(tileId: string): void {
        const job = this.jobQueue.get(tileId);
        if (job) {
            this.jobQueue.delete(tileId);
            // Note: We don't actually cancel the worker operation,
            // we just ignore the result when it arrives
        }
    }

    /**
     * Returns the number of active workers.
     */
    public get workerCount(): number {
        return this.workers.length;
    }

    /**
     * Returns the configured tile size.
     */
    public get tileSize(): number {
        return this.config.tileSize;
    }
}
