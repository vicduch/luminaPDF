import { Annotation } from '../types';

export interface RecentFileMetadata {
    id: string;
    name: string;
    size: number;
    type: string;
    lastVisited: number;
    pageNumber: number;
    scale?: number;
    scrollPosition?: { x: number; y: number };
    scrollMode?: 'paged' | 'continuous';
    annotations: Annotation[];
    thumbnail?: string; // data URL of first page preview
}

const DB_NAME = 'LuminaDB';
const DB_VERSION = 1;
const STORE_FILES = 'files'; // Stores { id, blob }
const STORE_META = 'metadata'; // Stores RecentFileMetadata

let dbPromise: Promise<IDBDatabase> | null = null;

const openDB = (): Promise<IDBDatabase> => {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error("IndexedDB error:", request.error);
            reject(request.error);
        };

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_FILES)) {
                db.createObjectStore(STORE_FILES, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(STORE_META)) {
                const store = db.createObjectStore(STORE_META, { keyPath: 'id' });
                store.createIndex('lastVisited', 'lastVisited', { unique: false });
            }
        };
    });

    return dbPromise;
};

export const saveRecentFile = async (file: File, metadata: RecentFileMetadata): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_FILES, STORE_META], 'readwrite');

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);

        const filesStore = transaction.objectStore(STORE_FILES);
        const metaStore = transaction.objectStore(STORE_META);

        filesStore.put({ id: metadata.id, blob: file });
        metaStore.put(metadata);
    });
};

export const updateFileMetadata = async (id: string, updates: Partial<RecentFileMetadata>): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_META], 'readwrite');
        const store = transaction.objectStore(STORE_META);

        const request = store.get(id);

        request.onsuccess = () => {
            const data = request.result as RecentFileMetadata;
            if (data) {
                const updated = { ...data, ...updates, lastVisited: Date.now() }; // Always bump lastVisited on update? Maybe not if just auto-saving page. 
                // Actually, if we are reading it, we probably want to bump it, but let's stick to explicit updates.
                // If updates contains lastVisited, it will override.
                // Let's ensure lastVisited is updated if not provided, to keep it at top of recents? 
                // User might be just lurking, but usually yes.
                // Let's respect what's passed or default to now if not passed? 
                // Actually, let's keep it simple: just merge.
                store.put(updated);
            }
        };

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
};

export const getRecentFiles = async (): Promise<RecentFileMetadata[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_META], 'readonly');
        const store = transaction.objectStore(STORE_META);
        const index = store.index('lastVisited');

        const request = index.getAll();

        request.onsuccess = () => {
            // IDB sorts ascending (oldest first). We want descending (newest first).
            const results = (request.result as RecentFileMetadata[]).reverse();
            resolve(results);
        };

        request.onerror = () => reject(request.error);
    });
};

export const getFileBlob = async (id: string): Promise<Blob | null> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_FILES], 'readonly');
        const store = transaction.objectStore(STORE_FILES);
        const request = store.get(id);

        request.onsuccess = () => {
            resolve(request.result ? request.result.blob : null);
        };

        request.onerror = () => reject(request.error);
    });
};

export const deleteRecentFile = async (id: string): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_FILES, STORE_META], 'readwrite');
        transaction.objectStore(STORE_FILES).delete(id);
        transaction.objectStore(STORE_META).delete(id);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// READING POSITION PERSISTENCE
// ─────────────────────────────────────────────────────────────────────────────

export interface ReadingPosition {
    pageNumber: number;
    scale: number;
    scrollPosition?: { x: number; y: number };
    scrollMode?: 'paged' | 'continuous';
}

/**
 * Save reading position for a file (debounced call recommended)
 */
export const saveReadingPosition = async (
    fileId: string,
    position: ReadingPosition
): Promise<void> => {
    await updateFileMetadata(fileId, {
        pageNumber: position.pageNumber,
        scale: position.scale,
        scrollPosition: position.scrollPosition,
        scrollMode: position.scrollMode,
        lastVisited: Date.now()
    });
};

/**
 * Get reading position for a file
 */
export const getReadingPosition = async (
    fileId: string
): Promise<ReadingPosition | null> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_META], 'readonly');
        const store = transaction.objectStore(STORE_META);
        const request = store.get(fileId);

        request.onsuccess = () => {
            const data = request.result as RecentFileMetadata | undefined;
            if (data) {
                resolve({
                    pageNumber: data.pageNumber || 1,
                    scale: data.scale || 1.0,
                    scrollPosition: data.scrollPosition,
                    scrollMode: data.scrollMode
                });
            } else {
                resolve(null);
            }
        };

        request.onerror = () => reject(request.error);
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// THUMBNAIL GENERATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render page 1 of a PDF file to a small canvas and return as a JPEG data URL.
 * Uses PDF.js directly (no React). Safe to call from any context.
 */
export const generateThumbnail = async (file: File, maxWidth = 200): Promise<string | undefined> => {
    try {
        const pdfjsLib = await import('pdfjs-dist');
        const { getDocument, GlobalWorkerOptions } = pdfjsLib;

        // Ensure the worker is configured
        if (!GlobalWorkerOptions.workerSrc) {
            const pdfjsVersion = pdfjsLib.version;
            GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsVersion}/pdf.worker.min.mjs`;
        }

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);

        const unscaledViewport = page.getViewport({ scale: 1 });
        const thumbScale = maxWidth / unscaledViewport.width;
        const viewport = page.getViewport({ scale: thumbScale });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return undefined;

        await page.render({ canvasContext: ctx, viewport }).promise;
        const dataUrl = canvas.toDataURL('image/jpeg', 0.75);

        pdf.destroy();
        return dataUrl;
    } catch (err) {
        console.warn('[storage] Failed to generate thumbnail:', err);
        return undefined;
    }
};
