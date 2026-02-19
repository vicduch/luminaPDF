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

  // DPR-based quality: keep <Page width> constant (= pageDimensions.width) and vary
  // devicePixelRatio to control render resolution. This means react-pdf's pageKey never
  // changes on zoom → Canvas is never unmounted → no flash, no snapshot needed.
  // The canvas element persists and re-renders in place; visibility:hidden during render
  // is covered by a lightweight same-size clone.
  const [committedScale, setCommittedScale] = useState(debouncedScale);
  const snapshotContainerRef = useRef<HTMLDivElement>(null);
  const hasSnapshotRef = useRef(false);
  const latestRenderEpochRef = useRef(0);
  const [renderEpoch, setRenderEpoch] = useState(0);

  // When debouncedScale changes, capture the canvas (still valid — same element, not
  // unmounted) in useLayoutEffect BEFORE react-pdf's useEffect clears it.
  useLayoutEffect(() => {
    if (debouncedScale === committedScale) return;
    if (!isRendered) {
      setCommittedScale(debouncedScale);
      return;
    }

    const canvas = canvasWrapperRef.current?.querySelector('canvas') as HTMLCanvasElement | null;
    const container = snapshotContainerRef.current;

    if (canvas && container && canvas.width > 0 && canvas.style.visibility !== 'hidden') {
      try {
        // Clone the canvas pixel-perfectly: same element dimensions, same CSS size.
        // Since width={pageDimensions.width} is constant, CSS dimensions never change
        // between old and new renders → zero sub-pixel shift.
        const clone = document.createElement('canvas');
        clone.width = canvas.width;
        clone.height = canvas.height;
        clone.style.cssText = canvas.style.cssText;
        clone.style.position = 'absolute';
        clone.style.top = '0';
        clone.style.left = '0';
        clone.style.zIndex = '2';
        clone.style.pointerEvents = 'none';

        const ctx = clone.getContext('2d');
        ctx?.drawImage(canvas, 0, 0);

        container.innerHTML = '';
        container.appendChild(clone);
        hasSnapshotRef.current = true;
      } catch (err) {
        console.warn('[LazyPage] Canvas capture failed:', err);
      }
    }

    latestRenderEpochRef.current += 1;
    setRenderEpoch(latestRenderEpochRef.current);
    setCommittedScale(debouncedScale);
  }, [debouncedScale, committedScale, isRendered]);

  // Clear snapshot only when the latest render epoch has completed.
  const handleRenderSuccess = useCallback(() => {
    const epochAtRenderStart = renderEpoch;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (epochAtRenderStart !== latestRenderEpochRef.current) return;
        if (snapshotContainerRef.current) {
          snapshotContainerRef.current.innerHTML = '';
        }
        hasSnapshotRef.current = false;
      });
    });
  }, [renderEpoch]);

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

  // DPR-based quality control: resolution = pageDimensions.width * qualityDpr.
  // Higher committedScale → higher DPR → more canvas pixels → sharper text.
  // Page width stays constant → react-pdf pageKey stays constant → no canvas remount.
  const qualityDpr = useMemo(() => {
    const boost = committedScale <= 1 ? 1.22 : committedScale <= 2 ? 1.18 : committedScale <= 4 ? 1.14 : 1.1;
    const baseDpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;
    const adaptiveBoost = 1 + 0.3 / (1 + committedScale);
    return committedScale * boost * Math.min(2.8, Math.max(1.5, baseDpr * adaptiveBoost));
  }, [committedScale]);

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
          <div ref={snapshotContainerRef} />
          
          {/* HD Canvas — width stays constant, quality via devicePixelRatio */}
          <div ref={canvasWrapperRef}>
            <Page
              pageNumber={pageNumber}
              width={pageDimensions.width}
              devicePixelRatio={qualityDpr}
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
  const cameraRef = useRef<HTMLDivElement>(null);
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

      // 1. Pivot of expansion must match CSS transformOrigin.
      // Continuous mode: top-center pivot to preserve top reachability.
      // Paged mode: center-center pivot.
      const Cx = content.scrollWidth / 2;
      const Cy = scrollMode === ScrollMode.CONTINUOUS ? 0 : content.scrollHeight / 2;

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
  }, [scale, scrollMode]);

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

  // Navigate to a page: works in both continuous (scroll) and paged (swap) modes.
  const scrollToPage = useCallback((targetPage: number) => {
    // Always update the page number state — essential for paged mode and toolbar display
    if (setPageNumber) setPageNumber(targetPage);

    const container = containerRef.current;
    if (!container) return;

    // Engage navigation lock to prevent IntersectionObserver interference
    navLockRef.current = true;
    setTimeout(() => { navLockRef.current = false; }, 300);

    // In paged mode the target page will be rendered by the state update above
    const pageEl = container.querySelector(`[data-page-number="${targetPage}"]`) as HTMLElement | null;
    if (!pageEl) return;

    const pageRect = pageEl.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    const pageTopInScroll = container.scrollTop + (pageRect.top - containerRect.top);
    const pageHeightInScroll = pageRect.height;
    const viewportHeight = container.clientHeight;

    const targetTop = pageTopInScroll - (viewportHeight - pageHeightInScroll) / 2;
    container.scrollTop = targetTop;
  }, [setPageNumber]);

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
        scrollToPage(parseInt(pageMatch[1], 10));
        return;
      }

      // 2. Try named destination via PDF.js API
      const destName = decodeURIComponent(href.substring(1));
      if (!destName || !pdfDocRef.current) return;

      try {
        const pdf = pdfDocRef.current;
        const dest = await pdf.getDestination(destName);
        if (dest) {
          const pageIndex = await pdf.getPageIndex(dest[0]);
          scrollToPage(pageIndex + 1);
        }
      } catch (err) {
        console.warn('[PdfViewer] Failed to resolve destination:', destName, err);
      }
    };

    container.addEventListener('click', handleInternalLinkClick);
    return () => container.removeEventListener('click', handleInternalLinkClick);
  }, [scrollToPage, setPageNumber]);

  // Sprint 2.9: Pinch-to-Zoom via wheel event with ctrlKey
  // 120fps optimization: write directly to DOM during gesture, commit to React after.
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  const onScaleChangeRef = useRef(onScaleChange);
  onScaleChangeRef.current = onScaleChange;

  const scrollModeRef = useRef(scrollMode);
  scrollModeRef.current = scrollMode;

  const wheelCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Inline aiming: correct scroll position to keep viewport center stable after scale change.
  // Runs synchronously inside gesture handlers to avoid 1-frame drift.
  // Also syncs lastScaleRef so the useLayoutEffect Aiming Engine skips (no-op) on React commit.
  const applyInlineAiming = useCallback((oldScale: number, newScale: number) => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    lastScaleRef.current = newScale;

    const { scrollLeft, scrollTop, clientWidth, clientHeight } = container;
    const ratio = newScale / oldScale;

    const Cx = content.scrollWidth / 2;
    const Cy = scrollModeRef.current === ScrollMode.CONTINUOUS ? 0 : content.scrollHeight / 2;

    const viewCenterX = scrollLeft + clientWidth / 2;
    const viewCenterY = scrollTop + clientHeight / 2;

    const newCenterX = Cx + (viewCenterX - Cx) * ratio;
    const newCenterY = Cy + (viewCenterY - Cy) * ratio;

    container.scrollTo({
      left: newCenterX - clientWidth / 2,
      top: newCenterY - clientHeight / 2,
      behavior: 'instant'
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();

        const zoomFactor = 1 - e.deltaY * 0.003;
        const oldScale = scaleRef.current;
        const newScale = Math.max(0.1, Math.min(8.0, oldScale * zoomFactor));

        // Direct DOM write — bypasses React reconciliation entirely
        scaleRef.current = newScale;
        if (cameraRef.current) {
          cameraRef.current.style.transform = `scale(${newScale})`;
        }
        applyInlineAiming(oldScale, newScale);

        // Debounced commit: sync React state after gesture settles (80ms)
        if (wheelCommitTimerRef.current !== null) {
          clearTimeout(wheelCommitTimerRef.current);
        }
        wheelCommitTimerRef.current = setTimeout(() => {
          wheelCommitTimerRef.current = null;
          onScaleChangeRef.current?.(scaleRef.current);
        }, 80);
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
      if (wheelCommitTimerRef.current !== null) {
        clearTimeout(wheelCommitTimerRef.current);
      }
    };
  }, [applyInlineAiming]); // Mounted once — applyInlineAiming is stable (useCallback with no deps)

  // Sprint 2.10: Pinch-to-Zoom via touch events (touchscreen)
  // 120fps optimization: direct DOM during pinch, commit on touchEnd.
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
        const oldScale = scaleRefTouch.current;
        const newScale = Math.max(0.1, Math.min(8.0, initialPinchScale.current * ratio));

        // Direct DOM write — bypasses React reconciliation entirely
        scaleRefTouch.current = newScale;
        scaleRef.current = newScale;
        if (cameraRef.current) {
          cameraRef.current.style.transform = `scale(${newScale})`;
        }
        applyInlineAiming(oldScale, newScale);
      }
    };

    const handleTouchEnd = () => {
      if (initialPinchDistance.current !== null) {
        // Commit final scale to React state once at gesture end
        onScaleChangeRefTouch.current?.(scaleRefTouch.current);
      }
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
  }, [applyInlineAiming]); // Mounted once

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
        onItemClick={({ pageNumber: pg }: { pageNumber: number }) => scrollToPage(pg)}
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
          ref={cameraRef}
          id="pdf-camera"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: isContinuous ? 'top center' : 'center center',
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
