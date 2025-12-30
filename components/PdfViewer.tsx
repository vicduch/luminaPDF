/**
 * PdfViewer.tsx - Hybrid PDF Viewer with Tiled Rendering
 *
 * Architecture:
 * - react-pdf (<Document>/<Page>) for structure, metadata, and text layer
 * - TileLayer + RenderPool for high-performance GPU-accelerated canvas rendering
 *
 * Key Features:
 * - ForwardRef exposing containerRef and contentRef for parent zoom control
 * - RenderPool document loading on file change
 * - TileLayer for each page with proper viewport transforms
 */

import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useLayoutEffect,
  useCallback,
  forwardRef,
  useImperativeHandle
} from 'react';
import { Document, Page, pdfjs, Outline } from 'react-pdf';
import { PdfDocumentProps, ViewMode, AppTheme, ScrollMode, Annotation } from '../types';
import { Loader2, Trash2 } from './Icons';
import { TileLayer } from './TileLayer';
import { RenderPool, DocumentDimensions } from '../utils/RenderPool';
import { Transform } from '../utils/TileManager';

// PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface PdfViewerProps extends PdfDocumentProps {
  onTextExtract: (text: string) => void;
}

/** Exposed ref interface for parent zoom control */
export interface PdfViewerRef {
  containerRef: React.RefObject<HTMLDivElement>;
  contentRef: React.RefObject<HTMLDivElement>;
}

// ─────────────────────────────────────────────────────────────────────────────
// ANNOTATION COLORS
// ─────────────────────────────────────────────────────────────────────────────

const ANNOTATION_COLORS = [
  { label: 'Jaune', value: '#facc15' },
  { label: 'Vert', value: '#4ade80' },
  { label: 'Bleu', value: '#60a5fa' },
  { label: 'Rouge', value: '#f87171' },
  { label: 'Violet', value: '#c084fc' },
];

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const PdfViewer = forwardRef<PdfViewerRef, PdfViewerProps>(({
  file,
  pageNumber,
  numPages,
  scale,
  renderedScale,
  viewMode,
  scrollMode,
  isOutlineOpen,
  isAnnotationMode,
  annotations,
  annotationColor,
  zoomFocalPoint,
  isFitToScreenAction,
  onLoadSuccess,
  onMetadataLoaded,
  onPageDimensions,
  onContainerDimensions,
  onAddAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
  setPageNumber,
  theme,
  onTextExtract
}, ref) => {
  // ═══════════════════════════════════════════════════════════════════════
  // REFS
  // ═══════════════════════════════════════════════════════════════════════

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const activePopupRef = useRef<HTMLDivElement>(null);
  const prevPageNumberRef = useRef(pageNumber);
  const isFirstRenderRef = useRef(true);

  // Expose refs to parent
  useImperativeHandle(ref, () => ({
    containerRef,
    contentRef
  }), []);

  // ═══════════════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════════════

  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [containerHeight, setContainerHeight] = useState<number>(0);
  const [pageDimensions, setPageDimensions] = useState<DocumentDimensions>({ width: 612, height: 792 });
  const [isRenderPoolReady, setIsRenderPoolReady] = useState(false);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [visiblePageRange, setVisiblePageRange] = useState<[number, number]>([1, 5]);
  const [scrollPosition, setScrollPosition] = useState({ x: 0, y: 0 });

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER POOL INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!file) {
      setIsRenderPoolReady(false);
      return;
    }

    let isMounted = true;

    const initRenderPool = async () => {
      try {
        // Get absolute URL for the file
        const url = typeof file === 'string'
          ? (file.startsWith('http') ? file : window.location.origin + file)
          : URL.createObjectURL(file);

        const pool = RenderPool.getInstance();
        const dims = await pool.loadDocument(url);

        if (isMounted) {
          setPageDimensions(dims);
          setIsRenderPoolReady(true);
          console.log('[PdfViewer] RenderPool ready:', dims);
        }
      } catch (err) {
        console.error('[PdfViewer] RenderPool init failed:', err);
        if (isMounted) {
          setIsRenderPoolReady(false);
        }
      }
    };

    initRenderPool();

    return () => {
      isMounted = false;
    };
  }, [file]);

  // ═══════════════════════════════════════════════════════════════════════
  // RESIZE OBSERVER
  // ═══════════════════════════════════════════════════════════════════════

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        const { width, height } = entries[0].contentRect;
        setContainerWidth(Math.floor(width));
        setContainerHeight(Math.floor(height));
        onContainerDimensions?.({ width, height });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [onContainerDimensions]);

  // ═══════════════════════════════════════════════════════════════════════
  // SCROLL TRACKING
  // ═══════════════════════════════════════════════════════════════════════

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    setScrollPosition({
      x: container.scrollLeft,
      y: container.scrollTop
    });

    // Virtualization for continuous mode
    if (scrollMode === ScrollMode.CONTINUOUS && numPages > 0) {
      const { scrollTop, clientHeight } = container;
      const avgPageHeight = (pageDimensions.height * scale) + 16;

      const startPage = Math.floor(scrollTop / avgPageHeight) + 1;
      const endPage = Math.ceil((scrollTop + clientHeight) / avgPageHeight);

      const OVERSCAN = 2;
      const safeStart = Math.max(1, startPage - OVERSCAN);
      const safeEnd = Math.min(numPages, endPage + OVERSCAN);

      setVisiblePageRange(prev => {
        if (prev[0] !== safeStart || prev[1] !== safeEnd) {
          return [safeStart, safeEnd];
        }
        return prev;
      });
    }
  }, [scrollMode, numPages, pageDimensions.height, scale]);

  // ═══════════════════════════════════════════════════════════════════════
  // SCROLL POSITION MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      prevPageNumberRef.current = pageNumber;
      return;
    }

    // Page change: scroll to top
    if (prevPageNumberRef.current !== pageNumber) {
      container.scrollTo({ left: 0, top: 0, behavior: 'instant' });
      prevPageNumberRef.current = pageNumber;
      return;
    }

    // Fit to screen: scroll to origin
    if (isFitToScreenAction) {
      container.scrollTo({ left: 0, top: 0, behavior: 'instant' });
    }
  }, [pageNumber, isFitToScreenAction]);

  // ═══════════════════════════════════════════════════════════════════════
  // CLICK OUTSIDE TO CLOSE ANNOTATION
  // ═══════════════════════════════════════════════════════════════════════

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        activeAnnotationId &&
        activePopupRef.current &&
        !activePopupRef.current.contains(event.target as Node)
      ) {
        setActiveAnnotationId(null);
      }
    };

    if (activeAnnotationId) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeAnnotationId]);

  // ═══════════════════════════════════════════════════════════════════════
  // COMPUTED VALUES
  // ═══════════════════════════════════════════════════════════════════════

  const pageWidth = useMemo(() => {
    const baseWidth = viewMode === ViewMode.DOUBLE && scrollMode === ScrollMode.PAGED
      ? (containerWidth - 16) / 2
      : containerWidth;
    return Math.max(100, baseWidth);
  }, [containerWidth, viewMode, scrollMode]);

  const pageHeight = useMemo(() => {
    return pageWidth * (pageDimensions.height / pageDimensions.width);
  }, [pageWidth, pageDimensions]);

  // ═══════════════════════════════════════════════════════════════════════
  // DOCUMENT HANDLERS
  // ═══════════════════════════════════════════════════════════════════════

  const handleDocumentLoadSuccess = useCallback(async (pdf: any) => {
    onLoadSuccess({ numPages: pdf.numPages });

    try {
      const metadata = await pdf.getMetadata();
      if (metadata?.info) {
        onMetadataLoaded({
          title: metadata.info.Title,
          author: metadata.info.Author,
          subject: metadata.info.Subject,
          keywords: metadata.info.Keywords,
          creator: metadata.info.Creator,
          producer: metadata.info.Producer
        });
      }
    } catch (e) {
      console.error('[PdfViewer] Metadata load failed:', e);
    }
  }, [onLoadSuccess, onMetadataLoaded]);

  const handlePageLoadSuccess = useCallback(async (page: any) => {
    onPageDimensions?.({
      width: page.originalWidth,
      height: page.originalHeight
    });

    // Extract text for current page
    if (scrollMode === ScrollMode.PAGED && page.pageNumber === pageNumber) {
      try {
        const textContent = await page.getTextContent();
        const fullText = textContent.items.map((item: any) => item.str).join(' ');
        onTextExtract(fullText);
      } catch (e) {
        onTextExtract('');
      }
    }
  }, [scrollMode, pageNumber, onPageDimensions, onTextExtract]);

  const handleOutlineClick = useCallback(({
    pageNumber: clickedPage,
    pageIndex
  }: {
    pageNumber?: string | number;
    pageIndex?: number;
  }) => {
    if (clickedPage) {
      setPageNumber(Number(clickedPage));
    } else if (pageIndex !== undefined) {
      setPageNumber(pageIndex + 1);
    }
  }, [setPageNumber]);

  // ═══════════════════════════════════════════════════════════════════════
  // ANNOTATION HANDLERS
  // ═══════════════════════════════════════════════════════════════════════

  const handlePageClick = useCallback((e: React.MouseEvent, pageNum: number) => {
    if (!isAnnotationMode) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    onAddAnnotation(pageNum, x, y);
  }, [isAnnotationMode, onAddAnnotation]);

  // ═══════════════════════════════════════════════════════════════════════
  // STYLES
  // ═══════════════════════════════════════════════════════════════════════

  const getThemeBackground = useCallback(() => {
    switch (theme) {
      case AppTheme.LIGHT: return 'bg-white border-gray-200 text-gray-800';
      case AppTheme.SOLARIZED: return 'bg-[#fdf6e3] border-[#eee8d5] text-[#586e75]';
      case AppTheme.SEPIA: return 'bg-[#fcf7e9] border-[#e0d6b5] text-[#5b4636]';
      case AppTheme.FOREST: return 'bg-[#1a2f23] border-[#2c4236] text-[#c1d1c8]';
      case AppTheme.BLUE_NIGHT: return 'bg-[#0f172a] border-[#1e293b] text-[#94a3b8]';
      case AppTheme.DARK: return 'bg-slate-900 border-gray-700 text-gray-200';
      case AppTheme.MIDNIGHT: return 'bg-black border-gray-800 text-gray-400';
      default: return 'bg-white border-gray-200 text-gray-800';
    }
  }, [theme]);

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER ANNOTATIONS
  // ═══════════════════════════════════════════════════════════════════════

  const renderAnnotations = useCallback((pageNum: number) => {
    const pageNotes = annotations.filter(a => a.pageNumber === pageNum);

    return pageNotes.map(note => {
      const isActive = activeAnnotationId === note.id;

      return (
        <div
          key={note.id}
          className="absolute transform -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-auto"
          style={{ left: `${note.x}%`, top: `${note.y}%` }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActiveAnnotationId(isActive ? null : note.id);
            }}
            className={`
                            w-5 h-5 rounded-full shadow-lg border transition-all duration-200 
                            flex items-center justify-center
                            ${isActive
                ? 'scale-125 ring-2 ring-blue-500 ring-offset-1 z-50 border-gray-400'
                : 'hover:scale-125 z-40 border-white'}
                        `}
            style={{ backgroundColor: note.color || '#facc15' }}
            title="Ouvrir la note"
            type="button"
          />

          {isActive && (
            <div
              ref={activePopupRef}
              className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 
                                       bg-white rounded-lg shadow-2xl border border-gray-200 
                                       p-3 flex flex-col gap-2 animate-in zoom-in-95 
                                       duration-200 origin-top cursor-default z-50"
              onClick={(e) => e.stopPropagation()}
              style={{ minWidth: '200px' }}
            >
              <div className="flex justify-between items-center pb-1 border-b border-gray-100">
                <div className="flex gap-1.5">
                  {ANNOTATION_COLORS.map(c => (
                    <button
                      key={c.value}
                      onClick={() => onUpdateAnnotation(note.id, note.text, c.value)}
                      className={`w-3 h-3 rounded-full hover:scale-125 transition-transform 
                                                        ${note.color === c.value ? 'ring-1 ring-offset-1 ring-gray-400' : ''}`}
                      style={{ backgroundColor: c.value }}
                      title={c.label}
                    />
                  ))}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteAnnotation(note.id);
                    setActiveAnnotationId(null);
                  }}
                  className="text-gray-400 hover:text-red-500 hover:bg-red-50 
                                               p-1 rounded transition"
                  title="Supprimer la note"
                  type="button"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <textarea
                value={note.text}
                onChange={(e) => onUpdateAnnotation(note.id, e.target.value)}
                className="w-full bg-transparent text-sm text-gray-800 
                                           focus:outline-none resize-none min-h-[80px] 
                                           leading-relaxed p-1"
                placeholder="Écrivez votre commentaire ici..."
                autoFocus
              />

              <div className="flex justify-between items-center text-[10px] text-gray-400 pt-1">
                <span>{new Date(note.createdAt).toLocaleDateString()}</span>
                <span>
                  {new Date(note.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
            </div>
          )}
        </div>
      );
    });
  }, [annotations, activeAnnotationId, onUpdateAnnotation, onDeleteAnnotation]);

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER PAGE WITH TILE LAYER
  // ═══════════════════════════════════════════════════════════════════════

  const renderPage = useCallback((pageNum: number, pageOffset: number = 0) => {
    // Calculate viewport transform for this page relative to scroll container
    const viewportTransform: Transform = {
      x: -scrollPosition.x,
      y: -scrollPosition.y + pageOffset,
      scale
    };

    const scaledWidth = pageDimensions.width * scale;
    const scaledHeight = pageDimensions.height * scale;

    return (
      <div
        key={`page_${pageNum}`}
        className="relative"
        style={{
          width: scaledWidth,
          height: scaledHeight,
          backgroundColor: 'white',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        }}
      >
        {/* TileLayer: GPU-accelerated tiled rendering */}
        {/* Wrapped in scaled container to align with World Space coordinates */}
        {isRenderPoolReady && (
          <div
            className="absolute inset-0 overflow-hidden"
            style={{
              // Tiles are positioned in World Space, scale them to Screen Space
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              width: pageDimensions.width,
              height: pageDimensions.height,
            }}
          >
            <TileLayer
              viewportTransform={viewportTransform}
              viewportSize={{ width: containerWidth, height: containerHeight }}
              contentSize={pageDimensions}
              tileSize={256}
              buffer={1}
            />
          </div>
        )}

        {/* 
                  react-pdf Page for text selection and annotations.
                  The canvas is hidden via CSS, but text/annotation layers remain visible.
                */}
        <div
          className="absolute inset-0 z-10 pdf-page-text-layer"
          style={{
            // Allow pointer events for text selection
            pointerEvents: 'auto',
          }}
        >
          <style>{`
                        /* Hide only the canvas rendered by react-pdf, keep text layer visible */
                        .pdf-page-text-layer canvas {
                            display: none !important;
                        }
                        /* Ensure text layer is positioned correctly */
                        .pdf-page-text-layer .react-pdf__Page__textContent {
                            position: absolute !important;
                            inset: 0 !important;
                            overflow: hidden !important;
                        }
                        /* Make text selectable */
                        .pdf-page-text-layer .react-pdf__Page__textContent span {
                            color: transparent;
                            cursor: text;
                        }
                        .pdf-page-text-layer .react-pdf__Page__textContent span::selection {
                            background: rgba(0, 100, 255, 0.3);
                        }
                    `}</style>
          <Page
            pageNumber={pageNum}
            width={scaledWidth}
            renderTextLayer={true}
            renderAnnotationLayer={true}
            onLoadSuccess={pageNum === 1 ? handlePageLoadSuccess : undefined}
          />
        </div>

        {/* Annotation overlay */}
        {isAnnotationMode && (
          <div
            className="absolute inset-0 z-40 cursor-crosshair 
                                   bg-black/5 hover:bg-black/10 transition-colors"
            onClick={(e) => handlePageClick(e, pageNum)}
            title="Cliquez pour ajouter une note"
          />
        )}

        {/* Annotations */}
        <div className="absolute inset-0 pointer-events-none z-50">
          <div className="w-full h-full relative">
            {renderAnnotations(pageNum)}
          </div>
        </div>
      </div>
    );
  }, [
    scrollPosition,
    scale,
    pageDimensions,
    containerWidth,
    containerHeight,
    isRenderPoolReady,
    isAnnotationMode,
    handlePageClick,
    handlePageLoadSuccess,
    renderAnnotations
  ]);

  // ═══════════════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ═══════════════════════════════════════════════════════════════════════

  return (
    <div className="h-full w-full relative">
      <div
        ref={containerRef}
        id="pdf-scroll-container"
        className="absolute inset-0 overflow-auto"
        onScroll={handleScroll}
      >
        {!file ? (
          <div className="flex flex-col items-center justify-center h-full w-full text-center opacity-50 p-6">
            <div className="w-24 h-32 border-2 border-dashed rounded-lg mb-4 flex items-center justify-center m-auto">
              <span className="text-4xl">+</span>
            </div>
            <p className="text-lg font-medium">Aucun document ouvert</p>
          </div>
        ) : (
          <div className="min-h-full flex flex-col items-center justify-start py-4 w-full">
            <Document
              file={file}
              onLoadSuccess={handleDocumentLoadSuccess}
              loading={
                <div className="flex items-center gap-3 mt-20">
                  <Loader2 className="animate-spin text-blue-500" />
                </div>
              }
              error={<div className="mt-20 text-red-500">Erreur de chargement</div>}
              className="flex flex-col gap-4 shrink-0"
            >
              {/* Outline Panel */}
              {isOutlineOpen && (
                <div className={`
                                    fixed left-0 top-16 bottom-0 w-80 border-r z-30 
                                    overflow-y-auto p-4 shadow-lg backdrop-blur-sm
                                    ${getThemeBackground()}
                                `}>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold uppercase tracking-wider text-xs opacity-70">
                      Sommaire
                    </h3>
                  </div>
                  <Outline onItemClick={handleOutlineClick} className="text-sm outline-none" />
                </div>
              )}

              {/* Content wrapper */}
              <div
                ref={contentRef}
                className={`flex gap-4 ${scrollMode === ScrollMode.CONTINUOUS ? 'flex-col' : ''}`}
              >
                {scrollMode === ScrollMode.PAGED ? (
                  <>
                    {renderPage(pageNumber, 0)}
                    {viewMode === ViewMode.DOUBLE && pageNumber + 1 <= numPages && (
                      <div className="hidden lg:block">
                        {renderPage(pageNumber + 1, 0)}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {/* Top spacer */}
                    {visiblePageRange[0] > 1 && (
                      <div
                        style={{
                          height: (visiblePageRange[0] - 1) * (pageHeight * scale + 16),
                          width: pageDimensions.width * scale
                        }}
                      />
                    )}

                    {/* Visible pages */}
                    {Array.from(
                      { length: visiblePageRange[1] - visiblePageRange[0] + 1 },
                      (_, i) => visiblePageRange[0] + i
                    )
                      .filter(pn => pn >= 1 && pn <= numPages)
                      .map((pn, idx) => {
                        const offset = idx * (pageHeight * scale + 16);
                        return renderPage(pn, offset);
                      })}

                    {/* Bottom spacer */}
                    {visiblePageRange[1] < numPages && (
                      <div
                        style={{
                          height: (numPages - visiblePageRange[1]) * (pageHeight * scale + 16),
                          width: pageDimensions.width * scale
                        }}
                      />
                    )}
                  </>
                )}
              </div>
            </Document>
          </div>
        )}
      </div>
    </div>
  );
});

PdfViewer.displayName = 'PdfViewer';

export default PdfViewer;