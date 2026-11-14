import React, { forwardRef, useImperativeHandle, useRef, useEffect, useState, useCallback, useLayoutEffect, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { AppTheme, Annotation, ScrollMode } from '../types';
import { ThemeVariant, getRenderPalette, getThemePalette } from '../utils/ThemeManager';
import { useDebounce } from '../hooks/useDebounce';
import { useReaderGestures } from '../hooks/useReaderGestures';
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
  fitPage: () => void;
}

interface PdfViewerProps {
  file: any;
  restorePage?: number;
  restoreZoom?: boolean;
  onRestored?: () => void;
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
  const snapshotFrames = useRef<number[]>([]);
  useEffect(() => () => {
    snapshotFrames.current.forEach(cancelAnimationFrame);
    snapshotFrames.current = [];
  }, []);

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
    snapshotFrames.current.forEach(cancelAnimationFrame);
    snapshotFrames.current = [requestAnimationFrame(() => {
      snapshotFrames.current = [requestAnimationFrame(() => {
        snapshotFrames.current = [];
        if (epochAtRenderStart !== latestRenderEpochRef.current) return;
        if (snapshotContainerRef.current) {
          snapshotContainerRef.current.innerHTML = '';
        }
        hasSnapshotRef.current = false;
      })];
    })];
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
    && prev.annotationColor === next.annotationColor
    && prev.onVisible === next.onVisible;
});

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const PdfViewer = forwardRef<PdfViewerRef, PdfViewerProps>((props, ref) => {
  const {
    file,
    restorePage,
    restoreZoom = false,
    onRestored,
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
  const emptyDimensions = useMemo(() => new Map<number, { width: number; height: number }>(), []);
  const [documentDimensions, setDocumentDimensions] = useState({ file: null as any, pages: emptyDimensions });
  const allPagesDimensions = documentDimensions.file === file ? documentDimensions.pages : emptyDimensions;
  const fileRef = useRef(file);
  const scrollModeRef = useRef(scrollMode);
  useLayoutEffect(() => {
    fileRef.current = file;
    scrollModeRef.current = scrollMode;
  }, [file, scrollMode]);
  const [containerDims, setContainerDims] = useState({ width: 0, height: 0 });

  const lastScaleRef = useRef(scale);
  const restorationDoneRef = useRef(false);
  const navLockRef = useRef(false);
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fitPendingRef = useRef(false);
  const [fitRequest, setFitRequest] = useState(0);
  const previousLayoutRef = useRef({ file: null as any, mode: scrollMode, page: pageNumber, ready: false, width: 0, height: 0, pageWidth: 0, pageHeight: 0, fit: 1 });
  const currentPageDimensions = allPagesDimensions.get(pageNumber) || pageDimensions;
  const fitScale = containerDims.width && containerDims.height
    ? Math.max(0.1, Math.min(8, Math.min(
      (containerDims.width - 16) / currentPageDimensions.width,
      (containerDims.height - 16) / currentPageDimensions.height,
    ))) : 1;

  const worldDimensions = useMemo(() => {
    if (scrollMode !== ScrollMode.CONTINUOUS) return allPagesDimensions.get(pageNumber) || pageDimensions;
    let width = 0;
    let height = 0;
    for (let page = 1; page <= numPages; page++) {
      const dimensions = allPagesDimensions.get(page) || pageDimensions;
      width = Math.max(width, dimensions.width);
      height += dimensions.height + (page > 1 ? 32 : 0);
    }
    return { width, height };
  }, [scrollMode, pageNumber, numPages, allPagesDimensions, pageDimensions]);

  // Relire la géométrie à la libération du verrou, même si le scroll s'est arrêté.
  const reconcileVisiblePage = useCallback(() => {
    const container = containerRef.current;
    const camera = cameraRef.current;
    if (!container || !camera || fileRef.current !== file || scrollModeRef.current !== scrollMode ||
      scrollMode !== ScrollMode.CONTINUOUS || !numPages) return;
    const viewport = container.getBoundingClientRect();
    const worldY = (viewport.top + container.clientHeight / 2 - camera.getBoundingClientRect().top) / scale;
    let top = 0;
    let nearestPage = 1;
    let nearestDistance = Infinity;
    for (let page = 1; page <= numPages; page++) {
      const bottom = top + (allPagesDimensions.get(page) || pageDimensions).height;
      const distance = Math.max(top - worldY, worldY - bottom, 0);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestPage = page;
      }
      top = bottom + 32;
    }
    setPageNumber?.(nearestPage);
  }, [file, scrollMode, numPages, scale, allPagesDimensions, pageDimensions, setPageNumber]);
  const reconcileVisiblePageRef = useRef(reconcileVisiblePage);
  useLayoutEffect(() => { reconcileVisiblePageRef.current = reconcileVisiblePage; }, [reconcileVisiblePage]);

  const lockNavigation = useCallback(() => {
    navLockRef.current = true;
    if (navTimerRef.current !== null) clearTimeout(navTimerRef.current);
    navTimerRef.current = setTimeout(() => {
      navLockRef.current = false;
      navTimerRef.current = null;
      reconcileVisiblePageRef.current();
    }, 300);
  }, []);

  // Origine réelle de la caméra + dimensions natives du workspace, jamais la zone de scroll.
  const centerDocument = useCallback((targetPage: number = pageNumber) => {
    const container = containerRef.current;
    const content = contentRef.current;
    const camera = cameraRef.current;
    if (!container || !content || !camera) return;
    const rect = camera.getBoundingClientRect();
    const viewport = container.getBoundingClientRect();
    let top = 0;
    if (scrollMode === ScrollMode.CONTINUOUS) {
      for (let page = 1; page < targetPage; page++) {
        top += (allPagesDimensions.get(page) || pageDimensions).height + 32;
      }
    }
    const dimensions = allPagesDimensions.get(targetPage) || pageDimensions;
    const worldY = scrollMode === ScrollMode.CONTINUOUS ? top + dimensions.height / 2 : content.offsetHeight / 2;
    container.scrollLeft += rect.left + content.offsetWidth * scale / 2 - viewport.left - container.clientWidth / 2;
    container.scrollTop += rect.top + worldY * scale - viewport.top - container.clientHeight / 2;
  }, [scrollMode, pageNumber, scale, allPagesDimensions, pageDimensions]);

  const navigateFromGesture = useCallback((page: number) => {
    lockNavigation();
    setPageNumber?.(page);
  }, [lockNavigation, setPageNumber]);

  const { pendingZoomRef, cancelGesture } = useReaderGestures({
    containerRef, cameraRef, file, scrollMode, scale, fitScale, pageNumber, numPages,
    isAnnotationMode, onScaleChange, onNavigate: navigateFromGesture,
  });

  // Une seule correction par commit : navigation/ajustement OU point d'ancrage du zoom.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const camera = cameraRef.current;
    if (!container || !camera) return;
    const previous = previousLayoutRef.current;
    const ready = allPagesDimensions.size > 0;
    const navigation = previous.file !== file || previous.mode !== scrollMode ||
      (!previous.ready && ready) || (scrollMode !== ScrollMode.CONTINUOUS && previous.page !== pageNumber);
    const resized = previous.width !== containerDims.width || previous.height !== containerDims.height;
    const pageResized = scrollMode === ScrollMode.PAGED && previous.mode === scrollMode &&
      (previous.pageWidth !== currentPageDimensions.width || previous.pageHeight !== currentPageDimensions.height);
    // Un changement de format conserve l'ajustement, mais jamais au détriment d'un zoom manuel.
    const keepFit = (resized || pageResized) && previous.file === file && previous.ready &&
      scale === lastScaleRef.current && !pendingZoomRef.current && Math.abs(lastScaleRef.current - previous.fit) < 0.02;
    const tabletPaged = scrollMode === ScrollMode.PAGED && window.matchMedia('(pointer: coarse)').matches;
    const restoring = restorePage !== undefined && !restorationDoneRef.current;
    const initialFit = (previous.file !== file || !previous.ready) && ready &&
      ((!restoreZoom && scale === 1) || (restoring && tabletPaged));
    previousLayoutRef.current = { file, mode: scrollMode, page: pageNumber, ready,
      width: containerDims.width, height: containerDims.height,
      pageWidth: currentPageDimensions.width, pageHeight: currentPageDimensions.height, fit: fitScale };
    if ((initialFit || keepFit) && containerDims.width && Math.abs(scale - fitScale) > 0.001) {
      fitPendingRef.current = true;
      pendingZoomRef.current = null;
      onScaleChange?.(fitScale);
    } else if ((navigation && ready) || fitPendingRef.current || (resized && ready)) {
      lockNavigation();
      fitPendingRef.current = false;
      pendingZoomRef.current = null;
      centerDocument(restoring ? restorePage : pageNumber);
    } else if (scale !== lastScaleRef.current) {
      const rect = camera.getBoundingClientRect();
      const viewport = container.getBoundingClientRect();
      const x = viewport.left + container.clientWidth / 2;
      const y = viewport.top + container.clientHeight / 2;
      const anchor = pendingZoomRef.current || {
        worldX: (x - rect.left) / lastScaleRef.current,
        worldY: (y - rect.top) / lastScaleRef.current,
        clientX: x, clientY: y,
      };
      container.scrollLeft += rect.left + anchor.worldX * scale - anchor.clientX;
      container.scrollTop += rect.top + anchor.worldY * scale - anchor.clientY;
      pendingZoomRef.current = null;
    }
    // Les dimensions réelles et l'ajustement doivent précéder toute sauvegarde.
    if (restoring && ready && containerDims.width && containerDims.height && !fitPendingRef.current) {
      lockNavigation();
      centerDocument(restorePage);
      setPageNumber?.(Math.max(1, Math.min(numPages, restorePage)));
      restorationDoneRef.current = true;
      onRestored?.();
    }
    lastScaleRef.current = scale;
  }, [file, scrollMode, pageNumber, scale, allPagesDimensions, fitRequest, centerDocument, lockNavigation, pendingZoomRef, containerDims.width, containerDims.height, currentPageDimensions.width, currentPageDimensions.height, fitScale, onScaleChange, restorePage, restoreZoom, onRestored, setPageNumber, numPages]);

  useLayoutEffect(() => () => {
    if (navTimerRef.current !== null) clearTimeout(navTimerRef.current);
    navTimerRef.current = null;
    navLockRef.current = false;
  }, [file, scrollMode]);

  // Les notifications anciennes ne doivent pas modifier le document ou le mode courant.
  const handlePageVisible = useCallback(() => {
    if ((restorePage !== undefined && !restorationDoneRef.current) || navLockRef.current || fileRef.current !== file || scrollModeRef.current !== scrollMode) return;
    reconcileVisiblePageRef.current();
  }, [file, scrollMode, restorePage]);

  // Sprint Perf-A: Stable document load handler (prevents re-triggering on re-renders)
  const pdfDocRef = useRef<any>(null);

  const handleDocumentLoad = useCallback(async (pdf: any) => {
    if (fileRef.current !== file) return;
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

      if (pdfDocRef.current !== pdf || fileRef.current !== file) return;
      setDocumentDimensions({ file, pages: dimsMap });

      const firstPageDims = dimsMap.get(1) || { width: 612, height: 792 };
      setPageDimensionsInternal(firstPageDims);
      onPageDimensions?.(firstPageDims);

    } catch (err) {
      console.warn('[PdfViewer] Failed to load document details:', err);
    }
  }, [onLoadSuccess, onPageDimensions, file]);

  // Navigation explicite commune à la barre, au clavier et aux liens PDF.
  const scrollToPage = useCallback((page: number) => {
    if (!numPages || !Number.isFinite(page)) return;
    const target = Math.max(1, Math.min(numPages, Math.trunc(page)));
    cancelGesture();
    lockNavigation();
    setPageNumber?.(target);
    if (scrollMode === ScrollMode.CONTINUOUS || target === pageNumber) centerDocument(target);
  }, [numPages, pageNumber, setPageNumber, scrollMode, centerDocument, lockNavigation, cancelGesture]);

  const fitPage = useCallback(() => {
    cancelGesture();
    pendingZoomRef.current = null;
    fitPendingRef.current = true;
    onScaleChange?.(fitScale);
    setFitRequest(request => request + 1);
  }, [fitScale, onScaleChange, pendingZoomRef, cancelGesture]);

  useImperativeHandle(ref, () => ({ containerRef, contentRef, scrollToPage, fitPage }));

  useEffect(() => {
    onPageDimensions?.(currentPageDimensions);
  }, [currentPageDimensions.width, currentPageDimensions.height, onPageDimensions]);

  // Track container dimensions for "Fit to Width"
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        const { width, height } = entries[0].contentRect;
        onContainerDimensions?.({ width, height });
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
        const sourceFile = fileRef.current;
        const dest = await pdf.getDestination(destName);
        if (dest) {
          const pageIndex = await pdf.getPageIndex(dest[0]);
          if (sourceFile === fileRef.current && pdfDocRef.current === pdf) scrollToPage(pageIndex + 1);
        }
      } catch (err) {
        console.warn('[PdfViewer] Failed to resolve destination:', destName, err);
      }
    };

    container.addEventListener('click', handleInternalLinkClick);
    return () => container.removeEventListener('click', handleInternalLinkClick);
  }, [scrollToPage, setPageNumber]);

  const isContinuous = scrollMode === ScrollMode.CONTINUOUS;

  return (
    <div
      ref={containerRef}
      className={`
        w-full h-full overflow-auto outline-none relative
        pdf-viewer-container
      `}
      style={{
        backgroundColor: 'var(--lumina-app-bg)',
        // Le pan natif garde son inertie ; le pincement appartient au lecteur.
        touchAction: !isContinuous && scale <= fitScale * 1.02 && !isAnnotationMode ? 'pan-y' : 'pan-x pan-y',
        overscrollBehavior: 'contain',
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
        error={<div className="p-10 text-red-500 font-medium">Impossible de charger ce PDF. Ouvrez un autre fichier avec la barre de lecture.</div>}
      >
        {/* OutlinePanel: OUTSIDE pdf-camera so fixed positioning works */}
        <div style={{ display: isOutlineOpen ? 'contents' : 'none' }}>
          <OutlinePanel
            isOpen={isOutlineOpen}
            onClose={() => onToggleOutline?.()}
            onItemClick={({ pageNumber }: { pageNumber: number }) => {
              scrollToPage(pageNumber);
            }}
            theme={theme}
          />
        </div>

        {/* Sprint 2 Refactoring: Padding is extracted outside of the scaled element */}
        {/* Phase 4D: Dynamic padding compensates for scale() visual overflow (origin 0,0 grows right/down) */}
        <div id="pdf-spacing-wrapper" style={{
          boxSizing: 'border-box',
          width: containerDims.width * 2 + worldDimensions.width * scale,
          height: containerDims.height * 2 + worldDimensions.height * scale,
          paddingTop: containerDims.height,
          paddingLeft: containerDims.width,
        }}>
          <div
            ref={cameraRef}
            id="pdf-camera"
            style={{
              transform: `scale(${scale})`,
              transformOrigin: '0 0',
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
                width: worldDimensions.width,
                height: worldDimensions.height
              }}
            >
              <div id="pdf-scale-layer" className="flex-none flex flex-col items-center gap-8">
                {restorePage !== undefined && allPagesDimensions.size === 0 ? null : isContinuous ? (
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
        </div>
      </Document>
    </div>
  );
});

PdfViewer.displayName = 'PdfViewer';

export default PdfViewer;
