import React, { useState, useEffect, useRef } from 'react';
import Toolbar from './components/Toolbar';
import PdfViewer from './components/PdfViewer';
import AiPanel from './components/AiPanel';
import { AppTheme, ViewMode, ScrollMode, PdfMetadata, Annotation } from './types';
import { ChevronDown } from './components/Icons';
import RecentFiles from './components/RecentFiles';
import { saveRecentFile, updateFileMetadata, RecentFileMetadata } from './services/storage';

function App() {
  const [file, setFile] = useState<File | string | null>(null);
  const [fileId, setFileId] = useState<string>(""); // Unique ID for persistence
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [renderedScale, setRenderedScale] = useState<number>(1.0);

  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.SINGLE);
  const [scrollMode, setScrollMode] = useState<ScrollMode>(ScrollMode.PAGED);
  const [theme, setTheme] = useState<AppTheme>(AppTheme.LIGHT);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [isOutlineOpen, setIsOutlineOpen] = useState(false);
  const [currentPageText, setCurrentPageText] = useState<string>("");
  const [pdfMetadata, setPdfMetadata] = useState<PdfMetadata | null>(null);
  const [isToolbarVisible, setIsToolbarVisible] = useState(true);

  // Annotations State
  const [isAnnotationMode, setIsAnnotationMode] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [annotationColor, setAnnotationColor] = useState<string>("#facc15"); // Default yellow-400

  const [pageDimensions, setPageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [containerDimensions, setContainerDimensions] = useState<{ width: number; height: number } | null>(null);

  // Touch handling refs
  const touchStartRef = useRef<{ x: number, y: number } | null>(null);
  const touchStartDistRef = useRef<number | null>(null);
  const touchStartScaleRef = useRef<number>(1.0);
  const touchStartCenterRef = useRef<{ x: number, y: number } | null>(null);
  const isPinchingRef = useRef<boolean>(false);
  const rafRef = useRef<number | null>(null);

  // Zoom Focal Point Tracking
  const [zoomFocalPoint, setZoomFocalPoint] = useState<{ x: number; y: number } | null>(null);

  // Explicit flag for "Fit to Screen" action (to distinguish from normal zoom)
  const [isFitToScreenAction, setIsFitToScreenAction] = useState(false);

  const appRef = useRef<HTMLDivElement>(null);
  const zoomTimeoutRef = useRef<number | null>(null);

  // ... (Keep existing persistence useEffects) ...

  // Generate File ID and Load Persistence
  useEffect(() => {
    if (file) {
      let id = "";
      if (typeof file === 'string') {
        id = btoa(file).substring(0, 16); // Simple hash for URL
      } else {
        id = `${file.name}_${file.size}`; // Simple hash for local file
      }
      setFileId(id);

      // Load persisted data
      const savedPage = localStorage.getItem(`lumina_page_${id}`);
      if (savedPage) {
        setPageNumber(Number(savedPage));
      } else {
        setPageNumber(1);
      }

      const savedNotes = localStorage.getItem(`lumina_notes_${id}`);
      if (savedNotes) {
        try {
          setAnnotations(JSON.parse(savedNotes));
        } catch (e) {
          setAnnotations([]);
        }
      } else {
        setAnnotations([]);
      }
    }
  }, [file]);

  // Persist Page Number
  useEffect(() => {
    if (fileId) {
      localStorage.setItem(`lumina_page_${fileId}`, pageNumber.toString());
    }
  }, [pageNumber, fileId]);

  // Persist Annotations
  useEffect(() => {
    if (fileId) {
      localStorage.setItem(`lumina_notes_${fileId}`, JSON.stringify(annotations));
    }
  }, [annotations, fileId]);

  // Persist to IndexedDB (Recent Files)
  useEffect(() => {
    if (file && fileId && typeof file !== 'string') {
      // Save initial entry if new
      const meta: RecentFileMetadata = {
        id: fileId,
        name: file.name,
        size: file.size,
        type: file.type || 'application/pdf',
        lastVisited: Date.now(),
        pageNumber,
        annotations
      };
      saveRecentFile(file, meta).catch(console.error);
    }
  }, [fileId]); // Only save blob when file ID changes (new load)

  // Update IndexedDB Metadata (Page/Annotations)
  useEffect(() => {
    if (fileId) {
      updateFileMetadata(fileId, {
        pageNumber,
        annotations,
        lastVisited: Date.now()
      }).catch(console.error);
    }
  }, [pageNumber, annotations, fileId]);

  // Smooth Zoom Debounce
  useEffect(() => {
    if (Math.abs(scale - renderedScale) < 0.01) return;

    // During an active pinch, we don't want to trigger the heavy re-render
    if (isPinchingRef.current) return;

    if (zoomTimeoutRef.current) window.clearTimeout(zoomTimeoutRef.current);
    zoomTimeoutRef.current = window.setTimeout(() => {
      setRenderedScale(scale);
      // Reset fit action flag after scale is applied
      setIsFitToScreenAction(false);
    }, 150); // Reduced from 300ms for snappier response
    return () => { if (zoomTimeoutRef.current) window.clearTimeout(zoomTimeoutRef.current); };
  }, [scale]);

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files[0]) {
      setFile(files[0]);
      setPdfMetadata(null);
    }
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      appRef.current?.requestFullscreen().catch(console.error);
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const handleFitToScreen = () => {
    if (!containerDimensions || !pageDimensions) {
      setScale(1.0);
      setRenderedScale(1.0);
      return;
    }
    // Reserve space for scrollbar (approx 16px) to avoid flicker loop
    const SCROLLBAR_BUFFER = 18;
    const availWidth = containerDimensions.width - SCROLLBAR_BUFFER;
    const availHeight = containerDimensions.height - SCROLLBAR_BUFFER;

    if (availWidth <= 0 || availHeight <= 0) return;

    const pageRatio = pageDimensions.width / pageDimensions.height;
    let effectiveWidthAtScale1 = availWidth;
    if (viewMode === ViewMode.DOUBLE && scrollMode === ScrollMode.PAGED) {
      effectiveWidthAtScale1 = availWidth / 2;
    }
    const heightAtScale1 = effectiveWidthAtScale1 / pageRatio;

    // Check if it fits by height first (contain)
    let bestScale = availHeight / heightAtScale1;

    // If scale makes width too large (shouldn't happen with aspect ratio math but safety check)
    if (effectiveWidthAtScale1 * bestScale > availWidth) {
      bestScale = availWidth / effectiveWidthAtScale1;
    }

    // Use explicit flag to signal "Fit to Screen" action (not null zoomFocalPoint which caused bugs)
    setIsFitToScreenAction(true);
    setScale(Math.min(2.0, bestScale));
    setRenderedScale(Math.min(2.0, bestScale));
  };

  const handleToolbarZoom = (newScale: number) => {
    // Determine the center of the viewport to use as the focal point
    const container = document.getElementById('pdf-scroll-container');
    if (container) {
      const rect = container.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      setZoomFocalPoint({ x: centerX, y: centerY });
    }
    setScale(newScale);
  };

  // --- Annotation Handlers ---
  const handleAddAnnotation = (page: number, x: number, y: number) => {
    const newNote: Annotation = {
      id: Date.now().toString(),
      pageNumber: page,
      x,
      y,
      text: "",
      color: annotationColor,
      createdAt: Date.now()
    };
    setAnnotations(prev => [...prev, newNote]);
  };

  const handleUpdateAnnotation = (id: string, text: string, color?: string) => {
    setAnnotations(prev => prev.map(n => {
      if (n.id === id) {
        return {
          ...n,
          text: text,
          color: color || n.color
        };
      }
      return n;
    }));
  };

  const handleDeleteAnnotation = (id: string) => {
    setAnnotations(prev => prev.filter(n => n.id !== id));
  };


  // --- Navigation & Touch ---
  const changePage = (offset: number) => {
    const delta = viewMode === ViewMode.DOUBLE ? offset * 2 : offset;
    setPageNumber(prev => {
      const next = prev + delta;
      if (next < 1) return 1;
      if (next > numPages) return prev;
      return next;
    });
  };

  const getDistance = (touches: React.TouchList) => {
    return Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY
    );
  };

  const getMidpoint = (touches: React.TouchList) => {
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    };
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch to zoom start
      isPinchingRef.current = true;
      const dist = getDistance(e.touches);
      const center = getMidpoint(e.touches);

      touchStartDistRef.current = dist;
      touchStartCenterRef.current = center;
      touchStartScaleRef.current = scale;

      // Set initial focal point for this gesture
      setZoomFocalPoint(center);
    } else if (e.touches.length === 1) {
      // Swipe start
      isPinchingRef.current = false;
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && isPinchingRef.current && touchStartDistRef.current) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      rafRef.current = requestAnimationFrame(() => {
        const currentDist = getDistance(e.touches);
        // We keep the initial zoomFocalPoint set in onTouchStart 
        // to maintain a stable CSS transform-origin during the gesture.

        const ratio = currentDist / touchStartDistRef.current!;

        // Calculate new scale
        let newScale = touchStartScaleRef.current * ratio;
        newScale = Math.min(Math.max(0.1, newScale), 10.0);

        setScale(newScale);
      });
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (isPinchingRef.current) {
      if (e.touches.length < 2) {
        isPinchingRef.current = false;
        touchStartDistRef.current = null;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);

        // Trigger the heavy high-quality render only when the gesture is finished
        setRenderedScale(scale);
      }
    } else {
      // Handle Swipe End
      if (!touchStartRef.current) return;

      // Only swipe page if not zoomed in significantly
      if (scale > 1.1 || scrollMode === ScrollMode.CONTINUOUS) {
        touchStartRef.current = null;
        return;
      }

      const touchEndX = e.changedTouches[0].clientX;
      const distance = touchStartRef.current.x - touchEndX;
      const minSwipeDistance = 50;

      if (distance > minSwipeDistance && pageNumber < numPages) changePage(1);
      if (distance < -minSwipeDistance && pageNumber > 1) changePage(-1);

      touchStartRef.current = null;
    }
  };

  useEffect(() => {
    if (!file) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      if (scrollMode === ScrollMode.PAGED) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          changePage(1);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          changePage(-1);
        }
      }
    };
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();

        // Track the zoom focal point (screen coordinates)
        setZoomFocalPoint({ x: e.clientX, y: e.clientY });

        const zoomSensitivity = 0.003;
        const delta = -e.deltaY * zoomSensitivity;
        let newScale = scale + delta;
        newScale = Math.min(Math.max(0.2, newScale), 5.0);
        setScale(newScale);
        return;
      }
      if (scrollMode === ScrollMode.PAGED && Math.abs(e.deltaY) > 20) {
        const container = document.getElementById('pdf-scroll-container');
        const hasNoScroll = container && container.scrollHeight <= container.clientHeight;
        if (hasNoScroll) {
          if (e.deltaY > 0) changePage(1);
          else changePage(-1);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [pageNumber, numPages, scrollMode, viewMode, file, scale]);

  const handleHome = () => {
    setFile(null);
    setFileId("");
    setPageNumber(1);
    setAnnotations([]);
  };

  const getThemeBackground = () => {
    switch (theme) {
      case AppTheme.SOLARIZED: return 'bg-[#fdf6e3] text-[#586e75]';
      case AppTheme.SEPIA: return 'bg-[#f4ecd8] text-[#5b4636]';
      case AppTheme.FOREST: return 'bg-[#1a2f23] text-[#c1d1c8]';
      case AppTheme.BLUE_NIGHT: return 'bg-[#0f172a] text-[#94a3b8]';
      case AppTheme.DARK: return 'bg-slate-900 text-slate-200';
      case AppTheme.MIDNIGHT: return 'bg-black text-gray-400';
      default: return 'bg-gray-50 text-slate-800';
    }
  };

  const isDarkTheme = theme !== AppTheme.LIGHT && theme !== AppTheme.SEPIA && theme !== AppTheme.SOLARIZED;

  // Sync dark class with html element for global styles (like scrollbars)
  useEffect(() => {
    if (isDarkTheme) {
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.colorScheme = 'light';
    }
  }, [isDarkTheme]);

  return (
    <div ref={appRef} className={`flex flex-col h-screen w-full transition-colors duration-300 ${getThemeBackground()} font-light`}>
      <style>{`
        /* Custom Scrollbar Styling */
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        ::-webkit-scrollbar-thumb {
          background-color: rgba(156, 163, 175, 0.5); /* gray-400 equivalent with opacity */
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background-color: rgba(107, 114, 128, 0.8); /* gray-500 equivalent */
        }
        
        /* Dark mode specific overrides */
        .dark ::-webkit-scrollbar-thumb {
          background-color: rgba(75, 85, 99, 0.6); /* gray-600 */
        }
        .dark ::-webkit-scrollbar-thumb:hover {
          background-color: rgba(107, 114, 128, 0.9); /* gray-500 */
        }

        /* Hide scrollbar buttons */
        ::-webkit-scrollbar-button {
          display: none;
        }
      `}</style>

      {!isToolbarVisible && (
        <div className="absolute top-0 left-0 w-full h-8 z-50 flex justify-center hover:opacity-100 opacity-0 transition-opacity">
          <button
            onClick={() => setIsToolbarVisible(true)}
            className="bg-white/90 dark:bg-black/80 text-gray-800 dark:text-gray-200 px-4 pb-1 pt-1 rounded-b-lg shadow-lg border-b border-x border-gray-200 dark:border-gray-700 backdrop-blur-sm"
          >
            <ChevronDown size={16} />
          </button>
        </div>
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
        setScale={handleToolbarZoom}
        onFitToWidth={handleFitToScreen}
        setTheme={setTheme}
        setViewMode={setViewMode}
        setScrollMode={setScrollMode}
        setAnnotationColor={setAnnotationColor}
        toggleFullscreen={toggleFullscreen}
        toggleOutline={() => setIsOutlineOpen(!isOutlineOpen)}
        toggleAnnotationMode={() => setIsAnnotationMode(!isAnnotationMode)}
        onFileChange={onFileChange}
        toggleAiPanel={() => setIsAiPanelOpen(!isAiPanelOpen)}
        toggleVisibility={() => setIsToolbarVisible(false)}
        onHome={handleHome}
      />

      {!file ? (
        <div className="flex-1 overflow-auto transition-colors duration-300">
          <RecentFiles onFileSelect={(f) => setFile(f)} theme={theme} />
        </div>
      ) : (
        <div
          className="flex flex-1 overflow-hidden relative"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="flex-1 relative min-w-0 transition-all duration-300 ease-out">
            <PdfViewer
              file={file}
              pageNumber={pageNumber}
              numPages={numPages}
              scale={scale}
              renderedScale={renderedScale}
              zoomFocalPoint={zoomFocalPoint}
              isFitToScreenAction={isFitToScreenAction}
              viewMode={viewMode}
              scrollMode={scrollMode}
              isOutlineOpen={isOutlineOpen}
              isAnnotationMode={isAnnotationMode}
              annotations={annotations}
              annotationColor={annotationColor}
              onLoadSuccess={onDocumentLoadSuccess}
              onMetadataLoaded={setPdfMetadata}
              onPageDimensions={setPageDimensions}
              onContainerDimensions={setContainerDimensions}
              onAddAnnotation={handleAddAnnotation}
              onUpdateAnnotation={handleUpdateAnnotation}
              onDeleteAnnotation={handleDeleteAnnotation}
              setPageNumber={setPageNumber}
              theme={theme}
              onTextExtract={setCurrentPageText}
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
  );
}

export default App;