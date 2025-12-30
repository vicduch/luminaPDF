/**
 * pdf.worker.ts - PDF Rendering Worker Farm
 *
 * This worker handles the heavy lifting of PDF rendering.
 * It uses a custom CanvasFactory to render to OffscreenCanvas.
 *
 * Version 3.1: Added DOM Shim to prevent "createElement" errors.
 */

/// <reference lib="webworker" />

import * as pdfjs from 'pdfjs-dist';

// ✅ CRITICAL: PDF.js needs to know where its internal worker is, even when we are inside a custom worker.
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// ─────────────────────────────────────────────────────────────────────────────
// DOM SHIM
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PDF.js (even on the API side) sometimes tries to access the DOM for:
 * 1. Creating temporary canvases for pattern/image processing
 * 2. Font loading and measurements
 * Since Workers don't have a DOM, we provide a minimal shim.
 */
if (typeof self !== 'undefined' && !(self as any).document) {
    (self as any).document = {
        createElement: (name: string) => {
            if (name === 'canvas') {
                return new OffscreenCanvas(1, 1);
            }
            return {
                style: {},
                appendChild: () => { },
                removeChild: () => { },
                setAttribute: () => { },
                getAttribute: () => null,
            };
        },
        documentElement: {
            style: {}
        },
        getElementsByTagName: () => [],
    };
}

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
// CANVAS FACTORY
// ─────────────────────────────────────────────────────────────────────────────

const canvasFactory: any = {
    create(width: number, height: number): CanvasAndContext {
        const canvas = new OffscreenCanvas(Math.max(1, width), Math.max(1, height));
        const context = canvas.getContext('2d', { alpha: false }); // Performance: Opaque
        return { canvas, context: context as any };
    },

    reset(canvasAndContext: CanvasAndContext, width: number, height: number): void {
        canvasAndContext.canvas.width = Math.max(1, width);
        canvasAndContext.canvas.height = Math.max(1, height);
    },

    destroy(canvasAndContext: CanvasAndContext): void {
        canvasAndContext.canvas.width = 1;
        canvasAndContext.canvas.height = 1;
        (canvasAndContext as any).canvas = null;
        (canvasAndContext as any).context = null;
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGE HANDLER
// ─────────────────────────────────────────────────────────────────────────────

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
    if (!url) return;

    try {
        if (pdfDoc) await cleanupDocument();

        console.log('[Worker] Fetching PDF:', url);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();

        const loadingTask = pdfjs.getDocument({
            data: arrayBuffer,
            canvasFactory,
            // Optimization for workers
            stopAtErrors: false,
            isEvalAndContextCanBeTainted: true,
        } as any);

        pdfDoc = await loadingTask.promise;

        // Get first page to find dimensions
        const firstPage = await pdfDoc.getPage(1);
        const viewport = firstPage.getViewport({ scale: 1.0 });
        const { width, height } = viewport;

        // Immediate cleanup of reference page
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
    if (!pdfDoc) return;

    try {
        let page = pageCache.get(pageIndex);
        if (!page) {
            page = await pdfDoc.getPage(pageIndex + 1);
            pageCache.set(pageIndex, page);
        }

        const canvas = new OffscreenCanvas(tileSize.width, tileSize.height);
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) throw new Error('Failed to get 2D context');

        const viewport = page.getViewport({ scale });

        // Calculate transform to render only the requested tile
        const transform: [number, number, number, number, number, number] = [
            1, 0, 0, 1,
            -tileRect.x * scale,
            -tileRect.y * scale
        ];

        await page.render({
            canvasContext: ctx as any,
            viewport,
            transform,
            canvasFactory, // Pass factory here too for safety
        } as any).promise;

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
}
