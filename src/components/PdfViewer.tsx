import React, { forwardRef, useImperativeHandle, useRef, useEffect, useState, useCallback, useLayoutEffect, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { AppTheme, Annotation, ScrollMode } from '../types';
import { ThemeVariant, getRenderPalette, getThemePalette } from '../utils/ThemeManager';
import { useDebounce } from '../hooks/useDebounce';
import AnnotationLayer from './AnnotationLayer';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import OutlinePanel from './OutlinePanel';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Configure PDF.js worker (local — no CDN latency)
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export interface PdfViewerRef {
  containerRef: React.RefObject<HTMLDivElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  scrollToPage: (page: number) => void;
}

interface PdfViewerProps {
  file: any;
  pageNumber: number;
  scale: number;
  numPages: number;
  scrollMode?: ScrollMode;
  theme?: AppTheme;
  themeVariant?: ThemeVariant;
  annotations?: Annotation[];
  isAnnotationMode?: boolean;
  annotationColor?: string;
  onLoadSuccess?: (data: { numPages: number }) => void;
  onPageDimensions?: (dims: { width: number; height: number }) => void;
  onContainerDimensions?: (dims: { width: number; height: number }) => void;
  setPageNumber?: (page: number) => void;
  onScaleChange?: (newScale: number) => void;
  onAddAnnotation?: (pageNumber: number, x: number, y: number) => void;
  onUpdateAnnotation?: (id: string, text: string) => void;
  onDeleteAnnotation?: (id: string) => void;
  isOutlineOpen?: boolean;
  onToggleOutline?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// LAZY PAGE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface LazyPageProps {
  pageNumber: number;
  scale: number;
  debouncedScale: number;
  pageDimensions: { width: number; height: number };
  containerRef: React.RefObject<HTMLDivElement | null>;
  theme?: AppTheme;
  themeVariant?: ThemeVariant;
  annotations?: Annotation[];
  isAnnotationMode?: boolean;
  annotationColor?: string;
  onAddAnnotation?: (pageNumber: number, x: number, y: number) => void;
  onUpdateAnnotation?: (id: string, text: string) => void;
  onDeleteAnnotation?: (id: string) => void;
  onLoadSuccess?: (page: any) => void;
  onVisible?: (pageNumber: number) => void;
  forceRender?: boolean;
  currentPage?: number; // NEW: For priority-based loading
}

// ─────────────────────────────────────────────────────────────────────────────
// THEME FILTER — CSS feColorMatrix for per-pixel PDF colorization
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// THEME FILTER — DOM-based SVG Filter for stable colorization
// ─────────────────────────────────────────────────────────────────────────────

const ThemeFilterDefs: React.FC<{ theme?: AppTheme, variant?: ThemeVariant }> = ({ theme, variant }) => {
  if (!theme || !variant) return null;

  const palette = getRenderPalette(theme, variant);
  const [bgR, bgG, bgB] = palette.bg;
  const [fgR, fgG, fgB] = palette.fg;

  // Identity case: standard values (white bg, black fg) -> no matrix needed
  // checking if we are exactly on standard light theme
  const isIdentity = bgR === 255 && bgG === 255 && bgB === 255 && fgR === 0 && fgG === 0 && fgB === 0;

  if (isIdentity) return null;

  // Linear interpolation: output = fg + (bg - fg) * input/255
  // Slope (S) = (bg - fg) / 255
  // Offset (O) = fg / 255
  const rS = ((bgR - fgR) / 255).toFixed(4);
  const gS = ((bgG - fgG) / 255).toFixed(4);
  const bS = ((bgB - fgB) / 255).toFixed(4);
  const rO = (fgR / 255).toFixed(4);
  const gO = (fgG / 255).toFixed(4);
  const bO = (fgB / 255).toFixed(4);

  const matrix = `${rS} 0 0 0 ${rO} 0 ${gS} 0 0 ${gO} 0 0 ${bS} 0 ${bO} 0 0 0 1 0`;

  return (
    <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <defs>
        <filter id="lumina-theme-filter" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values={matrix} />
        </filter>
      </defs>
    </svg>
  );
};

const LazyPageInner: React.FC<LazyPageProps> = ({ pageNumber, scale, debouncedScale, pageDimensions, containerRef, theme, themeVariant, annotations = [], isAnnotationMode = false, annotationColor = '#facc15', onAddAnnotation, onUpdateAnnotation, onDeleteAnnotation, onLoadSuccess, onVisible, forceRender = false, currentPage }) => {
  const [isRendered, setIsRendered] = React.useState(forceRender);
  const elementRef = useRef<HTMLDivElement>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);

  // Priority hint for <Page loading> attribute (does not affect observer lifecycle)
  const distanceFromCurrent = currentPage ? Math.abs(pageNumber - currentPage) : Infinity;
  const isPriority = distanceFromCurrent <= 3;

  // No-flash zoom transitions:
  // keep currentSnapshot visible until the latest HD render succeeds.
  const [currentSnapshot, setCurrentSnapshot] = React.useState<string | null>(null);
  const [isSnapshotReady, setIsSnapshotReady] = React.useState(false);
  const [isTransitioning, setIsTransitioning] = React.useState(false);
  const prevScaleRef = useRef(scale);
  const prevDebouncedScaleRef = useRef(debouncedScale);
  const latestRenderEpochRef = useRef(0);
  const [renderEpoch, setRenderEpoch] = useState(0);

  // INSTANT capture on scale change (synchronous, no flash)
  useEffect(() => {
    if (scale !== prevScaleRef.current && isRendered) {
      const canvas = canvasWrapperRef.current?.querySelector('canvas');
      if (canvas) {
        try {
          // Synchronous capture (no async delay = no flash)
          const dataURL = canvas.toDataURL('image/png', 0.92); // 92% quality for speed

          // Capture current frame as SD snapshot.
          if (dataURL) {
            setIsSnapshotReady(false);
            setCurrentSnapshot(dataURL);
            setIsTransitioning(true);
          }
        } catch (err) {
          // Canvas might be tainted (CORS) — fallback to no snapshot
          console.warn('[LazyPage] Canvas capture failed:', err);
        }
      }
      prevScaleRef.current = scale;
    }
  }, [scale, isRendered]);

  // Trigger HD re-render on debouncedScale stabilization
  useEffect(() => {
    if (debouncedScale !== prevDebouncedScaleRef.current) {
      prevDebouncedScaleRef.current = debouncedScale;
      latestRenderEpochRef.current += 1;
      setRenderEpoch(latestRenderEpochRef.current);
    }
  }, [debouncedScale]);

  // Clear snapshot only when the latest render epoch has completed.
  const handleRenderSuccess = useCallback(() => {
    const epochAtRenderStart = renderEpoch;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (epochAtRenderStart !== latestRenderEpochRef.current) return;
        setIsTransitioning(false);
        setIsSnapshotReady(false);
        setCurrentSnapshot(null);
      });
    });
  }, [renderEpoch]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (currentSnapshot?.startsWith('blob:')) URL.revokeObjectURL(currentSnapshot);
    };
  }, [currentSnapshot]);

  // Combined observer: tracks both visibility (active page) and render eligibility
  useEffect(() => {
    const el = elementRef.current;
    const root = containerRef.current;
    if (!el || !root) return;

    // Observer 1: Active page tracking (center of viewport)
    const activeObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onVisible?.(pageNumber);
        }
      },
      { root, rootMargin: '-50% 0% -50% 0%', threshold: 0 }
    );
    activeObserver.observe(el);

    // Observer 2: Render eligibility (reversible — load when near, unload when far)
    // Stable 2000px margin — decoupled from currentPage to prevent observer churn
    const renderObserver = new IntersectionObserver(
      ([entry]) => {
        setIsRendered(entry.isIntersecting);
      },
      { root, rootMargin: '2000px' }
    );
    renderObserver.observe(el);

    return () => {
      activeObserver.disconnect();
      renderObserver.disconnect();
    };
  }, [pageNumber, onVisible, containerRef]);

  // Sprint 2.9: Camera Architecture - Physical layout dimensions are FIXED 1:1
  const width = pageDimensions.width;
  const height = pageDimensions.height;

  // Higher-quality rasterization: adaptively oversample at every zoom level.
  const qualityBoost = useMemo(() => {
    if (debouncedScale <= 1) return 1.22;
    if (debouncedScale <= 2) return 1.18;
    if (debouncedScale <= 4) return 1.14;
    return 1.1;
  }, [debouncedScale]);

  const effectiveRenderScale = debouncedScale * qualityBoost;
  const renderWidth = pageDimensions.width * effectiveRenderScale;
  const inverseScale = 1 / effectiveRenderScale;

  const renderDevicePixelRatio = useMemo(() => {
    if (typeof window === 'undefined') return 1.5;
    const baseDpr = window.devicePixelRatio || 1;
    const adaptiveBoost = 1 + 0.3 / (1 + debouncedScale); // stronger at low zoom
    return Math.min(2.8, Math.max(1.5, baseDpr * adaptiveBoost));
  }, [debouncedScale]);

  // Theme colorization: reference the DOM-based SVG filter by ID
  const filterStyle = useMemo(() => {
    if (!theme || !themeVariant) return 'none';

    // Check identity: standard light theme (white bg, black fg) needs no filter
    const palette = getRenderPalette(theme, themeVariant);
    const [bgR, bgG, bgB] = palette.bg;
    const [fgR, fgG, fgB] = palette.fg;
    const isIdentity = bgR === 255 && bgG === 255 && bgB === 255 && fgR === 0 && fgG === 0 && fgB === 0;

    if (isIdentity) return 'none';

    let f = 'url(#lumina-theme-filter)';
    if (theme === AppTheme.EINK) {
      f += ' grayscale(1) contrast(0.95)';
    }
    return f;
  }, [theme, themeVariant]);

  // Dynamic page background — matches theme paperBg instead of hardcoded white
  const paperBg = useMemo(() => {
    if (!theme || !themeVariant) return '#ffffff';
    return getThemePalette(theme, themeVariant).paperBg;
  }, [theme, themeVariant]);

  return (
    <div
      ref={elementRef}
      data-page-number={pageNumber}
      style={{
        width,
        height,
        filter: filterStyle,
        position: 'relative',
        // CRITICAL FIX: When filter is active (White->Dark), the container MUST be White
        // to be transformed into the correct dark PaperBg.
        // If we set it to dark, the filter transforms it to Light (Flash/Border)!
        backgroundColor: filterStyle !== 'none' ? '#ffffff' : paperBg,
      }}
      className="shrink-0 overflow-hidden"
    >
      {isRendered ? (
        <>
          {/* SD snapshot overlay while HD render is in flight */}
          {currentSnapshot && isTransitioning && (
            <img
              src={currentSnapshot}
              onLoad={() => setIsSnapshotReady(true)}
              onError={() => setIsSnapshotReady(false)}
              alt=""
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                touchAction: 'none',
                zIndex: 2,
                opacity: 1,
                transition: 'opacity 120ms ease-out',
                willChange: 'opacity',
              }}
            />
          )}
          {/* HD Canvas (base layer) */}
          <div
            ref={canvasWrapperRef}
            style={{
              transform: `scale(${inverseScale})`,
              transformOrigin: '0 0',
              width: renderWidth,
              opacity: isTransitioning && currentSnapshot && isSnapshotReady ? 0 : 1,
              transition: 'opacity 120ms ease-in',
            }}
          >
            <Page
              pageNumber={pageNumber}
              width={renderWidth}
              devicePixelRatio={renderDevicePixelRatio}
              renderTextLayer={true}
              renderAnnotationLayer={true}
              onLoadSuccess={onLoadSuccess}
              onRenderSuccess={handleRenderSuccess}
              loading={isPriority ? 'eager' : 'lazy'}
            />
          </div>
          {onAddAnnotation && onUpdateAnnotation && onDeleteAnnotation && (
            <AnnotationLayer
              pageNumber={pageNumber}
              annotations={annotations}
              isAnnotationMode={isAnnotationMode}
              annotationColor={annotationColor}
              onAddAnnotation={onAddAnnotation}
              onUpdateAnnotation={onUpdateAnnotation}
              onDeleteAnnotation={onDeleteAnnotation}
            />
          )}
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs">
          Page {pageNumber}
        </div>
      )}
    </div>
  );
};

// Memoize LazyPage — currentPage intentionally excluded: observer lifecycle is
// decoupled from currentPage, so re-rendering all pages on every scroll step
// is unnecessary and causes 350× observer churn.
const LazyPage = React.memo(LazyPageInner, (prev, next) => {
  return prev.pageNumber === next.pageNumber
    && prev.debouncedScale === next.debouncedScale
    && prev.scale === next.scale
    && prev.pageDimensions === next.pageDimensions
    && prev.theme === next.theme
    && prev.themeVariant === next.themeVariant
    && prev.annotations === next.annotations
    && prev.isAnnotationMode === next.isAnnotationMode
    && prev.annotationColor === next.annotationColor;
});

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const PdfViewer = forwardRef<PdfViewerRef, PdfViewerProps>((props, ref) => {
  const {
    file,
    pageNumber,
    scale,
    numPages,
    scrollMode,
    theme,
    themeVariant,
    annotations = [],
    isAnnotationMode = false,
    annotationColor = '#facc15',
    onLoadSuccess,
    onPageDimensions,
    onContainerDimensions,
    setPageNumber,
    onScaleChange,
    onAddAnnotation,
    onUpdateAnnotation,
    onDeleteAnnotation,
    isOutlineOpen = false,
    onToggleOutline
  } = props;

  // Keep SD snapshot visible longer; trigger HD after gesture settles.
  const debouncedScale = useDebounce(scale, 180);

  // Mobile OS detection for adaptive workspace (Android/iOS/iPadOS only — not Windows touchscreens)
  const isMobileOS = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const ua = navigator.userAgent;
    return /Android/i.test(ua) || /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS
  }, []);

  // Sprint Perf-A: Pre-filter annotations per page to avoid O(n) re-renders
  const emptyAnnotations: Annotation[] = useMemo(() => [], []);
  const annotationsByPage = useMemo(() => {
    const map = new Map<number, Annotation[]>();
    for (const ann of annotations) {
      const existing = map.get(ann.pageNumber);
      if (existing) {
        existing.push(ann);
      } else {
        map.set(ann.pageNumber, [ann]);
      }
    }
    return map;
  }, [annotations]);

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [pageDimensions, setPageDimensionsInternal] = useState({ width: 612, height: 792 });
  const [allPagesDimensions, setAllPagesDimensions] = useState<Map<number, { width: number, height: number }>>(new Map());
  const [containerDims, setContainerDims] = useState({ width: 0, height: 0 });

  // Sprint 2.6: Stable Zoom - Keep center fixed
  const lastScaleRef = useRef(scale);
  const isFirstRender = useRef(true);

  // Navigation lock: suppresses IntersectionObserver page updates during programmatic scroll
  const navLockRef = useRef(false);

  // Initialize isFirstRender after the first layout cycle
  useEffect(() => {
    isFirstRender.current = false;
  }, []);

  // Sprint 2.7: Initial Centering on File Load - Invariant Workspace Center
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !file || numPages === 0 || allPagesDimensions.size === 0) return;

    const centerDocument = () => {
      const content = contentRef.current;
      if (!content) return;

      // If restoring a reading position in continuous mode, scroll to that page
      if (scrollMode === ScrollMode.CONTINUOUS && pageNumber > 1) {
        const paddingTop = container.clientHeight;
        const gap = 32; // gap-8 = 2rem = 32px
        let targetTop = paddingTop;

        for (let i = 1; i < pageNumber; i++) {
          const dims = allPagesDimensions.get(i);
          if (dims) targetTop += dims.height + gap;
        }

        container.scrollTo({
          left: (content.scrollWidth / 2) - (container.clientWidth / 2),
          top: targetTop,
          behavior: 'instant'
        });
      } else {
        // Default: center on the workspace geometric center
        container.scrollTo({
          left: (content.scrollWidth / 2) - (container.clientWidth / 2),
          top: (content.scrollHeight / 2) - (container.clientHeight / 2),
          behavior: 'instant'
        });
      }
    };

    // Double rAF ensures the layout is painted and dimensions are stable before measuring
    requestAnimationFrame(() => requestAnimationFrame(centerDocument));
  }, [file, numPages, allPagesDimensions.size]);

  // Sprint 2.11: Stabilize scroll position when changing scroll mode
  const lastScrollModeRef = useRef(scrollMode);
  const pageNumberAtModeChangeRef = useRef(pageNumber);

  // Track pageNumber changes separately
  useEffect(() => {
    pageNumberAtModeChangeRef.current = pageNumber;
  }, [pageNumber]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;

    // Only act when scrollMode actually changes
    if (!container || !content || scrollMode === lastScrollModeRef.current) {
      return;
    }

    const targetPage = pageNumberAtModeChangeRef.current;
    lastScrollModeRef.current = scrollMode;

    const stabilizePosition = () => {
      if (scrollMode === ScrollMode.CONTINUOUS && targetPage > 0 && allPagesDimensions.size > 0) {
        // Calculate the vertical offset of the target page
        // Account for: padding-top (container height) + cumulative page heights + gaps
        const paddingTop = container.clientHeight;
        const gap = 32; // gap-8 = 2rem = 32px
        let targetTop = paddingTop;

        for (let i = 1; i < targetPage; i++) {
          const dims = allPagesDimensions.get(i);
          if (dims) {
            targetTop += dims.height + gap;
          }
        }

        // Center horizontally, scroll to page top vertically
        container.scrollTo({
          left: (content.scrollWidth / 2) - (container.clientWidth / 2),
          top: targetTop,
          behavior: 'instant'
        });
      } else if (scrollMode === ScrollMode.PAGED) {
        // When switching to paged mode, center the document
        container.scrollTo({
          left: (content.scrollWidth / 2) - (container.clientWidth / 2),
          top: (content.scrollHeight / 2) - (container.clientHeight / 2),
          behavior: 'instant'
        });
      }
    };

    // Wait for layout to stabilize
    requestAnimationFrame(() => requestAnimationFrame(stabilizePosition));
  }, [scrollMode, allPagesDimensions]);

  // Sprint 2.6: Stable Zoom - Invariant Center Projection (Aiming Engine)
  // Uses rAF batching to prevent jitter from rapid touchpad events
  const aimingRafRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content || scale === lastScaleRef.current) {
      lastScaleRef.current = scale;
      return;
    }

    // Skip stabilization on first render or when scale is restored via App
    if (isFirstRender.current) {
      lastScaleRef.current = scale;
      return;
    }

    // Capture current state before rAF
    const { scrollLeft, scrollTop, clientWidth, clientHeight } = container;
    const oldScale = lastScaleRef.current;
    const ratio = scale / oldScale;
    lastScaleRef.current = scale;

    // Cancel any pending correction to avoid stacking
    if (aimingRafRef.current !== null) {
      cancelAnimationFrame(aimingRafRef.current);
    }

    aimingRafRef.current = requestAnimationFrame(() => {
      aimingRafRef.current = null;

      // 1. Invariant center of the workspace (center of expansion / Pivot)
      const Cx = content.scrollWidth / 2;
      const Cy = content.scrollHeight / 2;

      // 2. Current center of the viewport (Visual-CSS Center)
      const viewCenterX = scrollLeft + clientWidth / 2;
      const viewCenterY = scrollTop + clientHeight / 2;

      // 3. Projection: newCenterX = Cx + (viewCenterX - Cx) * ratio
      const newCenterX = Cx + (viewCenterX - Cx) * ratio;
      const newCenterY = Cy + (viewCenterY - Cy) * ratio;

      // 4. Update viewport position
      container.scrollTo({
        left: newCenterX - clientWidth / 2,
        top: newCenterY - clientHeight / 2,
        behavior: 'instant'
      });
    });
  }, [scale]);

  // Sprint 1.1: Stable callback for page visibility tracking
  // Suppressed during programmatic navigation to avoid feedback loops
  const handlePageVisible = useCallback((pn: number) => {
    if (navLockRef.current) return; // Locked during keyboard navigation
    if (setPageNumber) {
      setPageNumber(pn);
    }
  }, [setPageNumber]);

  // Sprint Perf-A: Stable document load handler (prevents re-triggering on re-renders)
  const pdfDocRef = useRef<any>(null);

  const handleDocumentLoad = useCallback(async (pdf: any) => {
    pdfDocRef.current = pdf;
    onLoadSuccess?.({ numPages: pdf.numPages });
    try {
      const pageIndices = Array.from({ length: pdf.numPages }, (_, i) => i + 1);
      const dimsMap = new Map<number, { width: number, height: number }>();

      await Promise.all(pageIndices.map(async (index) => {
        const page = await pdf.getPage(index);
        const viewport = page.getViewport({ scale: 1 });
        dimsMap.set(index, { width: viewport.width, height: viewport.height });
      }));

      setAllPagesDimensions(dimsMap);

      const firstPageDims = dimsMap.get(1) || { width: 612, height: 792 };
      setPageDimensionsInternal(firstPageDims);
      onPageDimensions?.(firstPageDims);

    } catch (err) {
      console.warn('[PdfViewer] Failed to load document details:', err);
    }
  }, [onLoadSuccess, onPageDimensions]);

  // Instantly center a page vertically in the viewport (DOM-based, zero drift)
  const scrollToPage = useCallback((targetPage: number) => {
    const container = containerRef.current;
    if (!container) return;

    // Engage navigation lock to prevent IntersectionObserver interference
    navLockRef.current = true;
    setTimeout(() => { navLockRef.current = false; }, 300);

    // Find the actual page element in the DOM
    const pageEl = container.querySelector(`[data-page-number="${targetPage}"]`) as HTMLElement | null;
    if (!pageEl) return;

    // Get the page's position relative to the scrollable container
    // We need offsetTop relative to the scroll content, not the viewport
    const pageRect = pageEl.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    // Current scroll + element position relative to container = absolute position in scroll space
    const pageTopInScroll = container.scrollTop + (pageRect.top - containerRect.top);
    const pageHeightInScroll = pageRect.height;
    const viewportHeight = container.clientHeight;

    // Center: scroll so page middle = viewport middle
    const targetTop = pageTopInScroll - (viewportHeight - pageHeightInScroll) / 2;

    container.scrollTop = targetTop;
  }, []);

  useImperativeHandle(ref, () => ({
    containerRef,
    contentRef,
    scrollToPage
  }));

  // Track container dimensions for "Fit to Width"
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !onContainerDimensions) return;

    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        const { width, height } = entries[0].contentRect;
        onContainerDimensions({ width, height });
        setContainerDims({ width, height });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [onContainerDimensions]);

  // Handle PDF internal links (TOC, Index, Cross-refs)
  // Resolves both #page=N links and named destinations via PDF.js API
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleInternalLinkClick = async (e: MouseEvent) => {
      // Find the closest anchor tag
      const link = (e.target as HTMLElement).closest('a');
      if (!link) return;

      const href = link.getAttribute('href');
      if (!href) return;

      // Only handle internal links (starts with #)
      if (!href.startsWith('#')) return;
      e.preventDefault();

      // 1. Try #page=N format
      const pageMatch = href.match(/page=(\d+)/);
      if (pageMatch) {
        const targetPn = parseInt(pageMatch[1], 10);
        scrollToPage(targetPn);
        if (setPageNumber) setPageNumber(targetPn);
        return;
      }

      // 2. Try named destination via PDF.js API
      const destName = decodeURIComponent(href.substring(1)); // remove #
      if (!destName || !pdfDocRef.current) return;

      try {
        const pdf = pdfDocRef.current;
        const dest = await pdf.getDestination(destName);
        if (dest) {
          const ref = dest[0]; // First element is the page reference
          const pageIndex = await pdf.getPageIndex(ref);
          const targetPn = pageIndex + 1; // PDF.js uses 0-based index
          scrollToPage(targetPn);
          if (setPageNumber) setPageNumber(targetPn);
        }
      } catch (err) {
        console.warn('[PdfViewer] Failed to resolve destination:', destName, err);
      }
    };

    container.addEventListener('click', handleInternalLinkClick);
    return () => container.removeEventListener('click', handleInternalLinkClick);
  }, [scrollToPage, setPageNumber]);

  // Sprint 2.9: Pinch-to-Zoom via wheel event with ctrlKey
  // Uses a ref for scale so the handler is mounted once (no re-creation jitter)
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  const onScaleChangeRef = useRef(onScaleChange);
  onScaleChangeRef.current = onScaleChange;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // Pinch-to-zoom on touchpad sends wheel events with ctrlKey=true
      if (e.ctrlKey) {
        e.preventDefault();

        // Calculate zoom factor (higher multiplier = faster zoom)
        const zoomFactor = 1 - e.deltaY * 0.003;
        const newScale = Math.max(0.1, Math.min(8.0, scaleRef.current * zoomFactor));

        onScaleChangeRef.current?.(newScale);
      }
    };

    // passive: false is required to allow preventDefault
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []); // Mounted once — no re-creation

  // Sprint 2.10: Pinch-to-Zoom via touch events (touchscreen)
  // Sprint Perf-D: Use refs to avoid re-mounting handlers on every scale change
  const initialPinchDistance = useRef<number | null>(null);
  const initialPinchScale = useRef<number>(scale);
  const scaleRefTouch = useRef(scale);
  scaleRefTouch.current = scale;

  const onScaleChangeRefTouch = useRef(onScaleChange);
  onScaleChangeRefTouch.current = onScaleChange;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const getDistance = (touches: TouchList): number => {
      if (touches.length < 2) return 0;
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        initialPinchDistance.current = getDistance(e.touches);
        initialPinchScale.current = scaleRefTouch.current;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && initialPinchDistance.current !== null) {
        e.preventDefault();

        const currentDistance = getDistance(e.touches);
        const ratio = currentDistance / initialPinchDistance.current;
        const newScale = Math.max(0.1, Math.min(8.0, initialPinchScale.current * ratio));

        onScaleChangeRefTouch.current?.(newScale);
      }
    };

    const handleTouchEnd = () => {
      initialPinchDistance.current = null;
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, []); // Mounted once — no re-creation jank

  // Sprint 2.11: Swipe horizontal to change page (Tablets)
  // Only triggers if scroll is at boundaries (to avoid conflict with panning)
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || scrollMode !== ScrollMode.PAGED) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        touchStartX.current = e.touches[0].clientX;
        touchStartY.current = e.touches[0].clientY;
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) return;

      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const dx = touchEndX - touchStartX.current;
      const dy = touchEndY - touchStartY.current;

      // Ensure it's a horizontal swipe (dx >> dy) and meets threshold
      const horizontalThreshold = 50;
      const verticalThreshold = 40;

      if (Math.abs(dx) > horizontalThreshold && Math.abs(dy) < verticalThreshold) {
        // In paged mode with no meaningful zoom, allow direct swipe navigation.
        // Edge checks are reserved for zoomed pages to avoid panning conflicts.
        const isZoomed = scale > 1.05;
        let isAtLeftEdge = true;
        let isAtRightEdge = true;

        if (isZoomed) {
          const tolerance = 16;
          const currentPageEl = container.querySelector(`[data-page-number="${pageNumber}"]`) as HTMLElement | null;
          if (currentPageEl) {
            const pageRect = currentPageEl.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            isAtLeftEdge = pageRect.left >= containerRect.left - tolerance;
            isAtRightEdge = pageRect.right <= containerRect.right + tolerance;
          } else {
            const { scrollLeft, scrollWidth, clientWidth } = container;
            isAtLeftEdge = scrollLeft <= tolerance;
            isAtRightEdge = scrollLeft + clientWidth >= scrollWidth - tolerance;
          }
        }

        if (dx > 0 && isAtLeftEdge) {
          // Swipe Right -> Previous Page (only if scroll is at left edge)
          if (pageNumber > 1) setPageNumber?.(pageNumber - 1);
        } else if (dx < 0 && isAtRightEdge) {
          // Swipe Left -> Next Page (only if scroll is at right edge)
          if (pageNumber < numPages) setPageNumber?.(pageNumber + 1);
        }
      }

      touchStartX.current = null;
      touchStartY.current = null;
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [scrollMode, pageNumber, numPages, setPageNumber, scale]);

  // Auto Page-Fit: On tablet in paginated mode, fit page to viewport width
  const userHasZoomedRef = useRef(false);
  const lastAutoFitPageRef = useRef<number | null>(null);

  // Track user-initiated zoom changes to avoid overriding their preference
  useEffect(() => {
    if (!isMobileOS) return;
    // After auto-fit sets the scale, ignore that change; only flag manual zooms
    if (lastAutoFitPageRef.current === pageNumber) {
      lastAutoFitPageRef.current = null;
      return;
    }
    userHasZoomedRef.current = true;
  }, [scale]);

  // Reset user zoom flag on page change (re-enable auto-fit for new page)
  useEffect(() => {
    userHasZoomedRef.current = false;
  }, [pageNumber]);

  useEffect(() => {
    if (!isMobileOS) return;
    if (scrollMode !== ScrollMode.PAGED) return;
    if (userHasZoomedRef.current) return;

    const container = containerRef.current;
    if (!container) return;

    const currentPageDims = allPagesDimensions.get(pageNumber);
    if (!currentPageDims) return;

    // No margin on mobile for perfect fit and no swipe shift
    const fitWidth = container.clientWidth / currentPageDims.width;
    const fitHeight = container.clientHeight / currentPageDims.height;
    const fitScale = Math.min(fitWidth, fitHeight);

    // Only auto-fit if there's a meaningful difference (>2%)
    if (Math.abs(fitScale - scale) > 0.02) {
      lastAutoFitPageRef.current = pageNumber;
      onScaleChange?.(fitScale);
    }
  }, [isMobileOS, scrollMode, pageNumber, allPagesDimensions, onScaleChange, containerDims]);

  const isContinuous = scrollMode === ScrollMode.CONTINUOUS;

  return (
    <div
      ref={containerRef}
      className={`
        w-full h-full overflow-auto outline-none transition-colors duration-300
        cursor-grab active:cursor-grabbing scroll-smooth-tablet relative
        pdf-viewer-container
      `}
      style={{
        backgroundColor: 'var(--lumina-app-bg)',
        // Sprint Perf-D: Conditional touchAction to avoid swipe conflict
        // PAGED: block pan-x for swipe gestures | CONTINUOUS: allow pan-x for scroll
        touchAction: scrollMode === ScrollMode.PAGED ? 'pan-y pinch-zoom' : 'manipulation',
        WebkitOverflowScrolling: 'touch'
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* SVG Filter Definitions - Rendered once at viewport level */}
      <ThemeFilterDefs theme={theme} variant={themeVariant} />

      <Document
        file={file}
        onLoadSuccess={handleDocumentLoad}
        loading={<div className="p-10 text-gray-500 font-medium">Chargement du document...</div>}
        error={<div className="p-10 text-red-500 font-medium">Erreur lors du chargement du PDF</div>}
      >
        {/* OutlinePanel: OUTSIDE pdf-camera so fixed positioning works */}
        <OutlinePanel
          isOpen={isOutlineOpen}
          onClose={() => onToggleOutline?.()}
          onItemClick={({ pageNumber }: { pageNumber: number }) => {
            scrollToPage(pageNumber);
            if (setPageNumber) setPageNumber(pageNumber);
          }}
          theme={theme}
        />

        <div
          id="pdf-camera"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
            willChange: 'transform',
            display: 'inline-block',
            verticalAlign: 'top' as const
          }}
        >
          <div
            ref={contentRef}
            id="pdf-workspace"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 'fit-content',
              minHeight: 'fit-content',
              padding: '100dvh 100vw'
            }}
          >
            <div id="pdf-scale-layer" className="flex-none flex flex-col items-center gap-8">
              {isContinuous ? (
                Array.from({ length: numPages }, (_, i) => {
                  const pn = i + 1;
                  return (
                    <LazyPage
                      key={`page_${pn}`}
                      pageNumber={pn}
                      scale={1.0}
                      debouncedScale={debouncedScale}
                      pageDimensions={allPagesDimensions.get(pn) || pageDimensions}
                      containerRef={containerRef}
                      theme={theme}
                      themeVariant={themeVariant}
                      annotations={annotationsByPage.get(pn) || emptyAnnotations}
                      isAnnotationMode={isAnnotationMode}
                      annotationColor={annotationColor}
                      onAddAnnotation={onAddAnnotation}
                      onUpdateAnnotation={onUpdateAnnotation}
                      onDeleteAnnotation={onDeleteAnnotation}
                      onVisible={handlePageVisible}
                      currentPage={pageNumber}
                    />
                  );
                })
              ) : (
                <LazyPage
                  pageNumber={pageNumber}
                  scale={1.0}
                  debouncedScale={debouncedScale}
                  pageDimensions={allPagesDimensions.get(pageNumber) || pageDimensions}
                  containerRef={containerRef}
                  theme={theme}
                  themeVariant={themeVariant}
                  annotations={annotationsByPage.get(pageNumber) || emptyAnnotations}
                  isAnnotationMode={isAnnotationMode}
                  annotationColor={annotationColor}
                  onAddAnnotation={onAddAnnotation}
                  onUpdateAnnotation={onUpdateAnnotation}
                  onDeleteAnnotation={onDeleteAnnotation}
                  onVisible={handlePageVisible}
                  forceRender={true}
                  currentPage={pageNumber}
                />
              )}
            </div>
          </div>
        </div>
      </Document>
    </div>
  );
});

PdfViewer.displayName = 'PdfViewer';

export default PdfViewer;
