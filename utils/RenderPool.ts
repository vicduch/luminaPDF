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
    private maxWorkers = navigator.hardwareConcurrency || 4;
    private workerRoundRobin = 0;

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
            // Vite worker import syntax
            const worker = new Worker(new URL('../workers/pdf.worker.ts', import.meta.url), {
                type: 'module'
            });

            worker.onmessage = (e) => this.handleWorkerMessage(e, i);
            this.workers.push(worker);
        }
    }

    private handleWorkerMessage(e: MessageEvent, workerIndex: number) {
        const { type, id, bitmap, error } = e.data;

        if (type === 'TILE_READY') {
            const job = this.jobQueue.get(id);
            if (job) {
                job.resolve(bitmap);
                this.jobQueue.delete(id);
            } else {
                // Job was cancelled or lost, close bitmap to avoid leaks
                bitmap.close();
            }
        } else if (type === 'TILE_ERROR') {
            const job = this.jobQueue.get(id);
            if (job) {
                job.reject(error);
                this.jobQueue.delete(id);
            }
        }
    }

    public renderTile(tile: Tile): Promise<ImageBitmap> {
        return new Promise((resolve, reject) => {
            // Simple Load Balancing: Round Robin
            const workerIndex = this.workerRoundRobin;
            this.workerRoundRobin = (this.workerRoundRobin + 1) % this.maxWorkers;
            const worker = this.workers[workerIndex];

            // Store job
            this.jobQueue.set(tile.id, { id: tile.id, resolve, reject, workerIndex });

            // Send to worker
            worker.postMessage({
                type: 'RENDER_TILE',
                data: {
                    id: tile.id,
                    pageIndex: tile.pageIndex,
                    scale: tile.lod,
                    tileRect: { x: tile.x, y: tile.y, width: tile.width, height: tile.height }, // Mock rect logic
                    tileSize: { width: 256, height: 256 }
                }
            });
        });
    }

    public cancelTile(tileId: string) {
        if (this.jobQueue.has(tileId)) {
            // We could send a cancel message to the worker here
            // const job = this.jobQueue.get(tileId);
            // this.workers[job.workerIndex].postMessage({ type: 'CANCEL_TILE', data: { id: tileId } });

            // Remove from queue so we ignore the result
            this.jobQueue.delete(tileId);
        }
    }
}
