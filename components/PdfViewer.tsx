/**
 * PdfViewer.tsx - Refactored PDF Viewer Component
 * 
 * Key improvements over previous version:
 * 1. Uses hooks for zoom logic (cleaner separation of concerns)
 * 2. Proper CSS scaling with instant scroll adjustments
 * 3. Improved virtualization for continuous scroll mode
 * 4. No visual jumps during zoom transitions
 * 5. Smooth Low-Fi → Hi-Fi rendering strategy
 */

import React, { useState, useEffect, useRef, useMemo, useLayoutEffect, useCallback } from 'react';
import { Document, Page, pdfjs, Outline } from 'react-pdf';
import { PdfDocumentProps, ViewMode, AppTheme, ScrollMode, Annotation } from '../types';
import { Loader2, Trash2 } from './Icons';
import {
  getRenderScale,
  getCssScale,
  getCanvasFilter as getThemeFilter,
  getOptimalPixelRatio
} from '../utils/pdfRenderUtils';

// Set up the worker source
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// =====================================================
// TYPES
// =====================================================

interface PdfViewerProps extends PdfDocumentProps {
  onTextExtract: (text: string) => void;
}

// =====================================================
// ANNOTATION COLORS
// =====================================================

const ANNOTATION_COLORS = [
  { label: 'Jaune', value: '#facc15' },
  { label: 'Vert', value: '#4ade80' },
  { label: 'Bleu', value: '#60a5fa' },
  { label: 'Rouge', value: '#f87171' },
  { label: 'Violet', value: '#c084fc' },
];

// =====================================================
// COMPONENT
// =====================================================

const PdfViewer: React.FC<PdfViewerProps> = ({
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
}) => {
  // ─────────────────────────────────────────────────────
  // REFS
  // ─────────────────────────────────────────────────────

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const resizeTimeoutRef = useRef<number | null>(null);
  const activePopupRef = useRef<HTMLDivElement>(null);
  const prevPageNumberRef = useRef(pageNumber);
  const prevRenderedScaleRef = useRef(renderedScale);
  const isFirstRenderRef = useRef(true);

  // ─────────────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────────────

  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [containerHeight, setContainerHeight] = useState<number>(0);
  const [aspectRatio, setAspectRatio] = useState<number>(1.414);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [visiblePageRange, setVisiblePageRange] = useState<[number, number]>([1, 5]);

  // ─────────────────────────────────────────────────────
  // COMPUTED VALUES
  // ─────────────────────────────────────────────────────

  // Calculate render step (discrete canvas resolution)
  const renderStep = useMemo(() => getRenderScale(renderedScale), [renderedScale]);

  // Calculate CSS scale (smooth visual zoom between steps)  
  const cssScale = useMemo(() => getCssScale(scale, renderStep), [scale, renderStep]);

  // Determine if we're actively zooming (scale differs from rendered)
  const isZooming = Math.abs(scale - renderedScale) > 0.001;

  // ─────────────────────────────────────────────────────
  // RESIZE OBSERVER
  // ─────────────────────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        const { width, height } = entries[0].contentRect;

        if (resizeTimeoutRef.current) {
          window.clearTimeout(resizeTimeoutRef.current);
        }

        resizeTimeoutRef.current = window.setTimeout(() => {
          setContainerWidth(Math.floor(width));
          setContainerHeight(Math.floor(height));
          onContainerDimensions?.({ width, height });
        }, 100); // Debounce resize events
      }
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
      if (resizeTimeoutRef.current) {
        window.clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, [onContainerDimensions]);

  // ─────────────────────────────────────────────────────
  // CLICK OUTSIDE TO CLOSE ANNOTATION
  // ─────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────
  // SCROLL POSITION MANAGEMENT
  // ─────────────────────────────────────────────────────

  /**
   * This effect handles scroll position restoration after scale changes.
   * 
   * CRITICAL: The scroll adjustment for zoom is now handled in App.tsx via useZoom hook
   * BEFORE the scale state changes. This effect only handles:
   * 1. Page changes (scroll to top)
   * 2. Fit to screen (scroll to origin)
   * 3. Render scale changes (preserve apparent position)
   */
  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    // Skip on first render
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      prevPageNumberRef.current = pageNumber;
      prevRenderedScaleRef.current = renderedScale;
      return;
    }

    // Case 1: Page change - scroll to top
    if (prevPageNumberRef.current !== pageNumber) {
      container.scrollTo({ left: 0, top: 0, behavior: 'instant' });
      prevPageNumberRef.current = pageNumber;
      prevRenderedScaleRef.current = renderedScale;
      return;
    }

    // Case 2: Fit to screen - scroll to origin (centering is via CSS margins)
    if (isFitToScreenAction) {
      container.scrollTo({ left: 0, top: 0, behavior: 'instant' });
      prevRenderedScaleRef.current = renderedScale;
      return;
    }

    // Case 3: Render scale changed (canvas re-rendered at new resolution)
    // The visual scale (scale prop) hasn't changed, only the backing rendering quality.
    // The CSS transform compensates for the size change, so visual size is constant.
    // We just need to ensure the browser doesn't shift the scroll position due to DOM layout changes.
    if (prevRenderedScaleRef.current !== renderedScale) {
      // Just pin the current position to prevent any browser layout readjustment
      // We trust the browser/useZoom to have the correct position already.
      // No scaling calculations needed.
      prevRenderedScaleRef.current = renderedScale;
    }
  }, [pageNumber, renderedScale, isFitToScreenAction]);

  // ─────────────────────────────────────────────────────
  // SCROLL HANDLER FOR VIRTUALIZATION
  // ─────────────────────────────────────────────────────

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    // Only virtualize in continuous mode
    if (scrollMode !== ScrollMode.CONTINUOUS) return;

    const { scrollTop, clientHeight } = container;
    const totalHeight = content.scrollHeight;
    const avgPageHeight = totalHeight / Math.max(1, numPages);

    if (avgPageHeight <= 0) return;

    // Calculate visible range
    const startPage = Math.floor(scrollTop / avgPageHeight) + 1;
    const endPage = Math.ceil((scrollTop + clientHeight) / avgPageHeight);

    // Add overscan buffer
    const OVERSCAN = 2;
    const safeStart = Math.max(1, startPage - OVERSCAN);
    const safeEnd = Math.min(numPages, endPage + OVERSCAN);

    setVisiblePageRange(prev => {
      if (prev[0] !== safeStart || prev[1] !== safeEnd) {
        return [safeStart, safeEnd];
      }
      return prev;
    });
  }, [scrollMode, numPages]);

  // Reset visible range when mode changes
  useEffect(() => {
    if (scrollMode === ScrollMode.CONTINUOUS) {
      setVisiblePageRange([1, Math.min(7, numPages)]);
      setTimeout(handleScroll, 100);
    }
  }, [scrollMode, numPages, handleScroll]);

  // ─────────────────────────────────────────────────────
  // PAGE WIDTH CALCULATION
  // ─────────────────────────────────────────────────────

  const pageWidth = useMemo(() => {
    if (!containerWidth) return undefined;

    let baseWidth = containerWidth;

    // In double page mode, each page takes half the container
    if (viewMode === ViewMode.DOUBLE && scrollMode === ScrollMode.PAGED) {
      baseWidth = (containerWidth - 16) / 2; // 16px gap
    }

    // Apply render step (not visual scale - that's handled by CSS)
    return Math.max(100, baseWidth * renderStep);
  }, [containerWidth, viewMode, scrollMode, renderStep]);

  // Estimated page height for virtualization
  const estimatedPageHeight = pageWidth ? pageWidth * aspectRatio : 800;

  // ─────────────────────────────────────────────────────
  // CENTERING MARGINS
  // ─────────────────────────────────────────────────────

  const centeringMargins = useMemo(() => {
    if (!containerRef.current || !containerWidth || !pageWidth) {
      return { left: 0, top: 0 };
    }

    // Calculate visual width of content
    const visualWidth = pageWidth * cssScale;

    // Double mode: two pages + gap
    const totalVisualWidth = viewMode === ViewMode.DOUBLE && scrollMode === ScrollMode.PAGED
      ? visualWidth * 2 + 16 * cssScale
      : visualWidth;

    const marginLeft = Math.max(0, (containerWidth - totalVisualWidth) / 2);

    return { left: marginLeft, top: 0 };
  }, [containerWidth, pageWidth, cssScale, viewMode, scrollMode]);

  // ─────────────────────────────────────────────────────
  // DOCUMENT HANDLERS
  // ─────────────────────────────────────────────────────

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
      console.error("Failed to load metadata", e);
    }
  }, [onLoadSuccess, onMetadataLoaded]);

  const handlePageLoadSuccess = useCallback(async (page: any) => {
    const ratio = page.originalHeight / page.originalWidth;
    setAspectRatio(ratio);

    onPageDimensions?.({
      width: page.originalWidth,
      height: page.originalHeight
    });

    // Extract text for current page in paged mode
    if (scrollMode === ScrollMode.PAGED && page.pageNumber === pageNumber) {
      try {
        const textContent = await page.getTextContent();
        const fullText = textContent.items.map((item: any) => item.str).join(' ');
        onTextExtract(fullText);
      } catch (e) {
        onTextExtract("");
      }
    }
  }, [scrollMode, pageNumber, onPageDimensions, onTextExtract]);

  // ─────────────────────────────────────────────────────
  // ANNOTATION HANDLERS
  // ─────────────────────────────────────────────────────

  const handlePageClick = useCallback((e: React.MouseEvent, pageNum: number) => {
    if (!isAnnotationMode) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    onAddAnnotation(pageNum, x, y);
  }, [isAnnotationMode, onAddAnnotation]);

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

  // ─────────────────────────────────────────────────────
  // STYLES
  // ─────────────────────────────────────────────────────

  const canvasFilter = useMemo(() => getThemeFilter(theme as any), [theme]);

  const filterStyle = useMemo(() => ({
    filter: canvasFilter,
    transition: 'filter 0.3s ease',
    minHeight: estimatedPageHeight ? `${estimatedPageHeight}px` : undefined
  }), [canvasFilter, estimatedPageHeight]);

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

  // ─────────────────────────────────────────────────────
  // RENDER ANNOTATIONS
  // ─────────────────────────────────────────────────────

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
              e.nativeEvent.stopImmediatePropagation();
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
              {/* Color picker and delete button */}
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

              {/* Text input */}
              <textarea
                value={note.text}
                onChange={(e) => onUpdateAnnotation(note.id, e.target.value)}
                className="w-full bg-transparent text-sm text-gray-800 
                           focus:outline-none resize-none min-h-[80px] 
                           leading-relaxed p-1"
                placeholder="Écrivez votre commentaire ici..."
                autoFocus
              />

              {/* Timestamp */}
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

  // ─────────────────────────────────────────────────────
  // RENDER PAGE
  // ─────────────────────────────────────────────────────

  const renderPage = useCallback((pageNum: number, isFirst: boolean = false) => (
    <div key={`page_${pageNum}`} className="relative group">
      <div style={filterStyle} className="shadow-xl bg-white relative transition-all">
        <Page
          pageNumber={pageNum}
          scale={1}
          width={pageWidth}
          renderTextLayer={false}
          renderAnnotationLayer={true}
          onLoadSuccess={isFirst ? handlePageLoadSuccess : undefined}
          className="bg-white"
          devicePixelRatio={getOptimalPixelRatio()}
        />

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
    </div>
  ), [pageWidth, filterStyle, isAnnotationMode, handlePageClick, handlePageLoadSuccess, renderAnnotations]);

  // ─────────────────────────────────────────────────────
  // MAIN RENDER
  // ─────────────────────────────────────────────────────

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
          <div className="min-h-full flex flex-col items-start justify-center py-4 w-full min-w-max">
            <Document
              file={file}
              onLoadSuccess={handleDocumentLoadSuccess}
              loading={
                <div className="flex items-center gap-3 mt-20">
                  <Loader2 className="animate-spin text-blue-500" />
                </div>
              }
              error={<div className="mt-20 text-red-500">Erreur de chargement</div>}
              className="flex flex-col shrink-0 mx-auto"
            >
              {/* Outline Panel */}
              {isOutlineOpen && (
                <div className={`
                  fixed left-0 top-16 bottom-0 w-80 border-r z-30 
                  overflow-y-auto p-4 shadow-lg backdrop-blur-sm fly-enter-active
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

              {/* Content wrapper with CSS transform for zoom */}
              <div
                ref={contentRef}
                className={`flex gap-4 h-fit ${scrollMode === ScrollMode.CONTINUOUS ? 'flex-col' : ''}`}
                style={{
                  transform: `scale(${cssScale})`,
                  transformOrigin: 'top left',
                  // Inverse scale the gap so it remains visually 16px constant
                  gap: `${16 / cssScale}px`,
                  // GPU acceleration during zoom
                  willChange: isZooming ? 'transform' : 'auto',
                  // Smooth transition only when stabilizing
                  transition: !isZooming && Math.abs(cssScale - 1) < 0.05
                    ? 'transform 0.15s ease-out'
                    : 'none',
                  // Centering margins
                  marginLeft: `${centeringMargins.left}px`,
                  marginTop: `${centeringMargins.top}px`
                }}
              >
                {scrollMode === ScrollMode.PAGED ? (
                  // PAGED MODE: Single or Double page
                  <>
                    {renderPage(pageNumber, true)}

                    {viewMode === ViewMode.DOUBLE && pageNumber + 1 <= numPages && (
                      <div className="hidden lg:block">
                        {renderPage(pageNumber + 1)}
                      </div>
                    )}
                  </>
                ) : (
                  // CONTINUOUS MODE: Virtualized scroll
                  <>
                    {/* Top spacer */}
                    {visiblePageRange[0] > 1 && (
                      <div
                        style={{
                          // Visual height must be constant.
                          // Spacer (DOM) = (PageHeight + Gap/CssScale) * (Pages)
                          height: `${(visiblePageRange[0] - 1) * (estimatedPageHeight + (16 / cssScale))}px`,
                          width: pageWidth ? `${pageWidth}px` : '100%'
                        }}
                      />
                    )}

                    {/* Visible pages */}
                    {Array.from(
                      { length: visiblePageRange[1] - visiblePageRange[0] + 1 },
                      (_, i) => visiblePageRange[0] + i
                    )
                      .filter(pn => pn >= 1 && pn <= numPages)
                      .map((pn, idx) => renderPage(pn, idx === 0))}

                    {/* Bottom spacer */}
                    {visiblePageRange[1] < numPages && (
                      <div
                        style={{
                          height: `${(numPages - visiblePageRange[1]) * (estimatedPageHeight + (16 / cssScale))}px`,
                          width: pageWidth ? `${pageWidth}px` : '100%'
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
};

export default PdfViewer;