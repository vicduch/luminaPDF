/**
 * App.tsx - Main Application Entry Point
 *
 * Integrates the high-performance GPU rendering engine (PdfViewer + TileLayer)
 * with the application UI (Toolbar, AiPanel, etc.).
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ViewMode, AppTheme, ScrollMode, Annotation, PdfMetadata } from './types';
import Toolbar from './components/Toolbar';
import PdfViewer, { PdfViewerRef } from './components/PdfViewer';
import AiPanel from './components/AiPanel';
import RecentFiles from './components/RecentFiles';
import { Loader2 } from './components/Icons';
import useZoom, { ZoomMode } from './hooks/useZoom';
import { RenderPool } from './utils/RenderPool';

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const APP_VERSION = '1.2.0 (GPU Engine)';
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

  // Refs
  const pdfViewerRef = useRef<PdfViewerRef>(null);

  // ═══════════════════════════════════════════════════════════════════════
  // ZOOM HOOK INTEGRATION
  // ═══════════════════════════════════════════════════════════════════════

  const {
    handleWheelZoom,
    handleToolbarZoom,
    handleFitToScreen,
    currentMode
  } = useZoom({
    // We pass refs via a proxy object that will be populated when PdfViewer mounts
    containerRef: { current: pdfViewerRef.current?.containerRef.current || null } as any,
    contentRef: { current: pdfViewerRef.current?.contentRef.current || null } as any,
    scale,
    setScale,
    config: {
      minScale: 0.1,
      maxScale: 8.0,
      wheelSensitivity: 0.0015
    }
  });

  // Hack to ensure refs are fresh in useZoom
  // useZoom typically caches refs on mount. We need to force update or ensure usage is dynamic.
  // The provided useZoom implementation uses refs.current dynamically in callbacks, so it should be fine
  // IF React re-renders. BUT passing { current: ... } literal creates a new object ref every render.
  // The useZoom hook uses the object itself.
  // Let's create a stable mutable ref object that we update.
  const containerRefProxy = useRef<HTMLDivElement | null>(null);
  const contentRefProxy = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (pdfViewerRef.current) {
      containerRefProxy.current = pdfViewerRef.current.containerRef.current;
      contentRefProxy.current = pdfViewerRef.current.contentRef.current;
    }
  });

  // Re-initialize hook with stable proxy refs
  const zoom = useZoom({
    containerRef: containerRefProxy,
    contentRef: contentRefProxy,
    scale,
    setScale,
  });

  // Attach wheel listener manually since we can't easily pass onWheel to internal div of PdfViewer
  useEffect(() => {
    const container = containerRefProxy.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        zoom.handleWheelZoom(e);
      }
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [zoom.handleWheelZoom, pdfViewerRef.current]);

  // ═══════════════════════════════════════════════════════════════════════
  // HANDLERS
  // ═══════════════════════════════════════════════════════════════════════

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setPageNumber(1);
      // Reset zoom
      setScale(1.0);
    }
  };

  const handleOpenFile = (fileOrUrl: File | string) => {
    setFile(fileOrUrl);
    setPageNumber(1);
    setScale(1.0);
  };

  const handleFitToWidth = () => {
    if (containerDimensions.width && pageDimensions.width) {
      // Leave some margin
      const targetScale = (containerDimensions.width - 48) / pageDimensions.width;
      zoom.handleFitToScreen(targetScale);
      setFitToScreenTrigger(prev => !prev); // Trigger scroll reset
    }
  };

  const handleAddAnnotation = (page: number, x: number, y: number) => {
    const newAnnotation: Annotation = {
      id: crypto.randomUUID(),
      pageNumber: page,
      x,
      y,
      text: '',
      color: annotationColor,
      createdAt: Date.now()
    };
    setAnnotations([...annotations, newAnnotation]);
    setIsAnnotationMode(false); // Exit mode after placement
  };

  const handleUpdateAnnotation = (id: string, text: string, color?: string) => {
    setAnnotations(annotations.map(a =>
      a.id === id ? { ...a, text, color: color || a.color } : a
    ));
  };

  const handleDeleteAnnotation = (id: string) => {
    setAnnotations(annotations.filter(a => a.id !== id));
  };

  // ═══════════════════════════════════════════════════════════════════════
  // PERSISTENCE & INIT
  // ═══════════════════════════════════════════════════════════════════════

  useEffect(() => {
    // Load config
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
    // Save config
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ theme }));
    document.documentElement.className = theme === AppTheme.DARK ? 'dark' : '';
    // Also set background for full immersion
    document.body.style.backgroundColor =
      theme === AppTheme.DARK ? '#0f172a' :
        theme === AppTheme.MIDNIGHT ? '#000000' : '#f8fafc';
  }, [theme]);


  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════

  return (
    <div className={`
      flex h-screen w-full flex-col overflow-hidden transition-colors duration-300
      ${theme === AppTheme.DARK || theme === AppTheme.MIDNIGHT || theme === AppTheme.BLUE_NIGHT ? 'dark' : ''}
      bg-white dark:bg-slate-900
    `}>

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
        setScale={(s) => zoom.handleToolbarZoom(s, true)} // Animated zoom from toolbar
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
        onHome={() => setFile(null)}
      />

      {/* 2. Main Workspace */}
      <div className="relative flex-1 overflow-hidden">
        {!file ? (
          // Empty State / Recent Files
          <RecentFiles onOpenFile={handleOpenFile} />
        ) : (
          // PDF Viewer
          <div className="w-full h-full relative">
            <PdfViewer
              ref={pdfViewerRef}
              file={file}
              numPages={numPages}
              pageNumber={pageNumber}
              setPageNumber={setPageNumber}
              scale={scale}
              renderedScale={scale} // Using same scale for Tile architecture
              viewMode={viewMode}
              scrollMode={scrollMode}
              isOutlineOpen={isOutlineOpen}
              isAnnotationMode={isAnnotationMode}
              annotations={annotations}
              annotationColor={annotationColor}
              theme={theme}
              // Actions
              zoomFocalPoint={null} // Handled internally by hook
              isFitToScreenAction={fitToScreenTrigger}
              // Callbacks
              onLoadSuccess={({ numPages }) => setNumPages(numPages)}
              onMetadataLoaded={setPdfMetadata}
              onPageDimensions={(dims) => setPageDimensions(dims)}
              onContainerDimensions={(dims) => {
                setContainerDimensions(dims);
                // Force ref update for zoom hook
                if (pdfViewerRef.current) {
                  containerRefProxy.current = pdfViewerRef.current.containerRef.current;
                  contentRefProxy.current = pdfViewerRef.current.contentRef.current;
                }
              }}
              onTextExtract={setCurrentPageText}
              onAddAnnotation={handleAddAnnotation}
              onUpdateAnnotation={handleUpdateAnnotation}
              onDeleteAnnotation={handleDeleteAnnotation}
            />

            {/* AI Assistant Overlay */}
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

      {/* 3. Drop Zone Indicator (Overlay) */}
      <div
        className="absolute inset-0 pointer-events-none z-50 hidden"
        id="drag-overlay"
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