/**
 * App.tsx - Main Application Entry Point
 *
 * Integrates the PDF rendering engine (PdfViewer)
 * with the application UI (Toolbar, AiPanel, etc.).
 *
 * Features:
 * - PDF display with Paged and Continuous modes
 * - Drag & Drop file loading
 * - Theme persistence
 */

import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { ViewMode, AppTheme, ScrollMode, Annotation, PdfMetadata } from './types';
import Toolbar, { ReaderBottomDock } from './components/Toolbar';
import PdfViewer, { PdfViewerRef } from './components/PdfViewer';
import AiPanel from './components/AiPanel';
import RecentFiles from './components/RecentFiles';
import { pdfjs } from 'react-pdf';
import { applyTheme, getThemePalette, ThemeVariant, isDarkVariant } from './utils/ThemeManager';
import { saveRecentFile, getFileMetadata, initializeStorage, getRecentFiles, getFileBlob, generateThumbnail, updateFileMetadata, RecentFileMetadata } from './services/storage';
import { getFileId } from './utils/fileFingerprint';

// Configure PDF.js worker via CDN (more reliable than local build sometimes)
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;



// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG_KEY = 'luminapdf-config-v2';

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

function App() {
    // ═══════════════════════════════════════════════════════════════════════
    // STATE MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════

    // Document State
    const [file, setFile] = useState<File | string | null>(null);
    const [currentFileId, setCurrentFileId] = useState<string | null>(null);
    const [numPages, setNumPages] = useState<number>(0);
    const [pageNumber, setPageNumber] = useState<number>(1);
    const [pdfMetadata, setPdfMetadata] = useState<PdfMetadata | null>(null);
    const [currentPageText, setCurrentPageText] = useState<string>("");
    const [recentFiles, setRecentFiles] = useState<RecentFileMetadata[]>([]);

    // UI State - Initialize theme and variant from localStorage to avoid flash
    const [theme, setTheme] = useState<AppTheme>(() => {
        try {
            const saved = localStorage.getItem(CONFIG_KEY);
            if (saved) {
                const config = JSON.parse(saved);
                if (config.theme && Object.values(AppTheme).includes(config.theme)) {
                    return config.theme;
                }
            }
        } catch (e) {
            console.warn('[App] Failed to load theme from localStorage:', e);
        }
        return AppTheme.LIGHT;
    });
    // Carte conservée pour la compatibilité du stockage.
    const [, setThemeVariants] = useState<Record<string, ThemeVariant>>(() => {
        try {
            const saved = localStorage.getItem(CONFIG_KEY);
            if (saved) {
                const config = JSON.parse(saved);
                if (config.themeVariants) {
                    return config.themeVariants;
                }
                // Migration: use legacy single variant for all themes initially
                if (config.themeVariant) {
                    // Create a default map where all themes start with the legacy variant
                    const variants: Record<string, ThemeVariant> = {};
                    Object.values(AppTheme).forEach(t => variants[t as string] = config.themeVariant);
                    return variants;
                }
            }
        } catch (e) {
            // ignore
        }
        return {}; // Default to empty, will fall back to light
    });

    const [themeVariant, setThemeVariant] = useState<ThemeVariant>(() => {
        // Le mode est global ; la carte reste un repli pour les anciennes configurations.
        try {
            const saved = localStorage.getItem(CONFIG_KEY);
            if (saved) {
                const config = JSON.parse(saved);
                if (config.themeVariant) return config.themeVariant;
                if (config.theme && config.themeVariants) {
                    return config.themeVariants[config.theme] || 'light';
                }
            }
        } catch (e) { }
        return 'light';
    });
    const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.SINGLE);
    const [scrollMode, setScrollMode] = useState<ScrollMode>(ScrollMode.PAGED);
    const [isOutlineOpen, setIsOutlineOpen] = useState<boolean>(false);
    const [isAiPanelOpen, setIsAiPanelOpen] = useState<boolean>(false);
    const [isToolbarVisible, setIsToolbarVisible] = useState<boolean>(true);
    const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

    // Annotation State
    const [isAnnotationMode, setIsAnnotationMode] = useState<boolean>(false);
    const [annotationColor, setAnnotationColor] = useState<string>('#facc15');
    const [annotations, setAnnotations] = useState<Annotation[]>([]);

    // Layout State
    const [scale, setScale] = useState<number>(1.0);
    const [containerDimensions, setContainerDimensions] = useState({ width: 0, height: 0 });
    const [pageDimensions, setPageDimensions] = useState({ width: 612, height: 792 });
    const [fitToScreenTrigger, setFitToScreenTrigger] = useState<boolean>(false);

    // Viewer Ready State (for ref synchronization)
    const [isViewerReady, setIsViewerReady] = useState<boolean>(false);

    // Drag & Drop State
    const [isDragging, setIsDragging] = useState<boolean>(false);

    // Refs
    const pdfViewerRef = useRef<PdfViewerRef>(null);
    const containerRefProxy = useRef<HTMLDivElement | null>(null);
    const contentRefProxy = useRef<HTMLDivElement | null>(null);
    const dragCounterRef = useRef<number>(0);

    const [isOpening, setIsOpening] = useState(false);
    const [storageError, setStorageError] = useState<string | null>(null);
    const [restorePage, setRestorePage] = useState<number | undefined>();
    const [restoreZoom, setRestoreZoom] = useState(false);
    const [documentSession, setDocumentSession] = useState(0);
    const openingRef = useRef(0);
    const restoredRef = useRef(false);
    const readingStateRef = useRef<{
        fileId: string; pageNumber: number; scale: number; scrollMode: ScrollMode; annotations: Annotation[]; numPages?: number;
    } | null>(null);
    const lastSavedRef = useRef('');
    const reportStorageError = useCallback(() => {
        setStorageError("Impossible d’enregistrer le document, la progression ou les notes sur cet appareil. La lecture reste possible ; conservez votre PDF et réessayez lorsque le stockage est disponible.");
    }, []);

    const flushReadingState = useCallback(() => {
        const snapshot = readingStateRef.current;
        if (!snapshot || !restoredRef.current) return;
        const signature = JSON.stringify(snapshot);
        if (signature === lastSavedRef.current) return;
        void updateFileMetadata(snapshot.fileId, {
            pageNumber: snapshot.pageNumber,
            scale: snapshot.scale,
            scrollMode: snapshot.scrollMode,
            annotations: snapshot.annotations,
            ...(snapshot.numPages ? { numPages: snapshot.numPages } : {}),
        }).then(() => {
            if (readingStateRef.current?.fileId === snapshot.fileId) lastSavedRef.current = signature;
        }).catch(reportStorageError);
    }, [reportStorageError]);

    // ═══════════════════════════════════════════════════════════════════════
    // ZOOM HANDLING (Disabled in Phase 0)
    // ═══════════════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════════════
    // HANDLERS
    // ═══════════════════════════════════════════════════════════════════════

    const handleOpenFile = useCallback(async (selectedFile: File) => {
        flushReadingState();
        const session = ++openingRef.current;
        restoredRef.current = false;
        readingStateRef.current = null;
        setStorageError(null);
        setIsOpening(true);
        setNumPages(0);
        setAnnotations([]);
        setIsAnnotationMode(false);
        let id: string | null = null;
        let existing: RecentFileMetadata | null = null;
        let canSave = true;
        await initializeStorage().catch(() => {});
        try {
            id = await getFileId(selectedFile);
            existing = await getFileMetadata(id);
        } catch {
            canSave = false; // Ne jamais remplacer une fiche dont la lecture a échoué.
            reportStorageError();
        }
        if (session !== openingRef.current) return;
        const restoredPage = existing?.pageNumber || 1;
        const restoredScale = existing?.scale || 1;
        const restoredMode = existing?.scrollMode === 'continuous' ? ScrollMode.CONTINUOUS : ScrollMode.PAGED;
        const restoredNotes = existing?.annotations || [];
        const restoredNumPages = existing?.numPages;
        const metadata: RecentFileMetadata | null = id && canSave ? {
            ...existing,
            id, name: selectedFile.name, size: selectedFile.size,
            type: selectedFile.type || 'application/pdf', lastVisited: Date.now(),
            pageNumber: restoredPage, scale: restoredScale, scrollMode: restoredMode,
            annotations: restoredNotes,
            ...(restoredNumPages ? { numPages: restoredNumPages } : {}),
        } : null;
        // Les états du nouveau document sont publiés ensemble, après la lecture de sa fiche.
        setFile(selectedFile);
        setIsOpening(false);
        setNumPages(0);
        setIsViewerReady(false);
        setCurrentFileId(canSave ? id : null);
        setPageNumber(restoredPage);
        setScale(restoredScale);
        setScrollMode(restoredMode);
        setAnnotations(restoredNotes);
        setRestoreZoom(!!existing);
        setRestorePage(restoredPage);
        setDocumentSession(session);
        lastSavedRef.current = JSON.stringify({
            fileId: id,
            pageNumber: restoredPage,
            scale: restoredScale,
            scrollMode: restoredMode,
            annotations: restoredNotes,
            ...(restoredNumPages ? { numPages: restoredNumPages } : {}),
        });
        if (metadata) {
            setRecentFiles(prev => [metadata, ...prev.filter(f => f.id !== metadata.id)]);
            try {
                await saveRecentFile(selectedFile, metadata);
                if (!metadata.thumbnail) {
                    const thumbnail = await generateThumbnail(selectedFile);
                    if (thumbnail) await updateFileMetadata(metadata.id, { thumbnail, lastVisited: metadata.lastVisited });
                }
            } catch {
                reportStorageError();
            }
        }
    }, [flushReadingState, reportStorageError]);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) void handleOpenFile(selectedFile);
        e.target.value = '';
    }, [handleOpenFile]);

    const handleRestored = useCallback(() => {
        restoredRef.current = true;
        setRestorePage(undefined);
    }, []);

    const handleOpenRecentFile = useCallback(async (fileId: string) => {
        try {
            const blob = await getFileBlob(fileId);
            if (blob) {
                // Find name from recentFiles state
                const meta = recentFiles.find(f => f.id === fileId);
                const name = meta?.name || fileId;
                const file = new File([blob], name, { type: blob.type || 'application/pdf' });
                void handleOpenFile(file);
            } else {
                console.warn('[App] File blob not found for:', fileId);
            }
        } catch (err) {
            console.error('[App] Failed to open recent file:', err);
        }
    }, [handleOpenFile, recentFiles]);
    const handleFitToWidth = useCallback(() => {
        pdfViewerRef.current?.fitPage();
    }, []);

    const handleDocumentLoaded = useCallback((data: { numPages: number }) => {
        setNumPages(data.numPages);
    }, []);

    const handleNavigate = useCallback((page: number) => {
        pdfViewerRef.current?.scrollToPage(page);
    }, []);

    const handleContainerDimensions = useCallback((dims: { width: number; height: number }) => {
        setContainerDimensions(dims);

        // Synchronize proxy refs with actual PdfViewer refs
        if (pdfViewerRef.current) {
            containerRefProxy.current = pdfViewerRef.current.containerRef ? pdfViewerRef.current.containerRef.current : null;
            contentRefProxy.current = pdfViewerRef.current.contentRef ? pdfViewerRef.current.contentRef.current : null;

            if (!isViewerReady && containerRefProxy.current && contentRefProxy.current) {
                setIsViewerReady(true);
            }
        }
    }, [isViewerReady]);

    const handleToggleVariant = useCallback(() => {
        setThemeVariant(prev => {
            const next = prev === 'light' ? 'dark' : 'light';
            // Sync with persistent variant map
            setThemeVariants(v => ({ ...v, [theme]: next }));
            return next;
        });
    }, [theme]);

    const handleCycleTheme = useCallback(() => {
        const themes = [
            AppTheme.LIGHT,
            AppTheme.SOLARIZED,
            AppTheme.SEPIA,
            AppTheme.FOREST,
            AppTheme.MIDNIGHT,
            AppTheme.DARK,
            AppTheme.BLUE_NIGHT,
            AppTheme.OLED,
            AppTheme.EINK,
        ];
        const currentIndex = themes.indexOf(theme);
        const nextIndex = (currentIndex + 1) % themes.length;
        const nextTheme = themes[nextIndex];

        setTheme(nextTheme);
    }, [theme]);

    // Annotation Handlers
    const handleAddAnnotation = useCallback((page: number, x: number, y: number) => {
        const newAnnotation: Annotation = {
            id: globalThis.crypto?.randomUUID?.() || `note-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            pageNumber: page,
            x,
            y,
            text: '',
            color: annotationColor,
            createdAt: Date.now()
        };
        setAnnotations(prev => [...prev, newAnnotation]);
        setIsAnnotationMode(false);
    }, [annotationColor]);

    const handleUpdateAnnotation = useCallback((id: string, text: string, color?: string) => {
        setAnnotations(prev => prev.map(a =>
            a.id === id ? { ...a, text, color: color || a.color } : a
        ));
    }, []);

    const handleDeleteAnnotation = useCallback((id: string) => {
        setAnnotations(prev => prev.filter(a => a.id !== id));
    }, []);

    // ═══════════════════════════════════════════════════════════════════════
    // DRAG & DROP HANDLERS
    // ═══════════════════════════════════════════════════════════════════════

    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current++;

        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            const item = e.dataTransfer.items[0];
            if (item.kind === 'file' && item.type === 'application/pdf') {
                setIsDragging(true);
            }
        }
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current--;

        if (dragCounterRef.current === 0) {
            setIsDragging(false);
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        setIsDragging(false);
        dragCounterRef.current = 0;

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            const droppedFile = files[0];
            if (droppedFile.type === 'application/pdf') {
                handleOpenFile(droppedFile);
            }
        }
    }, [handleOpenFile]);

    // ═══════════════════════════════════════════════════════════════════════
    // PERSISTENCE & INIT
    // ═══════════════════════════════════════════════════════════════════════

    // Apply theme on mount (after initial useState reads from localStorage)
    useEffect(() => {
        applyTheme(theme, themeVariant);
        const palette = getThemePalette(theme, themeVariant);
        document.body.style.backgroundColor = palette.appBg;
    }, []); // Run once on mount

    // Load recent files on mount and when returning to home
    useEffect(() => {
        initializeStorage().catch(() => {}).then(() => getRecentFiles()).then(setRecentFiles).catch(() => {});
    }, [file]); // Refresh when file changes (including back to null = home)

    // Enregistrer l'ambiance et le mode global, puis appliquer leurs couleurs.
    useEffect(() => {
        setThemeVariants(prev => {
            const next = { ...prev, [theme]: themeVariant };

            // Persist entire config
            try {
                localStorage.setItem(CONFIG_KEY, JSON.stringify({
                    theme,
                    themeVariant, // Mode global
                    themeVariants: next
                }));
            } catch (e) { console.warn('Failed to save theme config', e); }

            return next;
        });

        // Apply theme CSS custom properties
        applyTheme(theme, themeVariant);

        // Update body background using the theme palette
        const palette = getThemePalette(theme, themeVariant);
        document.body.style.backgroundColor = palette.appBg;
    }, [themeVariant, theme]); // Note: added 'theme' dependency to ensure we save correct pair

    // La restauration et l'identité font partie du même instantané ; aucun état provisoire n'est écrit.
    useLayoutEffect(() => {
        if (!file || !currentFileId || restorePage !== undefined || !restoredRef.current) return;
        readingStateRef.current = {
            fileId: currentFileId,
            pageNumber,
            scale,
            scrollMode,
            annotations,
            ...(numPages > 0 ? { numPages } : {}),
        };
    }, [file, currentFileId, restorePage, pageNumber, scale, scrollMode, annotations, numPages]);

    useEffect(() => {
        if (!currentFileId || numPages <= 0) return;
        setRecentFiles(prev => {
            const current = prev.find(item => item.id === currentFileId);
            if (!current || current.numPages === numPages) return prev;
            return prev.map(item => item.id === currentFileId ? { ...item, numPages } : item);
        });
    }, [currentFileId, numPages]);

    useEffect(() => {
        if (navigator.storage?.persist) void navigator.storage.persist().catch(() => {});
        const interval = setInterval(flushReadingState, 3000);
        const handleHidden = () => {
            if (document.visibilityState === 'hidden') flushReadingState();
        };
        document.addEventListener('visibilitychange', handleHidden);
        window.addEventListener('pagehide', flushReadingState);
        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleHidden);
            window.removeEventListener('pagehide', flushReadingState);
        };
    }, [flushReadingState]);

    // ═══════════════════════════════════════════════════════════════════════
    // KEYBOARD SHORTCUTS
    // ═══════════════════════════════════════════════════════════════════════

    // Sync fullscreen state with browser (handles Escape, F11, etc.)
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Préserver la saisie et les touches déjà traitées par les contrôles locaux.
            const target = e.target as HTMLElement;
            if (e.defaultPrevented || target.closest('input, textarea, select') || target.isContentEditable) return;

            // ── Page Navigation (unified behavior: paged and continuous) ──
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
                e.preventDefault();
                if (!file || numPages === 0) return;
                handleNavigate(Math.max(1, pageNumber - 1));
                return;
            }

            if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') {
                e.preventDefault();
                if (!file || numPages === 0) return;
                handleNavigate(Math.min(numPages, pageNumber + 1));
                return;
            }

            // Home / End — Jump to first / last page
            if (e.key === 'Home') {
                e.preventDefault();
                if (!file || numPages === 0) return;
                handleNavigate(1);
                return;
            }
            if (e.key === 'End') {
                e.preventDefault();
                if (!file || numPages === 0) return;
                handleNavigate(numPages);
                return;
            }

            // ── Fullscreen toggle (F) ──
            if (e.key === 'f' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().catch(() => { });
                } else {
                    document.exitFullscreen().catch(() => { });
                }
                return;
            }

            // ── Scroll mode toggle (C) ──
            if (e.key === 'c' && !e.ctrlKey && !e.metaKey) {
                setScrollMode(prev => prev === ScrollMode.PAGED ? ScrollMode.CONTINUOUS : ScrollMode.PAGED);
                return;
            }

            // ── Toolbar visibility (H) ──
            if (e.key === 'h' && !e.ctrlKey && !e.metaKey) {
                setIsToolbarVisible(prev => !prev);
                return;
            }

            // ── Zoom In / Out (+/-) ──
            if (e.key === '+' || e.key === '=') {
                e.preventDefault();
                setScale(prev => Math.min(8.0, prev * 1.25));
                return;
            }
            if (e.key === '-' || e.key === '_') {
                e.preventDefault();
                setScale(prev => Math.max(0.1, prev / 1.25));
                return;
            }

            // ── Fit to screen (0 or W)──
            if (e.key === '0' || (e.key === 'w' && !e.ctrlKey && !e.metaKey)) {
                e.preventDefault();
                handleFitToWidth();
                return;
            }

            // ── Toggle theme variant (V or D) ──
            if ((e.key === 'v' || e.key === 'd') && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                handleToggleVariant();
                return;
            }

            // ── Cycle Application Themes (T) ──
            if (e.key === 't' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                handleCycleTheme();
                return;
            }

            // ── Toggle Outline (L) ──
            if (e.key === 'l' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                setIsOutlineOpen(prev => !prev);
                return;
            }

            // ── Toggle AI Panel (S) ──
            if (e.key === 's' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                setIsAiPanelOpen(prev => !prev);
                return;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [file, numPages, pageNumber, scrollMode, handleNavigate, handleFitToWidth, handleToggleVariant, handleCycleTheme]);

    // ═══════════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════════

    return (
        <div
            className={`
        lumina-app relative flex flex-col h-[100dvh] w-full overflow-hidden transition-colors duration-200
        ${isDarkVariant(themeVariant) ? 'dark' : ''}
        bg-[var(--lumina-bg)]
      `}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >

            {storageError && <div role="alert" className="flex-none p-3 bg-[var(--lumina-bg-secondary)] text-[var(--lumina-text)] border-b border-[var(--lumina-border)]">{storageError}</div>}

            {/* 2. Main Workspace */}
            <div className="flex-1 relative overflow-hidden">
                {!file ? (
                    <RecentFiles
                        onFileSelect={handleOpenFile}
                        knownFiles={recentFiles}
                        onFilesChange={setRecentFiles}
                        theme={theme}
                        themeVariant={themeVariant}
                        setTheme={setTheme}
                        setThemeVariant={setThemeVariant}
                    />
                ) : (
                    <div className="w-full h-full relative flex flex-row">
                        <div className="reader-workspace flex-1 min-w-0 relative h-full overflow-hidden">
                            <div className="absolute inset-x-0 top-0">
                                {/* Floating button to restore toolbar when hidden */}
                                {!isToolbarVisible && (
                                    <button
                                        onClick={() => setIsToolbarVisible(true)}
                                        className="reader-restore absolute top-0 left-1/2 -translate-x-1/2 z-50"
                                        style={{
                                            backgroundColor: 'var(--lumina-bg-secondary)',
                                            borderLeft: '1px solid var(--lumina-border)',
                                            borderRight: '1px solid var(--lumina-border)',
                                            borderBottom: '1px solid var(--lumina-border)',
                                        }}
                                        aria-label="Afficher la barre de lecture"
                                        title="Afficher la barre d'outils (H)"
                                    >
                                        <svg width="16" height="8" viewBox="0 0 16 8" fill="none">
                                            <path d="M2 2L8 6L14 2" stroke="var(--lumina-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </button>
                                )}
                                <Toolbar
                                    file={file}
                                    numPages={numPages}
                                    pageNumber={pageNumber}
                                    scale={scale}
                                    theme={theme}
                                    viewMode={viewMode}
                                    scrollMode={scrollMode}
                                    isFullscreen={isFullscreen}
                                    isVisible={isToolbarVisible}
                                    isOutlineOpen={isOutlineOpen}
                                    isAnnotationMode={isAnnotationMode}
                                    annotationColor={annotationColor}
                                    setPageNumber={handleNavigate}
                                    setScale={setScale}
                                    onFitToWidth={handleFitToWidth}
                                    setTheme={setTheme}
                                    themeVariant={themeVariant}
                                    setThemeVariant={setThemeVariant}
                                    setViewMode={setViewMode}
                                    setScrollMode={setScrollMode}
                                    setAnnotationColor={setAnnotationColor}
                                    toggleFullscreen={() => {
                                        if (!document.fullscreenElement) {
                                            document.documentElement.requestFullscreen();
                                            setIsFullscreen(true);
                                        } else {
                                            document.exitFullscreen();
                                            setIsFullscreen(false);
                                        }
                                    }}
                                    toggleOutline={() => setIsOutlineOpen(!isOutlineOpen)}
                                    toggleAnnotationMode={() => setIsAnnotationMode(!isAnnotationMode)}
                                    onFileChange={handleFileChange}
                                    toggleAiPanel={() => setIsAiPanelOpen(!isAiPanelOpen)}
                                    toggleVisibility={() => setIsToolbarVisible(!isToolbarVisible)}
                                    onHome={() => {
                                        flushReadingState();
                                        ++openingRef.current;
                                        restoredRef.current = false;
                                        readingStateRef.current = null;
                                        setFile(null);
                                        setIsOpening(false);
                                        setCurrentFileId(null);
                                        setAnnotations([]);
                                        setIsViewerReady(false);
                                    }}
                                    recentFiles={recentFiles.slice(0, 5).map(f => ({ id: f.id, name: f.name, lastVisited: f.lastVisited, pageNumber: f.pageNumber, numPages: f.numPages }))}
                                    onOpenRecentFile={handleOpenRecentFile}
                                />
                            </div>
                            {isOpening ? <p className="p-10" role="status">Ouverture du document...</p> : <PdfViewer
                                key={documentSession}
                                restorePage={restorePage}
                                restoreZoom={restoreZoom}
                                onRestored={handleRestored}
                                ref={pdfViewerRef}
                                file={file}
                                numPages={numPages}
                                pageNumber={pageNumber}
                                setPageNumber={setPageNumber}
                                scale={scale}
                                scrollMode={scrollMode}
                                theme={theme}
                                themeVariant={themeVariant}
                                annotations={annotations}
                                isAnnotationMode={isAnnotationMode}
                                annotationColor={annotationColor}
                                onAddAnnotation={handleAddAnnotation}
                                onUpdateAnnotation={handleUpdateAnnotation}
                                onDeleteAnnotation={handleDeleteAnnotation}
                                onLoadSuccess={handleDocumentLoaded}
                                onPageDimensions={setPageDimensions}
                                onContainerDimensions={handleContainerDimensions}
                                onScaleChange={setScale}
                                isOutlineOpen={isOutlineOpen}
                                onToggleOutline={() => setIsOutlineOpen(!isOutlineOpen)}
                                onToggleToolbar={() => setIsToolbarVisible(prev => !prev)}
                            />}
                            <ReaderBottomDock
                                numPages={numPages}
                                pageNumber={pageNumber}
                                isVisible={isToolbarVisible}
                                setPageNumber={handleNavigate}
                            />
                        </div>

                        <div style={{ display: isAiPanelOpen ? 'contents' : 'none' }}>
                            <AiPanel
                                isOpen={isAiPanelOpen}
                                onClose={() => setIsAiPanelOpen(false)}
                                currentPageText={currentPageText}
                                pdfMetadata={pdfMetadata}
                                theme={theme}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* 3. Drag & Drop Overlay */}
            <div
                className={`
          absolute inset-0 pointer-events-none z-50 transition-opacity duration-200
          ${isDragging ? 'opacity-100' : 'opacity-0'}
        `}
            >
                <div className="w-full h-full bg-blue-500/20 border-4 border-blue-500 border-dashed flex items-center justify-center">
                    <p className="text-3xl font-bold p-4 import-overlay-label">
                        Déposez votre PDF ici
                    </p>
                </div>
            </div>
        </div>
    );
}

export default App;
