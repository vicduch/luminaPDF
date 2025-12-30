/// <reference lib="webworker" />

// Mock PDFjS types for now if not available globally
declare const self: DedicatedWorkerGlobalScope;

// In a real implementation, we would import pdfjs
// import * as pdfjs from 'pdfjs-dist';

interface RenderJob {
    id: string;
    pdfUrl?: string; // For now we might just Mock
    pageIndex: number; // 0-based
    tileRect: { x: number; y: number; width: number; height: number }; // Viewport within the page
    scale: number; // Resolution scale (LOD)
    tileSize: { width: number; height: number }; // Output size (256x256)
}

// Map to store active render tasks for cancellation (if using real PDF.js)
// const activeTasks = new Map<string, pdfjs.RenderTask>();

self.onmessage = async (e: MessageEvent) => {
    const { type, data } = e.data;

    if (type === 'RENDER_TILE') {
        const job = data as RenderJob;
        try {
            const bitmap = await renderTileMock(job);

            // Transfer the bitmap back to main thread (Zero copy)
            self.postMessage(
                { type: 'TILE_READY', id: job.id, bitmap },
                [bitmap]
            );
        } catch (err) {
            console.error('Worker Render Error', err);
            self.postMessage({ type: 'TILE_ERROR', id: job.id, error: err });
        }
    }

    if (type === 'CANCEL_TILE') {
        // Implement cancellation logic
        // if (activeTasks.has(data.id)) { activeTasks.get(data.id).cancel(); }
    }
};

/**
 * Mock Rendering Function (Simulating PDF.js)
 * Draws a generated pattern to an OffscreenCanvas
 */
async function renderTileMock(job: RenderJob): Promise<ImageBitmap> {
    const { tileSize, scale, pageIndex, tileRect } = job;

    // 1. Create OffscreenCanvas
    const canvas = new OffscreenCanvas(tileSize.width, tileSize.height);
    const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D; // Type assertion

    if (!ctx) throw new Error("Could not get context");

    // 2. Simulate heavy work (PDF Rasterization)
    // await new Promise(resolve => setTimeout(resolve, Math.random() * 200 + 50)); // Random latency 50-250ms

    // 3. Draw Debug Pattern

    // Background
    ctx.fillStyle = pageIndex % 2 === 0 ? '#ffffff' : '#f8f9fa';
    ctx.fillRect(0, 0, tileSize.width, tileSize.height);

    // Grid lines
    ctx.strokeStyle = '#e9ecef';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, tileSize.width, tileSize.height);

    // Text Info
    ctx.fillStyle = '#495057';
    ctx.font = '14px sans-serif';
    ctx.fillText(`LOD: ${scale.toFixed(2)}`, 10, 20);
    ctx.fillText(`Tile View: ${tileRect.x.toFixed(0)}, ${tileRect.y.toFixed(0)}`, 10, 40);

    // Visual Circle to prove it's a bitmap
    ctx.beginPath();
    ctx.arc(tileSize.width / 2, tileSize.height / 2, 20 * scale, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${(tileRect.x + tileRect.y) % 360}, 70%, 60%)`;
    ctx.fill();

    // 4. Return Bitmap
    return canvas.transferToImageBitmap();
}
