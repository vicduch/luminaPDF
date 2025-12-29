import React, { useState, useEffect, useRef, useMemo, useLayoutEffect } from 'react';
import { Document, Page, pdfjs, Outline } from 'react-pdf';
import { PdfDocumentProps, ViewMode, AppTheme, ScrollMode, Annotation } from '../types';
import { Loader2, Trash2, X } from './Icons';

// Set up the worker source. 
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;



// Render scale steps: render PDF at discrete levels to avoid constant re-renders
// Intermediate zoom levels are handled via CSS transform
const getRenderScale = (s: number): number => {
  // Discrete steps for canvas rendering
  const steps = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0];
  // Find the nearest step that is >= current scale (render at higher quality)
  const higherStep = steps.find(step => step >= s);
  // If we're above all steps, use the highest
  return higherStep ?? steps[steps.length - 1];
};

const PdfViewer: React.FC<PdfDocumentProps & { onTextExtract: (text: string) => void }> = ({
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
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [aspectRatio, setAspectRatio] = useState<number>(1.414); // Default A4 ratio roughly
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null); // Ref for the transformed content
  const resizeTimeoutRef = useRef<number | null>(null);

  // Active annotation being edited
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);

  // Ref to track popup for click-outside logic
  const activePopupRef = useRef<HTMLDivElement>(null);

  // Track scroll position ratio to restore center
  const scrollPosRef = useRef({ x: 0.5, y: 0 });
  const prevPageNumberRef = useRef(pageNumber);

  // Track zoom focal point details for precise restoration
  const zoomStateRef = useRef<{ targetXRatio: number; targetYRatio: number; screenX: number; screenY: number } | null>(null);

  // Store the cssScale when origin is set, for accurate drift compensation on reset
  const originCssScaleRef = useRef<number>(1);

  const [transformOrigin, setTransformOrigin] = useState<string>("top left");

  const COLORS = [
    { label: 'Jaune', value: '#facc15' },
    { label: 'Vert', value: '#4ade80' },
    { label: 'Bleu', value: '#60a5fa' },
    { label: 'Rouge', value: '#f87171' },
    { label: 'Violet', value: '#c084fc' },
  ];

  // Click outside to close active annotation logic (replaces the fixed overlay which blocked delete button)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (activeAnnotationId && activePopupRef.current && !activePopupRef.current.contains(event.target as Node)) {
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


  // Debounced Resize Observer
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        // contentRect is the size of the content box (inside padding)
        const { width, height } = entries[0].contentRect;
        if (resizeTimeoutRef.current) window.clearTimeout(resizeTimeoutRef.current);
        resizeTimeoutRef.current = window.setTimeout(() => {
          // Subtract a small buffer to prevent edge-case flickering
          setContainerWidth(Math.floor(width));
          if (onContainerDimensions) onContainerDimensions({ width, height });
        }, 150);
      }
    });

    if (containerRef.current) observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      if (resizeTimeoutRef.current) window.clearTimeout(resizeTimeoutRef.current);
    };
  }, []);

  const [visiblePageRange, setVisiblePageRange] = useState<[number, number]>([1, 5]);

  // Handle Scroll to track focal point AND visible range
  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) return;

    const { scrollLeft, scrollTop, scrollWidth, scrollHeight, clientWidth, clientHeight } = container;

    // Disable scroll tracking during zoom interactions to prevent recording unstable "transform" states
    const isZooming = Math.abs(scale - renderedScale) > 0.001;

    // 1. Track Center (Existing Logic) - ONLY if not zooming
    if (!isZooming && scrollWidth > 0 && scrollHeight > 0) {
      const cx = (scrollLeft + clientWidth / 2) / scrollWidth;
      const cy = (scrollTop + clientHeight / 2) / scrollHeight;
      scrollPosRef.current = { x: cx, y: cy };
    }

    // 2. Calculate Visible Range (Virtualization)
    if (scrollMode === ScrollMode.CONTINUOUS && contentRef.current) {
      // Estimate average page height + gap based on total scroll height
      // This is an approximation but fast enough for virtualization
      const totalHeight = contentRef.current.scrollHeight;
      const avgPageHeight = totalHeight / numPages;

      if (avgPageHeight > 0) {
        const startPage = Math.floor(scrollTop / avgPageHeight) + 1;
        const endPage = Math.ceil((scrollTop + clientHeight) / avgPageHeight);

        // Add buffer of 2 pages before and after
        const buffer = 2;
        const safeStart = Math.max(1, startPage - buffer);
        const safeEnd = Math.min(numPages, endPage + buffer);

        // Only update state if range changes significantly to avoid re-renders
        setVisiblePageRange(prev => {
          if (prev[0] !== safeStart || prev[1] !== safeEnd) {
            return [safeStart, safeEnd];
          }
          return prev;
        });
      }
    }
  };

  // Force update visible range when mode changes
  useEffect(() => {
    if (scrollMode === ScrollMode.CONTINUOUS) {
      setVisiblePageRange([1, Math.min(5, numPages)]);
      // Trigger a manual scroll check after a tick to set correct range
      setTimeout(handleScroll, 100);
    }
  }, [scrollMode, numPages, scale]);

  // Manage Transform Origin and Zoom State
  useLayoutEffect(() => {
    if (!contentRef.current) return;

    const isZooming = Math.abs(scale - renderedScale) > 0.001;

    // Calculate current cssScale for reference
    const currentRenderStep = getRenderScale(renderedScale);
    const currentCssScale = scale / currentRenderStep;

    if (isZooming && zoomFocalPoint) {
      // Set transform origin only at the START of the zoom interaction
      if (transformOrigin === "top left") {
        const rect = contentRef.current.getBoundingClientRect();

        // Calculate origin relative to the content's current visual bounding box
        // This naturally accounts for scroll and any CSS centering
        const originX = zoomFocalPoint.x - rect.left;
        const originY = zoomFocalPoint.y - rect.top;

        setTransformOrigin(`${originX}px ${originY}px`);

        // Store the cssScale at origin-set time for accurate drift compensation later
        originCssScaleRef.current = currentCssScale;

        // Capture ratios relative to THIS stable origin for restoration later
        zoomStateRef.current = {
          targetXRatio: originX / rect.width,
          targetYRatio: originY / rect.height,
          screenX: zoomFocalPoint.x,
          screenY: zoomFocalPoint.y
        };
      } else {
        // Origin already set, but update the stored cssScale as zoom progresses
        originCssScaleRef.current = currentCssScale;
      }
    } else if (!isZooming) {
      // Reset origin when stable, BUT we must compensate for the visual shift
      // caused by changing origin from (x,y) to (0,0) while scale != 1
      if (transformOrigin !== "top left") {
        const originParts = transformOrigin.split('px');
        if (originParts.length >= 2) {
          const ox = parseFloat(originParts[0]);
          const oy = parseFloat(originParts[1]);

          // Use the STORED cssScale (from when origin was active), not current (which is ≈1)
          const storedCssScale = originCssScaleRef.current;

          // Shift = Origin * (Scale - 1)
          // If we move origin from O to 0, object moves by O * (S - 1)
          // We must scroll BY this amount to keep object visually stationary
          const dx = ox * (storedCssScale - 1);
          const dy = oy * (storedCssScale - 1);

          if (containerRef.current && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) {
            containerRef.current.scrollBy({ left: dx, top: dy, behavior: 'instant' });
          }

          // Apply style immediately to prevent flicker before React render
          if (contentRef.current) {
            contentRef.current.style.transformOrigin = "top left";
          }
        }
        setTransformOrigin("top left");
        originCssScaleRef.current = 1; // Reset stored scale
      }
    }
  }, [scale, renderedScale, zoomFocalPoint, transformOrigin]);

  // Visual Centering Logic: Calculate margins to center content when it's smaller than container
  // This fixes the "Fit to Screen" left-alignment issue
  const getCenteringMargins = () => {
    if (!containerRef.current || !containerWidth) return { x: 0, y: 0 };

    // Calculate expected Visual Width based on scale
    // This assumes content basically fills the container width at scale 1 (which it does, minus margin)
    // For Double Mode: it fills full width. For Single: full width.
    const visualWidth = containerWidth * scale;

    // Check available space
    const helpW = Math.max(0, (containerRef.current.clientWidth - visualWidth) / 2);

    return { x: helpW, y: 0 };
  };

  const centering = getCenteringMargins();

  // Restore scroll position when scale or dimensions change (Zoom Logic)
  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    // 1. Precise Focal Zoom (Pinch, Wheel, or Toolbar zoom with focus)
    if (zoomStateRef.current) {
      const { targetXRatio, targetYRatio, screenX, screenY } = zoomStateRef.current;
      const containerRect = container.getBoundingClientRect();

      // content.offsetWidth/Height are the NEW layout dimensions after renderedScale update
      const contentW = content.offsetWidth;
      const contentH = content.offsetHeight;

      const docX = contentW * targetXRatio;
      const docY = contentH * targetYRatio;

      const targetScreenXRelativeToContainer = screenX - containerRect.left;
      const targetScreenYRelativeToContainer = screenY - containerRect.top;

      container.scrollTo({
        left: docX - targetScreenXRelativeToContainer,
        top: docY - targetScreenYRelativeToContainer,
        behavior: 'instant'
      });

      zoomStateRef.current = null;
      prevPageNumberRef.current = pageNumber;
      return;
    }

    // 2. Page Change - scroll to top
    const isPageChange = prevPageNumberRef.current !== pageNumber;
    if (isPageChange) {
      container.scrollTo({
        left: 0,
        top: 0,
        behavior: 'instant'
      });
      prevPageNumberRef.current = pageNumber;
      return;
    }

    // 3. Explicit "Fit to Screen" action - scroll to top-left
    // Note: Visual centering is handled by marginLeft via getCenteringMargins()
    // We only need to reset scroll position, not calculate center
    if (isFitToScreenAction) {
      container.scrollTo({
        left: 0,
        top: 0,
        behavior: 'instant'
      });
      prevPageNumberRef.current = pageNumber;
      return;
    }

    // 4. DO NOTHING for normal zoom changes. 
    // This prevents the "automatic recenter" that users hate when zooming manually.
    prevPageNumberRef.current = pageNumber;

  }, [renderedScale, containerWidth, pageNumber, isFitToScreenAction]);

  const handleDocumentLoadSuccess = async (pdf: any) => {
    onLoadSuccess({ numPages: pdf.numPages });
    try {
      const metadata = await pdf.getMetadata();
      if (metadata && metadata.info) {
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
  };

  const handlePageLoadSuccess = async (page: any) => {
    const ratio = page.originalHeight / page.originalWidth;
    setAspectRatio(ratio);

    if (onPageDimensions) {
      onPageDimensions({ width: page.originalWidth, height: page.originalHeight });
    }

    if (scrollMode === ScrollMode.PAGED && page.pageNumber === pageNumber) {
      try {
        const textContent = await page.getTextContent();
        const strings = textContent.items.map((item: any) => item.str);
        const fullText = strings.join(' ');
        onTextExtract(fullText);
      } catch (e) {
        onTextExtract("");
      }
    }
  };

  // Render scale steps: render PDF at discrete levels to avoid constant re-rendering
  // Intermediate zoom levels are handled via CSS transform
  const getPageWidth = () => {
    if (!containerWidth) return undefined;
    let baseWidth = containerWidth;
    if (viewMode === ViewMode.DOUBLE && scrollMode === ScrollMode.PAGED) {
      baseWidth = (baseWidth - 16) / 2;
    }
    // Use render steps to minimize re-renders during zoom
    const renderStep = getRenderScale(renderedScale);
    return Math.max(100, baseWidth * renderStep);
  };

  const getCanvasFilter = () => {
    switch (theme) {
      case AppTheme.DARK: return 'invert(0.9) hue-rotate(180deg) contrast(0.8)';
      case AppTheme.MIDNIGHT: return 'invert(1) hue-rotate(180deg)';
      case AppTheme.BLUE_NIGHT: return 'invert(0.9) hue-rotate(180deg) contrast(0.85) sepia(0.2)';
      case AppTheme.FOREST: return 'invert(0.85) hue-rotate(120deg) contrast(0.9) sepia(0.2)';
      case AppTheme.SEPIA: return 'sepia(0.3) contrast(0.95)';
      case AppTheme.SOLARIZED: return 'sepia(0.1) contrast(0.95)';
      default: return 'none';
    }
  };

  const getThemeBackground = () => {
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
  };

  // CSS scale compensates for the difference between actual scale and render step
  // This allows smooth visual zoom while minimizing canvas re-renders
  const renderStep = getRenderScale(renderedScale);
  const cssScale = scale / renderStep;

  const handleOutlineClick = ({ pageNumber: clickedPage, pageIndex }: { pageNumber?: string | number, pageIndex?: number }) => {
    if (clickedPage) {
      setPageNumber(Number(clickedPage));
    } else if (pageIndex !== undefined) {
      setPageNumber(pageIndex + 1);
    }
  };

  const handlePageClick = (e: React.MouseEvent, pageNum: number) => {
    if (!isAnnotationMode) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    onAddAnnotation(pageNum, x, y);
  };

  const pageWidth = getPageWidth();
  const calculatedMinHeight = pageWidth ? pageWidth * aspectRatio : undefined;

  const filterStyle = useMemo(() => ({
    filter: getCanvasFilter(),
    transition: 'filter 0.3s ease',
    minHeight: calculatedMinHeight ? `${calculatedMinHeight}px` : undefined
  }), [theme, calculatedMinHeight]);

  // --- Annotation Render Helper ---
  const renderAnnotations = (pageNum: number) => {
    const pageNotes = annotations.filter(a => a.pageNumber === pageNum);

    return pageNotes.map(note => {
      const isActive = activeAnnotationId === note.id;
      const borderColor = isActive ? 'border-gray-400' : 'border-white';

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
                        w-5 h-5 rounded-full shadow-lg border transition-all duration-200 flex items-center justify-center
                        ${isActive ? 'scale-125 ring-2 ring-blue-500 ring-offset-1 z-50' : 'hover:scale-125 z-40'}
                        ${borderColor}
                    `}
            style={{ backgroundColor: note.color || '#facc15' }}
            title="Ouvrir la note"
            type="button"
          />

          {isActive && (
            <div
              ref={activePopupRef}
              className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 bg-white rounded-lg shadow-2xl border border-gray-200 p-3 flex flex-col gap-2 animate-in zoom-in-95 duration-200 origin-top cursor-default z-50"
              onClick={(e) => e.stopPropagation()}
              style={{ minWidth: '200px' }}
            >
              <div className="flex justify-between items-center pb-1 border-b border-gray-100">
                <div className="flex gap-1.5">
                  {COLORS.map(c => (
                    <button
                      key={c.value}
                      onClick={() => onUpdateAnnotation(note.id, note.text, c.value)}
                      className={`w-3 h-3 rounded-full hover:scale-125 transition-transform ${note.color === c.value ? 'ring-1 ring-offset-1 ring-gray-400' : ''}`}
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
                  className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1 rounded transition"
                  title="Supprimer la note"
                  type="button"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <textarea
                value={note.text}
                onChange={(e) => onUpdateAnnotation(note.id, e.target.value)}
                className="w-full bg-transparent text-sm text-gray-800 focus:outline-none resize-none min-h-[80px] leading-relaxed p-1"
                placeholder="Écrivez votre commentaire ici..."
                autoFocus
              />

              <div className="flex justify-between items-center text-[10px] text-gray-400 pt-1">
                <span>{new Date(note.createdAt).toLocaleDateString()}</span>
                <span>{new Date(note.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="h-full w-full relative">
      <div
        className="absolute inset-0 overflow-auto"
        ref={containerRef}
        id="pdf-scroll-container"
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
          // items-start provides a stable coordinate system (0,0) for the scroll container.
          // The document is centered via mx-auto on the Document component itself.
          <div className="min-h-full flex flex-col items-start justify-center py-4 w-full min-w-max">
            <Document
              file={file}
              onLoadSuccess={handleDocumentLoadSuccess}
              loading={<div className="flex items-center gap-3 mt-20"><Loader2 className="animate-spin text-blue-500" /></div>}
              error={<div className="mt-20 text-red-500">Erreur de chargement</div>}
              className="flex flex-col shrink-0 mx-auto"
            >
              {isOutlineOpen && (
                <div className={`
                        fixed left-0 top-16 bottom-0 w-80 border-r z-30 overflow-y-auto p-4 shadow-lg backdrop-blur-sm fly-enter-active
                        ${getThemeBackground()}
                    `}>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold uppercase tracking-wider text-xs opacity-70">Sommaire</h3>
                  </div>
                  <Outline onItemClick={handleOutlineClick} className={`text-sm outline-none`} />
                </div>
              )}

              <div
                ref={contentRef}
                className={`flex gap-4 h-fit ${scrollMode === ScrollMode.CONTINUOUS ? 'flex-col' : ''}`}
                style={{
                  transform: `scale(${cssScale})`,
                  transformOrigin: transformOrigin,
                  gap: '16px',
                  // GPU acceleration during zoom for smoother performance
                  willChange: cssScale !== 1 ? 'transform' : 'auto',
                  // Smooth transition only when stabilizing (not during active zoom)
                  transition: Math.abs(cssScale - 1) < 0.01 ? 'transform 0.1s ease-out' : 'none',
                  // Apply calculated centering
                  marginLeft: `${centering.x}px`,
                  marginTop: `${centering.y}px`
                }}
              >
                {scrollMode === ScrollMode.PAGED ? (
                  <>
                    <div className="relative group">
                      <div style={filterStyle} className="shadow-2xl bg-white relative transition-all">
                        <Page
                          pageNumber={pageNumber}
                          scale={1}
                          width={pageWidth}
                          renderTextLayer={false}
                          renderAnnotationLayer={true}
                          onLoadSuccess={handlePageLoadSuccess}
                          className="bg-white"
                          devicePixelRatio={Math.min(2, window.devicePixelRatio)}
                        />

                        {isAnnotationMode && (
                          <div
                            className="absolute inset-0 z-40 cursor-crosshair bg-black/5 hover:bg-black/10 transition-colors"
                            onClick={(e) => handlePageClick(e, pageNumber)}
                            title="Cliquez pour ajouter une note"
                          />
                        )}

                        <div className="absolute inset-0 pointer-events-none z-50">
                          <div className="w-full h-full relative">
                            {renderAnnotations(pageNumber)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {viewMode === ViewMode.DOUBLE && pageNumber + 1 <= numPages && (
                      <div className="relative group hidden lg:block">
                        <div style={filterStyle} className="shadow-2xl bg-white relative transition-all">
                          <Page
                            pageNumber={pageNumber + 1}
                            scale={1}
                            width={pageWidth}
                            renderTextLayer={false}
                            renderAnnotationLayer={true}
                            className="bg-white"
                            devicePixelRatio={Math.min(2, window.devicePixelRatio)}
                          />
                          {isAnnotationMode && (
                            <div
                              className="absolute inset-0 z-40 cursor-crosshair bg-black/5 hover:bg-black/10 transition-colors"
                              onClick={(e) => handlePageClick(e, pageNumber + 1)}
                              title="Cliquez pour ajouter une note"
                            />
                          )}
                          <div className="absolute inset-0 pointer-events-none z-50">
                            <div className="w-full h-full relative">
                              {renderAnnotations(pageNumber + 1)}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  // Virtualized continuous scroll - only render visible pages + buffer
                  <>
                    {/* Top spacer to maintain scroll position */}
                    {visiblePageRange[0] > 1 && (
                      <div
                        style={{
                          height: `${(visiblePageRange[0] - 1) * ((calculatedMinHeight || 800) + 16)}px`,
                          width: pageWidth ? `${pageWidth}px` : '100%'
                        }}
                      />
                    )}

                    {/* Only render pages in visible range */}
                    {Array.from(
                      { length: visiblePageRange[1] - visiblePageRange[0] + 1 },
                      (_, i) => visiblePageRange[0] + i
                    ).filter(pageNum => pageNum >= 1 && pageNum <= numPages).map(pageNum => (
                      <div key={`page_${pageNum}`} className="relative group mb-4">
                        <div style={filterStyle} className="shadow-xl bg-white relative transition-all">
                          <Page
                            pageNumber={pageNum}
                            scale={1}
                            width={pageWidth}
                            renderTextLayer={false}
                            renderAnnotationLayer={true}
                            onLoadSuccess={pageNum === 1 ? handlePageLoadSuccess : undefined}
                            className="bg-white"
                            devicePixelRatio={Math.min(2, window.devicePixelRatio)}
                          />
                          {isAnnotationMode && (
                            <div
                              className="absolute inset-0 z-40 cursor-crosshair bg-black/5 hover:bg-black/10 transition-colors"
                              onClick={(e) => handlePageClick(e, pageNum)}
                            />
                          )}
                          <div className="absolute inset-0 pointer-events-none z-50">
                            <div className="w-full h-full relative">
                              {renderAnnotations(pageNum)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Bottom spacer to maintain total scroll height */}
                    {visiblePageRange[1] < numPages && (
                      <div
                        style={{
                          height: `${(numPages - visiblePageRange[1]) * ((calculatedMinHeight || 800) + 16)}px`,
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