/// <reference lib="webworker" />

import * as pdfjs from 'pdfjs-dist';

// Worker PDFs.js CDN
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

declare const self: DedicatedWorkerGlobalScope;

let pdfDoc: pdfjs.PDFDocumentProxy | null = null;
const pageCache = new Map<number, pdfjs.PDFPageProxy>();

console.log("Worker: Render Farm Worker v2 (ArrayBuffer mode)");

self.onmessage = async (e: MessageEvent) => {
    const { type, data } = e.data;

    if (type === 'LOAD_DOCUMENT') {
        const url = typeof data === 'string' ? data : data?.url;
        console.log("Worker: Loading document via fetch:", url);

        if (!url) {
            self.postMessage({ type: 'DOCUMENT_ERROR', error: "No URL provided" });
            return;
        }

        try {
            if (pdfDoc) {
                pdfDoc.destroy();
                pageCache.clear();
            }

            // ✅ Contournement : On fetch le PDF et on passe les données binaires
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const arrayBuffer = await response.arrayBuffer();

            console.log("Worker: Fetched", arrayBuffer.byteLength, "bytes. Now parsing...");

            // Custom CanvasFactory for Worker environment
            const canvasFactory = {
                create: function (width: number, height: number) {
                    if (width <= 0 || height <= 0) {
                        throw new Error("Invalid canvas size");
                    }
                    const canvas = new OffscreenCanvas(width, height);
                    const context = canvas.getContext("2d");
                    return { canvas, context };
                },
                reset: function (canvasAndContext: any, width: number, height: number) {
                    canvasAndContext.canvas.width = width;
                    canvasAndContext.canvas.height = height;
                },
                destroy: function (canvasAndContext: any) {
                    canvasAndContext.canvas.width = 0;
                    canvasAndContext.canvas.height = 0;
                    canvasAndContext.canvas = null;
                    canvasAndContext.context = null;
                },
            };

            // ✅ On passe l'ArrayBuffer ET la factory
            const loadingTask = pdfjs.getDocument({
                data: arrayBuffer,
                canvasFactory
            } as any);

            pdfDoc = await loadingTask.promise;

            // On récupère les dimensions de la première page pour caler le viewport
            const firstPage = await pdfDoc.getPage(1);
            const viewport = firstPage.getViewport({ scale: 1.0 });

            console.log("Worker: PDF loaded!", pdfDoc.numPages, "pages. Size:", viewport.width, "x", viewport.height);

            self.postMessage({
                type: 'DOCUMENT_LOADED',
                numPages: pdfDoc.numPages,
                width: viewport.width,
                height: viewport.height
            });
        } catch (err: any) {
            console.error('Worker: PDF Loading Error:', err);
            self.postMessage({ type: 'DOCUMENT_ERROR', error: err.message });
        }
    }

    if (type === 'RENDER_TILE') {
        if (!pdfDoc) {
            self.postMessage({ type: 'TILE_ERROR', id: data.id, error: "No document loaded" });
            return;
        }
        try {
            const bitmap = await renderTile(data);
            self.postMessage({ type: 'TILE_READY', id: data.id, bitmap }, [bitmap]);
        } catch (err: any) {
            self.postMessage({ type: 'TILE_ERROR', id: data.id, error: err.message });
        }
    }
};

async function renderTile(job: any): Promise<ImageBitmap> {
    const { pageIndex, tileRect, scale, tileSize } = job;

    let page: pdfjs.PDFPageProxy;
    if (pageCache.has(pageIndex)) {
        page = pageCache.get(pageIndex)!;
    } else {
        page = await pdfDoc!.getPage(pageIndex + 1);
        pageCache.set(pageIndex, page);
    }

    const canvas = new OffscreenCanvas(tileSize.width, tileSize.height);
    const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;

    const viewport = page.getViewport({ scale });
    const transform: [number, number, number, number, number, number] = [
        1, 0, 0, 1,
        -tileRect.x * scale,
        -tileRect.y * scale
    ];

    await page.render({
        canvasContext: ctx as any,
        viewport,
        transform
    }).promise;

    return canvas.transferToImageBitmap();
}
