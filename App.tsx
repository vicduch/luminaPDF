/**
 * App.tsx - Main Application Entry Point
 *
 * Integrates the high-performance GPU rendering engine (PdfViewer + TileLayer)
 * with the application UI (Toolbar, AiPanel, etc.).
 *
 * Features:
 * - Stable zoom with useZoom hook
 * - Drag & Drop file loading
 * - Theme persistence
 * - Annotation management
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ViewMode, AppTheme, ScrollMode, Annotation, PdfMetadata } from './types';
import Toolbar from './components/Toolbar';
import PdfViewer, { PdfViewerRef } from './components/PdfViewer';
import AiPanel from './components/AiPanel';
import RecentFiles from './components/RecentFiles';
import useZoom from './hooks/useZoom';

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
    const [numPages, setNumPages] = useState<number>(0);
    const [pageNumber, setPageNumber] = useState<number>(1);
    const [pdfMetadata, setPdfMetadata] = useState<PdfMetadata | null>(null);
    const [currentPageText, setCurrentPageText] = useState<string>("");

    // UI State
    const [theme, setTheme] = useState<AppTheme>(AppTheme.LIGHT);
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
    // ZOOM HOOK (Single Instance with Proxy Refs)
    // ═══════════════════════════════════════════════════════════════════════

    const zoomConfig = useMemo(() => ({
        containerRef: containerRefProxy,
        contentRef: contentRefProxy,
        scale,
        setScale,
        config: {
            minScale: 0.1,
            maxScale: 8.0,
            wheelSensitivity: 0.0015
        }
    }), [scale, isViewerReady]); // Re-create when isViewerReady changes

    const zoom = useZoom(zoomConfig);

    // Attach wheel listener for Ctrl+Wheel zoom
    useEffect(() => {
        const container = containerRefProxy.current;
        if (!container || !isViewerReady) return;

        const onWheel = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                zoom.handleWheelZoom(e);
            }
        };

        container.addEventListener('wheel', onWheel, { passive: false });
        return () => container.removeEventListener('wheel', onWheel);
    }, [zoom.handleWheelZoom, isViewerReady]);

    // ═══════════════════════════════════════════════════════════════════════
    // HANDLERS
    // ═══════════════════════════════════════════════════════════════════════

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];
            setFile(selectedFile);
            setPageNumber(1);
            setScale(1.0);
            setIsViewerReady(false);
        }
    }, []);

    const handleOpenFile = useCallback((fileOrUrl: File | string) => {
        setFile(fileOrUrl);
        setPageNumber(1);
        setScale(1.0);
        setIsViewerReady(false);
    }, []);

    const handleFitToWidth = useCallback(() => {
        if (containerDimensions.width && pageDimensions.width) {
            const targetScale = (containerDimensions.width - 48) / pageDimensions.width;
            zoom.handleFitToScreen(targetScale);
            setFitToScreenTrigger(prev => !prev);
        }
    }, [containerDimensions.width, pageDimensions.width, zoom]);

    const handleContainerDimensions = useCallback((dims: { width: number; height: number }) => {
        setContainerDimensions(dims);

        // Synchronize proxy refs with actual PdfViewer refs
        if (pdfViewerRef.current) {
            containerRefProxy.current = pdfViewerRef.current.containerRef.current;
            contentRefProxy.current = pdfViewerRef.current.contentRef.current;

            if (!isViewerReady && containerRefProxy.current && contentRefProxy.current) {
                setIsViewerReady(true);
            }
        }
    }, [isViewerReady]);

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

    useEffect(() => {
        const saved = localStorage.getItem(CONFIG_KEY);
        if (saved) {
            try {
                const config = JSON.parse(saved);
                setTheme(config.theme || AppTheme.LIGHT);
            } catch (e) {
                console.error("Config load failed", e);
            }
        }
    }, []);

    useEffect(() => {
        localStorage.setItem(CONFIG_KEY, JSON.stringify({ theme }));
        document.documentElement.className = theme === AppTheme.DARK ? 'dark' : '';
        document.body.style.backgroundColor =
            theme === AppTheme.DARK ? '#0f172a' :
                theme === AppTheme.MIDNIGHT ? '#000000' : '#f8fafc';
    }, [theme]);

    // ═══════════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════════

    return (
        <div
            className={`
        flex h-screen w-full flex-col overflow-hidden transition-colors duration-300
        ${theme === AppTheme.DARK || theme === AppTheme.MIDNIGHT || theme === AppTheme.BLUE_NIGHT ? 'dark' : ''}
        bg-white dark:bg-slate-900
      `}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >

            {/* 1. Header / Toolbar */}
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
                setScale={(s) => zoom.handleToolbarZoom(s, true)}
                onFitToWidth={handleFitToWidth}
                setTheme={setTheme}
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
            />

            {/* 2. Main Workspace */}
            <div className="relative flex-1 overflow-hidden">
                {!file ? (
                    <RecentFiles onOpenFile={handleOpenFile} />
                ) : (
                    <div className="w-full h-full relative">
                        <PdfViewer
                            ref={pdfViewerRef}
                            file={file}
                            numPages={numPages}
                            pageNumber={pageNumber}
                            setPageNumber={setPageNumber}
                            scale={scale}
                            renderedScale={scale}
                            viewMode={viewMode}
                            scrollMode={scrollMode}
                            isOutlineOpen={isOutlineOpen}
                            isAnnotationMode={isAnnotationMode}
                            annotations={annotations}
                            annotationColor={annotationColor}
                            theme={theme}
                            zoomFocalPoint={null}
                            isFitToScreenAction={fitToScreenTrigger}
                            onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                            onMetadataLoaded={setPdfMetadata}
                            onPageDimensions={setPageDimensions}
                            onContainerDimensions={handleContainerDimensions}
                            onTextExtract={setCurrentPageText}
                            onAddAnnotation={handleAddAnnotation}
                            onUpdateAnnotation={handleUpdateAnnotation}
                            onDeleteAnnotation={handleDeleteAnnotation}
                        />

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
