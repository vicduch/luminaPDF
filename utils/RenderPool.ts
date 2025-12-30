import { Tile } from './TileManager';

interface WorkerJob {
    id: string;
    resolve: (bitmap: ImageBitmap) => void;
    reject: (err: any) => void;
    workerIndex: number;
}

export class RenderPool {
    private static instance: RenderPool;
    private workers: Worker[] = [];
    private jobQueue: Map<string, WorkerJob> = new Map();
    // On repasse à plusieurs workers pour la fluidité
    private maxWorkers = Math.min(navigator.hardwareConcurrency || 4, 8);
    private workerRoundRobin = 0;
    private documentLoadedCount = 0;
    private documentLoadPromise: Promise<{ width: number, height: number }> | null = null;
    private documentLoadResolve: ((dims: { width: number, height: number }) => void) | null = null;
    private documentLoadReject: ((err: any) => void) | null = null;

    private constructor() {
        this.initWorkers();
    }

    static getInstance(): RenderPool {
        if (!RenderPool.instance) {
            RenderPool.instance = new RenderPool();
        }
        return RenderPool.instance;
    }

    private initWorkers() {
        for (let i = 0; i < this.maxWorkers; i++) {
            const worker = new Worker(new URL('../workers/pdf.worker.ts', import.meta.url), {
                type: 'module'
            });
            worker.onmessage = (e) => this.handleWorkerMessage(e, i);
            this.workers.push(worker);
        }
    }

    private handleWorkerMessage(e: MessageEvent, workerIndex: number) {
        const { type, id, bitmap, error, width, height } = e.data;

        if (type === 'DOCUMENT_LOADED') {
            this.documentLoadedCount++;
            if (this.documentLoadedCount >= this.maxWorkers && this.documentLoadResolve) {
                this.documentLoadResolve({ width, height });
                this.documentLoadResolve = null;
                this.documentLoadReject = null;
            }
        }

        if (type === 'DOCUMENT_ERROR') {
            if (this.documentLoadReject) {
                this.documentLoadReject(new Error(error));
                this.documentLoadReject = null;
            }
        }

        if (type === 'TILE_READY') {
            const job = this.jobQueue.get(id);
            if (job) {
                job.resolve(bitmap);
                this.jobQueue.delete(id);
            } else if (bitmap) {
                bitmap.close();
            }
        } else if (type === 'TILE_ERROR') {
            const job = this.jobQueue.get(id);
            if (job) {
                job.reject(new Error(error));
                this.jobQueue.delete(id);
            }
        }
    }

    public async loadDocument(url: string): Promise<{ width: number; height: number }> {
        this.documentLoadedCount = 0;
        this.documentLoadPromise = new Promise((resolve, reject) => {
            // @ts-ignore - hacking the resolve type for now
            this.documentLoadResolve = resolve;
            this.documentLoadReject = reject;
        });

        // On envoie l'URL telle quelle à tous les workers
        this.workers.forEach(worker => {
            worker.postMessage({
                type: 'LOAD_DOCUMENT',
                data: { url }
            });
        });

        return this.documentLoadPromise;
    }

    public renderTile(tile: Tile): Promise<ImageBitmap> {
        return new Promise((resolve, reject) => {
            const workerIndex = this.workerRoundRobin;
            this.workerRoundRobin = (this.workerRoundRobin + 1) % this.maxWorkers;
            const worker = this.workers[workerIndex];

            this.jobQueue.set(tile.id, { id: tile.id, resolve, reject, workerIndex });

            worker.postMessage({
                type: 'RENDER_TILE',
                data: {
                    id: tile.id,
                    pageIndex: tile.pageIndex,
                    scale: tile.lod,
                    tileRect: { x: tile.x, y: tile.y, width: tile.width, height: tile.height },
                    tileSize: { width: 256, height: 256 }
                }
            });
        });
    }

    public cancelTile(tileId: string) {
        this.jobQueue.delete(tileId);
    }
}
