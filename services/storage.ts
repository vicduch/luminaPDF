import { Annotation } from '../types';

export interface RecentFileMetadata {
    id: string;
    name: string;
    size: number;
    type: string;
    lastVisited: number;
    pageNumber: number;
    annotations: Annotation[];
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
