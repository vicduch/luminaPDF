/**
 * pdf.worker.ts - PDF Rendering Worker Farm
 *
 * This worker handles the heavy lifting of PDF rendering.
 * Uses a custom CanvasFactory to render to OffscreenCanvas.
 *
 * Version 3.2: Using legacy build to avoid nested worker spawning issues.
 */

/// <reference lib="webworker" />

// Use the LEGACY build which doesn't try to spawn a nested worker
// This is critical for running PDF.js inside a Web Worker
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

// Set workerSrc to a valid path (required by PDF.js validation)
// but the legacy build won't actually use it since we're already in a worker
// @ts-ignore
pdfjs.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@' + pdfjs.version + '/legacy/build/pdf.worker.min.mjs';

declare const self: DedicatedWorkerGlobalScope;

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface RenderTileJob {
    id: string;
    pageIndex: number;
    tileRect: { x: number; y: number; width: number; height: number };
    scale: number;
    tileSize: { width: number; height: number };
}

interface CanvasAndContext {
    canvas: OffscreenCanvas;
    context: OffscreenCanvasRenderingContext2D | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────────────────

let pdfDoc: pdfjs.PDFDocumentProxy | null = null;
const pageCache = new Map<number, pdfjs.PDFPageProxy>();

// ─────────────────────────────────────────────────────────────────────────────
// CANVAS FACTORY (Required for OffscreenCanvas in Worker)
// ─────────────────────────────────────────────────────────────────────────────

const canvasFactory = {
    create(width: number, height: number): CanvasAndContext {
        const canvas = new OffscreenCanvas(Math.max(1, width), Math.max(1, height));
        const context = canvas.getContext('2d', { alpha: false });
        return { canvas, context: context as OffscreenCanvasRenderingContext2D };
    },

    reset(canvasAndContext: CanvasAndContext, width: number, height: number): void {
        canvasAndContext.canvas.width = Math.max(1, width);
        canvasAndContext.canvas.height = Math.max(1, height);
    },

    destroy(canvasAndContext: CanvasAndContext): void {
        canvasAndContext.canvas.width = 1;
        canvasAndContext.canvas.height = 1;
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGE HANDLER
// ─────────────────────────────────────────────────────────────────────────────

console.log('[Worker] PDF Render Worker v3.2 (Legacy Build)');

self.onmessage = async (e: MessageEvent) => {
    const { type, data } = e.data;

    try {
        switch (type) {
            case 'LOAD_DOCUMENT':
                await handleLoadDocument(data);
                break;

            case 'RENDER_TILE':
                await handleRenderTile(data as RenderTileJob);
                break;

            case 'CLEANUP':
                await cleanupDocument();
                break;
        }
    } catch (err) {
        console.error(`[Worker] Error processing ${type}:`, err);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

async function handleLoadDocument(data: any): Promise<void> {
    const url = typeof data === 'string' ? data : data?.url;
    if (!url) {
        self.postMessage({ type: 'DOCUMENT_ERROR', error: 'No URL provided' });
        return;
    }

    try {
        if (pdfDoc) await cleanupDocument();

        console.log('[Worker] Fetching PDF:', url);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        console.log('[Worker] PDF fetched, size:', (arrayBuffer.byteLength / 1024).toFixed(1), 'KB');

        // Use legacy getDocument with our canvas factory
        // @ts-ignore - typing mismatch but works at runtime
        const loadingTask = pdfjs.getDocument({
            data: arrayBuffer,
            // @ts-ignore
            canvasFactory,
            // Disable features that require DOM or extra workers
            disableFontFace: true,
            isEvalSupported: false,
            useSystemFonts: false,
        });

        pdfDoc = await loadingTask.promise;
        console.log('[Worker] PDF loaded, pages:', pdfDoc.numPages);

        // Get first page dimensions
        const firstPage = await pdfDoc.getPage(1);
        const viewport = firstPage.getViewport({ scale: 1.0 });
        const { width, height } = viewport;
        firstPage.cleanup();

        self.postMessage({
            type: 'DOCUMENT_LOADED',
            numPages: pdfDoc.numPages,
            width,
            height
        });

    } catch (err) {
        console.error('[Worker] DOCUMENT_LOAD failed:', err);
        self.postMessage({
            type: 'DOCUMENT_ERROR',
            error: err instanceof Error ? err.message : String(err)
        });
    }
}

async function handleRenderTile(job: RenderTileJob): Promise<void> {
    const { id, pageIndex, tileRect, scale, tileSize } = job;

    if (!pdfDoc) {
        self.postMessage({ type: 'TILE_ERROR', id, error: 'No document loaded' });
        return;
    }

    try {
        // Get or cache the page
        let page = pageCache.get(pageIndex);
        if (!page) {
            page = await pdfDoc.getPage(pageIndex + 1); // PDF.js uses 1-based indexing
            pageCache.set(pageIndex, page);
        }

        // Create tile canvas
        const canvas = new OffscreenCanvas(tileSize.width, tileSize.height);
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) throw new Error('Failed to get 2D context');

        // Fill with white background first
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, tileSize.width, tileSize.height);

        // Get viewport at requested scale
        const viewport = page.getViewport({ scale });

        // Calculate transform to render only the requested tile region
        const transform: [number, number, number, number, number, number] = [
            1, 0, 0, 1,
            -tileRect.x * scale,
            -tileRect.y * scale
        ];

        // Render the page
        await page.render({
            canvasContext: ctx as unknown as CanvasRenderingContext2D,
            viewport,
            transform,
            // @ts-ignore
            canvasFactory,
        }).promise;

        // Transfer the bitmap (zero-copy)
        const bitmap = canvas.transferToImageBitmap();
        self.postMessage({ type: 'TILE_READY', id, bitmap }, [bitmap]);

    } catch (err) {
        console.error(`[Worker] TILE_ERROR for ${id}:`, err);
        self.postMessage({
            type: 'TILE_ERROR',
            id,
            error: err instanceof Error ? err.message : String(err)
        });
    }
}

async function cleanupDocument(): Promise<void> {
    for (const page of pageCache.values()) {
        page.cleanup();
    }
    pageCache.clear();
    if (pdfDoc) {
        await pdfDoc.destroy();
        pdfDoc = null;
    }
    console.log('[Worker] Document cleaned up');
}
