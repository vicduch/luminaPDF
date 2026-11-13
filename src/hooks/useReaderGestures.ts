import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';
import { ScrollMode } from '../types';

export interface ReaderZoomAnchor {
  worldX: number;
  worldY: number;
  clientX: number;
  clientY: number;
}

interface ReaderGesturesOptions {
  containerRef: RefObject<HTMLDivElement | null>;
  cameraRef: RefObject<HTMLDivElement | null>;
  file: unknown;
  scrollMode?: ScrollMode;
  scale: number;
  fitScale: number;
  pageNumber: number;
  numPages: number;
  isAnnotationMode: boolean;
  onScaleChange?: (scale: number) => void;
  onNavigate: (page: number) => void;
}

// Un seul arbitre tactile : le scroll reste natif, sauf pincement et swipe ajusté.
export function useReaderGestures(options: ReaderGesturesOptions) {
  const latest = useRef(options);
  const pendingZoomRef = useRef<ReaderZoomAnchor | null>(null);
  const cancelRef = useRef<() => void>(() => {});
  const cancelGesture = useCallback(() => cancelRef.current(), []);
  useLayoutEffect(() => { latest.current = options; });

  useLayoutEffect(() => {
    const container = options.containerRef.current;
    if (!container) return;
    let frame: number | null = null;
    let nextScale = latest.current.scale;
    let start: { x: number; y: number; page: number; swipe: boolean } | null = null;
    let pinch: { distance: number; scale: number; worldX: number; worldY: number } | null = null;
    let blocked = false;
    let horizontal = false;
    let vertical = false;

    const cancelFrame = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    };
    const cancel = () => {
      cancelFrame();
      pendingZoomRef.current = null;
      nextScale = latest.current.scale;
      start = null;
      pinch = null;
      blocked = false;
      horizontal = false;
      vertical = false;
    };
    cancelRef.current = cancel;
    const flush = () => {
      frame = null;
      latest.current.onScaleChange?.(nextScale);
    };
    const queueZoom = (scale: number, anchor: ReaderZoomAnchor) => {
      nextScale = Math.max(0.1, Math.min(8, scale));
      pendingZoomRef.current = anchor;
      if (nextScale === latest.current.scale) {
        // Un milieu qui se déplace est aussi un pan, même à la limite du zoom.
        const rect = latest.current.cameraRef.current?.getBoundingClientRect();
        if (rect) {
          container.scrollLeft += rect.left + anchor.worldX * nextScale - anchor.clientX;
          container.scrollTop += rect.top + anchor.worldY * nextScale - anchor.clientY;
        }
        pendingZoomRef.current = null;
      } else if (frame === null) frame = requestAnimationFrame(flush);
    };
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey || !latest.current.onScaleChange) return;
      event.preventDefault();
      const rect = latest.current.cameraRef.current?.getBoundingClientRect();
      if (!rect) return;
      const currentScale = latest.current.scale;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.clientHeight : 1);
      const base = frame !== null || pendingZoomRef.current ? nextScale : currentScale;
      queueZoom(base * Math.exp(-delta * 0.0015), {
        worldX: (event.clientX - rect.left) / currentScale,
        worldY: (event.clientY - rect.top) / currentScale,
        clientX: event.clientX, clientY: event.clientY,
      });
    };
    const distance = (touches: TouchList) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
    const touchStart = (event: TouchEvent) => {
      const state = latest.current;
      if ((event.target as HTMLElement).closest('a, button, input, textarea, select, [role="dialog"]')) {
        cancel();
        blocked = true;
        return;
      }
      if (event.touches.length === 2) {
        event.preventDefault();
        start = null;
        blocked = true;
        const rect = state.cameraRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = (event.touches[0].clientX + event.touches[1].clientX) / 2;
        const y = (event.touches[0].clientY + event.touches[1].clientY) / 2;
        pinch = { distance: Math.max(1, distance(event.touches)), scale: state.scale,
          worldX: (x - rect.left) / state.scale, worldY: (y - rect.top) / state.scale };
      } else if (event.touches.length === 1 && !blocked) {
        horizontal = false;
        vertical = false;
        start = { x: event.touches[0].clientX, y: event.touches[0].clientY, page: state.pageNumber,
          swipe: state.scrollMode === ScrollMode.PAGED && !state.isAnnotationMode && state.scale <= state.fitScale * 1.02 };
      } else {
        cancel();
        blocked = true;
      }
    };
    const touchMove = (event: TouchEvent) => {
      if (pinch && event.touches.length === 2) {
        event.preventDefault();
        queueZoom(pinch.scale * distance(event.touches) / pinch.distance, {
          worldX: pinch.worldX, worldY: pinch.worldY,
          clientX: (event.touches[0].clientX + event.touches[1].clientX) / 2,
          clientY: (event.touches[0].clientY + event.touches[1].clientY) / 2,
        });
      } else if (start?.swipe && event.touches.length === 1 && !blocked) {
        const dx = event.touches[0].clientX - start.x;
        const dy = event.touches[0].clientY - start.y;
        if (!horizontal && !vertical && Math.hypot(dx, dy) > 10) {
          horizontal = Math.abs(dx) > Math.abs(dy) * 1.5;
          vertical = !horizontal;
        }
        if (horizontal) event.preventDefault();
      }
    };
    const touchEnd = (event: TouchEvent) => {
      if (pinch) {
        // Ne jamais transformer la fin d'un pincement en swipe à un doigt.
        if (frame !== null) { cancelFrame(); flush(); }
        pinch = null;
        start = null;
        blocked = event.touches.length > 0;
        return;
      }
      if (start && !blocked && event.touches.length === 0 && event.changedTouches.length) {
        const dx = event.changedTouches[0].clientX - start.x;
        const dy = event.changedTouches[0].clientY - start.y;
        const state = latest.current;
        if (start.swipe && !vertical && Math.abs(dx) >= 80 && Math.abs(dx) > Math.abs(dy) * 1.5 && state.pageNumber === start.page) {
          const page = Math.max(1, Math.min(state.numPages, start.page + (dx < 0 ? 1 : -1)));
          if (page !== start.page) state.onNavigate(page);
        }
      }
      start = null;
      if (!event.touches.length) blocked = false;
    };
    const interrupted = () => cancel();
    container.addEventListener('wheel', wheel, { passive: false });
    container.addEventListener('touchstart', touchStart, { passive: false });
    container.addEventListener('touchmove', touchMove, { passive: false });
    container.addEventListener('touchend', touchEnd);
    container.addEventListener('touchcancel', interrupted);
    window.addEventListener('blur', interrupted);
    document.addEventListener('visibilitychange', interrupted);
    return () => {
      cancel();
      cancelRef.current = () => {};
      container.removeEventListener('wheel', wheel);
      container.removeEventListener('touchstart', touchStart);
      container.removeEventListener('touchmove', touchMove);
      container.removeEventListener('touchend', touchEnd);
      container.removeEventListener('touchcancel', interrupted);
      window.removeEventListener('blur', interrupted);
      document.removeEventListener('visibilitychange', interrupted);
    };
  }, [options.file, options.scrollMode, options.containerRef, options.cameraRef]);

  return { pendingZoomRef, cancelGesture };
}
