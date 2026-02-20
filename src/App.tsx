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

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ViewMode, AppTheme, ScrollMode, Annotation, PdfMetadata } from './types';
import Toolbar from './components/Toolbar';
import PdfViewer, { PdfViewerRef } from './components/PdfViewer';
import AiPanel from './components/AiPanel';
import RecentFiles from './components/RecentFiles';
import ReadingProgressBar from './components/ReadingProgressBar';
import { pdfjs } from 'react-pdf';
import { applyTheme, getThemePalette, ThemeVariant, isDarkVariant } from './utils/ThemeManager';
import { saveRecentFile, saveReadingPosition, getReadingPosition, getRecentFiles, getFileBlob, generateThumbnail, updateFileMetadata, RecentFileMetadata } from './services/storage';

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
    // [D-002] Variant Persistence Map
    const [themeVariants, setThemeVariants] = useState<Record<string, ThemeVariant>>(() => {
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
        // Initial variant depends on current theme
        // We can't access 'theme' state here easily in initializer as it might not be initialized if we don't rely on order.
        // Actually we can read from localStorage again or just use a default. 
        // Better to sync it in an effect or derive it? 
        // We keep this state for easy access, but it should be synced with themeVariants[theme]
        try {
            const saved = localStorage.getItem(CONFIG_KEY);
            if (saved) {
                const config = JSON.parse(saved);
                if (config.theme && config.themeVariants) {
                    return config.themeVariants[config.theme] || 'light';
                }
                if (config.themeVariant) return config.themeVariant;
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

    // ═══════════════════════════════════════════════════════════════════════
    // ZOOM HANDLING (Disabled in Phase 0)
    // ═══════════════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════════════
    // HANDLERS
    // ═══════════════════════════════════════════════════════════════════════

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];
            const fileId = selectedFile.name;
            setFile(selectedFile);
            setCurrentFileId(fileId);
            setPageNumber(1);
            setScale(1.0);
            setIsViewerReady(false);

            // Persist to recent files (generate thumbnail async)
            const metadata: RecentFileMetadata = {
                id: fileId,
                name: selectedFile.name,
                size: selectedFile.size,
                type: selectedFile.type || 'application/pdf',
                lastVisited: Date.now(),
                pageNumber: 1,
                scale: 1.0,
                annotations: [],
            };
            saveRecentFile(selectedFile, metadata).then(async () => {
                // Generate thumbnail in the background (non-blocking)
                const thumb = await generateThumbnail(selectedFile);
                if (thumb) {
                    updateFileMetadata(fileId, { thumbnail: thumb }).catch(() => { });
                }
            }).catch(err =>
                console.warn('[App] Failed to save recent file:', err)
            );
        }
    }, []);

    const handleOpenFile = useCallback(async (fileOrUrl: File | string, fileId?: string) => {
        setFile(fileOrUrl);
        setIsViewerReady(false);

        // Set file ID for position tracking
        const id = fileId || (typeof fileOrUrl === 'string' ? fileOrUrl : fileOrUrl.name);
        setCurrentFileId(id);

        // 1. Restore reading position FIRST (before any overwrite)
        let restoredPage = 1;
        let restoredScale = 1.0;
        let restoredScrollMode: ScrollMode | null = null;
        let hasRestoredPosition = false;

        if (id) {
            try {
                const savedPosition = await getReadingPosition(id);
                if (savedPosition) {
                    restoredPage = savedPosition.pageNumber;
                    restoredScale = savedPosition.scale;
                    if (savedPosition.scrollMode) {
                        restoredScrollMode = savedPosition.scrollMode === 'continuous' ? ScrollMode.CONTINUOUS : ScrollMode.PAGED;
                    }
                    hasRestoredPosition = true;
                    console.log('[App] Restored reading position:', savedPosition);
                }
            } catch (err) {
                console.warn('[App] Failed to restore reading position:', err);
            }
        }

        // 2. Apply restored (or default) position
        setPageNumber(restoredPage);
        setScale(restoredScale);
        if (restoredScrollMode !== null) {
            setScrollMode(restoredScrollMode);
        }

        // 3. Persist File objects to recent files (preserving position data)
        if (typeof fileOrUrl !== 'string' && fileOrUrl instanceof File) {
            const metadata: RecentFileMetadata = {
                id,
                name: fileOrUrl.name,
                size: fileOrUrl.size,
                type: fileOrUrl.type || 'application/pdf',
                lastVisited: Date.now(),
                pageNumber: restoredPage,
                scale: restoredScale,
                annotations: [],
            };
            saveRecentFile(fileOrUrl, metadata).then(async () => {
                // Generate thumbnail if not already present
                const existing = recentFiles.find(f => f.id === id);
                if (!existing?.thumbnail) {
                    const thumb = await generateThumbnail(fileOrUrl as File);
                    if (thumb) {
                        updateFileMetadata(id, { thumbnail: thumb }).catch(() => { });
                    }
                }
            }).catch(err =>
                console.warn('[App] Failed to save recent file:', err)
            );
        }
    }, []);

    const handleOpenRecentFile = useCallback(async (fileId: string) => {
        try {
            const blob = await getFileBlob(fileId);
            if (blob) {
                // Find name from recentFiles state
                const meta = recentFiles.find(f => f.id === fileId);
                const name = meta?.name || fileId;
                const file = new File([blob], name, { type: blob.type || 'application/pdf' });
                handleOpenFile(file, fileId);
            } else {
                console.warn('[App] File blob not found for:', fileId);
            }
        } catch (err) {
            console.error('[App] Failed to open recent file:', err);
        }
    }, [handleOpenFile, recentFiles]);
    const handleFitToWidth = useCallback(() => {
        if (containerDimensions.width && containerDimensions.height && pageDimensions.width && pageDimensions.height) {
            // Mobile detection inside handleFitToWidth
            const isMobileOS = /Android/i.test(navigator.userAgent) || /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

            const margin = isMobileOS ? 0 : 16;
            const fitWidth = (containerDimensions.width - margin) / pageDimensions.width;
            const fitHeight = (containerDimensions.height - margin) / pageDimensions.height;
            const targetScale = Math.min(fitWidth, fitHeight);
            setScale(targetScale);

            // Reposition after scale update:
            // continuous -> keep current page in view
            // paged -> force recenter to the middle of the document
            requestAnimationFrame(() => requestAnimationFrame(() => {
                if (scrollMode === ScrollMode.CONTINUOUS && pdfViewerRef.current) {
                    pdfViewerRef.current.scrollToPage(pageNumber);
                    return;
                }

                const container = pdfViewerRef.current?.containerRef?.current;
                const content = pdfViewerRef.current?.contentRef?.current;

                if (container && content) {
                    const docWidth = content.scrollWidth * targetScale;
                    const docHeight = content.scrollHeight * targetScale;

                    // The document origin is shifted by the 100vw/100dvh padding
                    // Extract the actual DOM offsets just like the Aiming Engine does
                    const camera = container.querySelector('#pdf-camera') as HTMLElement | null;
                    const originX = camera ? camera.offsetLeft : container.clientWidth;
                    const originY = camera ? camera.offsetTop : container.clientHeight;

                    container.scrollTo({
                        left: originX + (docWidth / 2) - (container.clientWidth / 2),
                        top: originY + (docHeight / 2) - (container.clientHeight / 2),
                        behavior: 'instant'
                    });
                }
            }));
        }
    }, [containerDimensions.width, containerDimensions.height, pageDimensions.width, pageDimensions.height, scrollMode, pageNumber]);

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
            AppTheme.OLED,
            AppTheme.EINK,
        ];
        const currentIndex = themes.indexOf(theme);
        const nextIndex = (currentIndex + 1) % themes.length;
        const nextTheme = themes[nextIndex];

        setTheme(nextTheme);
        // Sync variant for the new theme from persistent map
        const nextVariant = themeVariants[nextTheme] || 'light';
        setThemeVariant(nextVariant);
    }, [theme, themeVariants]);

    // Annotation Handlers
    const handleAddAnnotation = useCallback((page: number, x: number, y: number) => {
        const newAnnotation: Annotation = {
            id: crypto.randomUUID(),
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
        getRecentFiles().then(setRecentFiles).catch(err =>
            console.warn('[App] Failed to load recent files:', err)
        );
    }, [file]); // Refresh when file changes (including back to null = home)

    // Save theme changes and re-apply CSS custom properties
    // [D-002] Update current variant when theme changes
    useEffect(() => {
        const preferred = themeVariants[theme] || 'light';
        if (preferred !== themeVariant) {
            setThemeVariant(preferred);
        }
    }, [theme]); // Only when theme changes

    // [D-002] Update storage and variants map when variant changes
    useEffect(() => {
        setThemeVariants(prev => {
            const next = { ...prev, [theme]: themeVariant };

            // Persist entire config
            try {
                localStorage.setItem(CONFIG_KEY, JSON.stringify({
                    theme,
                    themeVariant, // Legacy fallback
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

    // Auto-save reading position (ref-based dirty-check, no re-render spam)
    const readingStateRef = useRef({ pageNumber, scale, scrollMode, fileId: currentFileId });
    const lastSavedRef = useRef({ pageNumber: 0, scale: 0, scrollMode: ScrollMode.PAGED as ScrollMode });

    // Keep ref in sync with state — this never resets a timer
    useEffect(() => {
        readingStateRef.current = { pageNumber, scale, scrollMode, fileId: currentFileId };
    }, [pageNumber, scale, scrollMode, currentFileId]);

    // Single interval: dirty-check + save every 3s
    useEffect(() => {
        if (!file) return;

        const interval = setInterval(() => {
            const { pageNumber: p, scale: s, scrollMode: m, fileId } = readingStateRef.current;
            const last = lastSavedRef.current;

            // Only save if something actually changed
            if (!fileId || (p === last.pageNumber && s === last.scale && m === last.scrollMode)) return;

            lastSavedRef.current = { pageNumber: p, scale: s, scrollMode: m };
            saveReadingPosition(fileId, {
                pageNumber: p,
                scale: s,
                scrollMode: m === ScrollMode.CONTINUOUS ? 'continuous' : 'paged'
            }).catch(err => console.warn('[App] Failed to save reading position:', err));
        }, 3000);

        return () => clearInterval(interval);
    }, [file]);

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
            // Don't intercept shortcuts when typing in an input/textarea
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

            // ── Page Navigation (unified behavior: paged and continuous) ──
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
                e.preventDefault();
                if (!file || numPages === 0) return;
                setPageNumber(prev => {
                    const newPage = Math.max(1, prev - 1);
                    if (newPage !== prev && scrollMode === ScrollMode.CONTINUOUS && pdfViewerRef.current) {
                        pdfViewerRef.current.scrollToPage(newPage);
                    }
                    return newPage;
                });
                return;
            }

            if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') {
                e.preventDefault();
                if (!file || numPages === 0) return;
                setPageNumber(prev => {
                    const newPage = Math.min(numPages, prev + 1);
                    if (newPage !== prev && scrollMode === ScrollMode.CONTINUOUS && pdfViewerRef.current) {
                        pdfViewerRef.current.scrollToPage(newPage);
                    }
                    return newPage;
                });
                return;
            }

            // Home / End — Jump to first / last page
            if (e.key === 'Home') {
                e.preventDefault();
                if (!file || numPages === 0) return;
                setPageNumber(1);
                if (scrollMode === ScrollMode.CONTINUOUS && pdfViewerRef.current) {
                    pdfViewerRef.current.scrollToPage(1);
                }
                return;
            }
            if (e.key === 'End') {
                e.preventDefault();
                if (!file || numPages === 0) return;
                setPageNumber(numPages);
                if (scrollMode === ScrollMode.CONTINUOUS && pdfViewerRef.current) {
                    pdfViewerRef.current.scrollToPage(numPages);
                }
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
    }, [file, numPages, scrollMode, handleFitToWidth, handleToggleVariant, handleCycleTheme]);

    // ═══════════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════════

    return (
        <div
            className={`
        flex flex-col h-[100dvh] w-full overflow-hidden transition-colors duration-300
        ${isDarkVariant(themeVariant) ? 'dark' : ''}
        bg-[var(--lumina-bg)]
      `}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >

            {/* 0. Reading Progress Bar */}
            {file && numPages > 0 && (
                <ReadingProgressBar
                    pageNumber={pageNumber}
                    numPages={numPages}
                    theme={theme}
                    onNavigate={setPageNumber}
                />
            )}

            {/* 1. Header / Toolbar */}
            {file && (
                <div className="flex-none z-20 relative pt-1">
                    {/* Floating button to restore toolbar when hidden */}
                    {!isToolbarVisible && (
                        <button
                            onClick={() => setIsToolbarVisible(true)}
                            className="absolute top-0 left-1/2 -translate-x-1/2 z-50
                                w-10 h-5 flex items-center justify-center
                                rounded-b-lg opacity-30 hover:opacity-100
                                transition-all duration-200 hover:h-7"
                            style={{
                                backgroundColor: 'var(--lumina-bg-secondary)',
                                borderLeft: '1px solid var(--lumina-border)',
                                borderRight: '1px solid var(--lumina-border)',
                                borderBottom: '1px solid var(--lumina-border)',
                            }}
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
                        setPageNumber={setPageNumber}
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
                            setFile(null);
                            setIsViewerReady(false);
                        }}
                        recentFiles={recentFiles.slice(0, 5).map(f => ({ id: f.id, name: f.name, lastVisited: f.lastVisited }))}
                        onOpenRecentFile={handleOpenRecentFile}
                    />
                </div>
            )}

            {/* 2. Main Workspace */}
            <div className="flex-1 relative overflow-hidden z-10">
                {!file ? (
                    <RecentFiles onFileSelect={handleOpenFile} theme={theme} themeVariant={themeVariant} />
                ) : (
                    <div className="w-full h-full relative flex flex-row">
                        <div className="flex-1 relative h-full w-full overflow-hidden">
                            <PdfViewer
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
                                onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                                onPageDimensions={setPageDimensions}
                                onContainerDimensions={handleContainerDimensions}
                                onScaleChange={setScale}
                                isOutlineOpen={isOutlineOpen}
                                onToggleOutline={() => setIsOutlineOpen(!isOutlineOpen)}
                            />
                        </div>

                        <AiPanel
                            isOpen={isAiPanelOpen}
                            onClose={() => setIsAiPanelOpen(false)}
                            currentPageText={currentPageText}
                            pdfMetadata={pdfMetadata}
                            theme={theme}
                        />
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
                    <p className="text-3xl font-bold text-blue-600 bg-white/90 p-4 rounded-xl shadow-xl">
                        Déposez votre PDF ici
                    </p>
                </div>
            </div>
        </div>
    );
}

export default App;
