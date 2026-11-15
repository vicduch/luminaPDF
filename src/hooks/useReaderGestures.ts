import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';
import { ScrollMode } from '../types';

export interface ReaderZoomAnchor {
  worldX: number;
  worldY: number;
  clientX: number;
  clientY: number;
}

export type PagePlacement = 'center' | 'start' | 'end' | 'top' | 'bottom';

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
  onFitPage?: () => void;
  onNavigate: (page: number, placement?: PagePlacement) => void;
  onToggleToolbar?: () => void;
}

// Arbitre unifié des gestes : pincement, suivi direct et résistance au bord, toucher de zone et molette paginée.
export function useReaderGestures(options: ReaderGesturesOptions) {
  const latest = useRef(options);
  const pendingZoomRef = useRef<ReaderZoomAnchor | null>(null);
  const cancelRef = useRef<(instant?: boolean) => void>(() => {});
  const cancelGesture = useCallback(() => cancelRef.current(true), []);
  useLayoutEffect(() => { latest.current = options; });

  useLayoutEffect(() => {
    const container = options.containerRef.current;
    if (!container) return;
    let frame: number | null = null;
    let dragFrame: number | null = null;
    let resetTimer: ReturnType<typeof setTimeout> | null = null;
    let nextScale = latest.current.scale;
    let dragOffset = 0;
    let start: {
      x: number;
      y: number;
      lastX: number;
      lastY: number;
      startTime: number;
      lastMoveTime: number;
      lastStepSpeed: number;
      maxDistance: number;
      page: number;
      mode: 'fitted' | 'zoomed' | 'continuous';
      atLeftAtStart: boolean;
      atRightAtStart: boolean;
      scrollLeftAtStart: number;
      scrollTopAtStart: number;
    } | null = null;
    let pinch: { distance: number; scale: number; worldX: number; worldY: number } | null = null;
    let wasPinch = false;
    let blocked = false;

    let lastWheelTime = 0;
    let wheelTurnedInBurst = false;
    let wheelStartedAtTop = false;
    let wheelStartedAtBottom = false;
    let wheelStartedAtLeft = false;
    let wheelStartedAtRight = false;
    let wheelExceedsX = false;
    let wheelExceedsY = false;

    const clearResetTimer = () => {
      if (resetTimer !== null) {
        clearTimeout(resetTimer);
        resetTimer = null;
      }
      if (dragFrame !== null) {
        clearTimeout(dragFrame);
        dragFrame = null;
      }
    };

    const applyLiveDrag = () => {
      dragFrame = null;
      const camera = latest.current.cameraRef.current;
      if (!camera || dragOffset === 0) return;
      if (camera.style.transition !== 'none') camera.style.transition = 'none';
      camera.style.transform = `translate3d(${dragOffset}px, 0, 0) scale(${latest.current.scale})`;
    };

    const setDragOffset = (offset: number, instant = false, animateBack = false) => {
      const prevOffset = dragOffset;
      dragOffset = offset;
      if (offset !== 0 && !instant) {
        if (resetTimer !== null) {
          clearTimeout(resetTimer);
          resetTimer = null;
        }
        const elapsed = start ? performance.now() - start.startTime : 999;
        if (elapsed < 25) {
          if (dragFrame === null) {
            dragFrame = window.setTimeout(applyLiveDrag, 25 - elapsed);
          }
          return;
        }
        applyLiveDrag();
        return;
      }
      clearResetTimer();
      const camera = latest.current.cameraRef.current;
      if (!camera) return;
      const s = latest.current.scale;
      if (offset !== 0) {
        if (camera.style.transition !== 'none') camera.style.transition = 'none';
        camera.style.transform = `translate3d(${offset}px, 0, 0) scale(${s})`;
      } else if (
        animateBack &&
        !instant &&
        Math.abs(prevOffset) > 1 &&
        !(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
      ) {
        camera.style.transition = 'transform 140ms ease-out';
        camera.style.transform = `scale(${s})`;
        resetTimer = setTimeout(() => {
          resetTimer = null;
          if (latest.current.cameraRef.current && dragOffset === 0) {
            latest.current.cameraRef.current.style.transition = 'none';
          }
        }, 150);
      } else {
        camera.style.transition = 'none';
        camera.style.transform = `scale(${s})`;
      }
    };

    const cancelFrame = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    };

    const cancel = (instant = false) => {
      cancelFrame();
      pendingZoomRef.current = null;
      nextScale = latest.current.scale;
      setDragOffset(0, instant, !instant);
      start = null;
      pinch = null;
      wasPinch = false;
      blocked = false;
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
        // Un milieu qui se déplace est aussi un pan sur les axes où le document dépasse.
        const rect = latest.current.cameraRef.current?.getBoundingClientRect();
        if (rect) {
          if (container.scrollWidth > container.clientWidth + 1) {
            container.scrollLeft += rect.left + anchor.worldX * nextScale - anchor.clientX;
          }
          if (container.scrollHeight > container.clientHeight + 1) {
            container.scrollTop += rect.top + anchor.worldY * nextScale - anchor.clientY;
          }
        }
        pendingZoomRef.current = null;
      } else if (frame === null) {
        frame = requestAnimationFrame(flush);
      }
    };

    const isControlTarget = (target: EventTarget | null) => target instanceof Element && !!target.closest(
      'a, button, input, textarea, select, [contenteditable]:not([contenteditable="false"]), aside, [role="dialog"], [role="region"], [role="slider"], [title="Cliquez pour éditer"], .rounded-full[title], .absolute:has(> textarea), .react-pdf__Outline'
    );

    const wheel = (event: WheelEvent) => {
      // Les panneaux et contrôles gardent leur défilement natif, même avec Ctrl.
      if (isControlTarget(event.target)) return;
      const state = latest.current;
      if (event.ctrlKey) {
        if (!state.onScaleChange) return;
        event.preventDefault();
        const rect = state.cameraRef.current?.getBoundingClientRect();
        if (!rect) return;
        const currentScale = state.scale;
        const delta =
          event.deltaY *
          (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.clientHeight : 1);
        const base = frame !== null || pendingZoomRef.current ? nextScale : currentScale;
        queueZoom(base * Math.exp(-delta * 0.0015), {
          worldX: (event.clientX - rect.left) / currentScale,
          worldY: (event.clientY - rect.top) / currentScale,
          clientX: event.clientX,
          clientY: event.clientY,
        });
        return;
      }

      if (state.scrollMode !== ScrollMode.PAGED) return;

      const factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.clientHeight : 1;
      const dx = event.deltaX * factor;
      const dy = event.deltaY * factor;

      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
        event.preventDefault();
        return;
      }

      const now = performance.now();
      if (now - lastWheelTime > 180) {
        wheelTurnedInBurst = false;
        const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
        const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
        wheelExceedsX = maxScrollLeft > 2;
        wheelExceedsY = maxScrollTop > 2;
        wheelStartedAtLeft = !wheelExceedsX || container.scrollLeft <= 10;
        wheelStartedAtRight = !wheelExceedsX || container.scrollLeft >= maxScrollLeft - 10;
        wheelStartedAtTop = !wheelExceedsY || container.scrollTop <= 10;
        wheelStartedAtBottom = !wheelExceedsY || container.scrollTop >= maxScrollTop - 10;
      }
      lastWheelTime = now;

      if (wheelTurnedInBurst) {
        event.preventDefault();
        return;
      }

      if (Math.abs(dy) >= Math.abs(dx)) {
        if (!wheelExceedsY) {
          event.preventDefault();
          wheelTurnedInBurst = true;
          if (dy > 0 && state.pageNumber < state.numPages) {
            state.onNavigate(state.pageNumber + 1);
          } else if (dy < 0 && state.pageNumber > 1) {
            state.onNavigate(state.pageNumber - 1);
          }
        } else if (dy > 0 && wheelStartedAtBottom) {
          event.preventDefault();
          wheelTurnedInBurst = true;
          if (state.pageNumber < state.numPages) {
            state.onNavigate(state.pageNumber + 1, 'top');
          }
        } else if (dy < 0 && wheelStartedAtTop) {
          event.preventDefault();
          wheelTurnedInBurst = true;
          if (state.pageNumber > 1) {
            state.onNavigate(state.pageNumber - 1, 'bottom');
          }
        } else {
          event.preventDefault();
          const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
          container.scrollTop = Math.max(0, Math.min(maxScrollTop, container.scrollTop + dy));
        }
      } else {
        if (!wheelExceedsX || (dx > 0 && wheelStartedAtRight) || (dx < 0 && wheelStartedAtLeft)) {
          event.preventDefault();
          wheelTurnedInBurst = true;
          if (dx > 0 && state.pageNumber < state.numPages) {
            state.onNavigate(state.pageNumber + 1, wheelExceedsX ? 'start' : undefined);
          } else if (dx < 0 && state.pageNumber > 1) {
            state.onNavigate(state.pageNumber - 1, wheelExceedsX ? 'end' : undefined);
          }
        } else {
          event.preventDefault();
          const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
          container.scrollLeft = Math.max(0, Math.min(maxScrollLeft, container.scrollLeft + dx));
        }
      }
    };

    const distance = (touches: TouchList) =>
      Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY
      );

    const touchStart = (event: TouchEvent) => {
      const state = latest.current;
      if (state.isAnnotationMode || isControlTarget(event.target)) {
        cancel(true);
        blocked = true;
        return;
      }
      if (event.touches.length === 2) {
        setDragOffset(0, true);
        start = null;
        blocked = true;
        wasPinch = true;
        const rect = state.cameraRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = (event.touches[0].clientX + event.touches[1].clientX) / 2;
        const y = (event.touches[0].clientY + event.touches[1].clientY) / 2;
        pinch = {
          distance: Math.max(1, distance(event.touches)),
          scale: state.scale,
          worldX: (x - rect.left) / state.scale,
          worldY: (y - rect.top) / state.scale,
        };
      } else if (event.touches.length === 1 && !blocked) {
        const touch = event.touches[0];
        const now = performance.now();
        const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
        const isPaged = state.scrollMode === ScrollMode.PAGED;
        const isFitted = isPaged && state.scale <= state.fitScale * 1.02;
        // Seul un pan agrandi débordant peut nécessiter de bloquer le geste natif au bord.
        container.removeEventListener('touchmove', touchMove);
        container.addEventListener('touchmove', touchMove, { passive: !(isPaged && !isFitted && maxScrollLeft > 2) });
        start = {
          x: touch.clientX,
          y: touch.clientY,
          lastX: touch.clientX,
          lastY: touch.clientY,
          startTime: now,
          lastMoveTime: now,
          lastStepSpeed: 0,
          maxDistance: 0,
          page: state.pageNumber,
          mode: isPaged ? (isFitted ? 'fitted' : 'zoomed') : 'continuous',
          atLeftAtStart: maxScrollLeft <= 2 || container.scrollLeft <= 10,
          atRightAtStart: maxScrollLeft <= 2 || container.scrollLeft >= maxScrollLeft - 10,
          scrollLeftAtStart: container.scrollLeft,
          scrollTopAtStart: container.scrollTop,
        };
      } else {
        cancel(true);
        blocked = true;
      }
    };

    const touchMove = (event: TouchEvent) => {
      if (pinch && event.touches.length === 2) {
        queueZoom((pinch.scale * distance(event.touches)) / pinch.distance, {
          worldX: pinch.worldX,
          worldY: pinch.worldY,
          clientX: (event.touches[0].clientX + event.touches[1].clientX) / 2,
          clientY: (event.touches[0].clientY + event.touches[1].clientY) / 2,
        });
      } else if (start && event.touches.length === 1 && !blocked) {
        const touch = event.touches[0];
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        const dist = Math.hypot(dx, dy);
        if (dist > start.maxDistance) start.maxDistance = dist;

        const now = performance.now();
        const stepDist = Math.hypot(touch.clientX - start.lastX, touch.clientY - start.lastY);
        if (stepDist > 0.5) {
          const dt = Math.max(1, now - start.lastMoveTime);
          start.lastStepSpeed = stepDist / dt;
          start.lastMoveTime = now;
          start.lastX = touch.clientX;
          start.lastY = touch.clientY;
        }

        const state = latest.current;
        if (start.mode === 'fitted') {
          // touch-action réserve déjà le glissement horizontal au lecteur.
          if (dist >= 6) {
            if (Math.abs(dx) >= Math.abs(dy)) {
              const atBound =
                (state.pageNumber <= 1 && dx > 0) ||
                (state.pageNumber >= state.numPages && dx < 0);
              setDragOffset(atBound ? dx * 0.25 : dx, false);
            } else {
              setDragOffset(0, false);
            }
          }
        } else if (start.mode === 'zoomed') {
          const pullingEdge =
            Math.abs(dx) >= Math.abs(dy) &&
            ((dx < 0 && start.atRightAtStart) || (dx > 0 && start.atLeftAtStart));
          if (pullingEdge) {
            // En largeur bornée, touch-action suffit ; sinon bloquer la sortie native au bord.
            if (event.cancelable && container.scrollWidth > container.clientWidth + 2) event.preventDefault();
            if (container.scrollLeft !== start.scrollLeftAtStart) {
              container.scrollLeft = start.scrollLeftAtStart;
            }
            if (dist >= 6) {
              setDragOffset(dx * 0.35, false);
            }
          } else if (dragOffset !== 0) {
            setDragOffset(0, false);
          }
        }
      }
    };

    const touchEnd = (event: TouchEvent) => {
      if (pinch || wasPinch) {
        // Ne jamais transformer la fin d'un pincement en swipe à un doigt.
        if (frame !== null) {
          cancelFrame();
          flush();
        }
        pinch = null;
        start = null;
        if (event.touches.length === 0) {
          const state = latest.current;
          if (state.fitScale > 0 && Math.abs(nextScale - state.fitScale) <= state.fitScale * 0.08) {
            state.onFitPage?.();
          }
          wasPinch = false;
          blocked = false;
        } else {
          blocked = true;
        }
        return;
      }

      if (start && !blocked && event.touches.length === 0 && event.changedTouches.length) {
        const touch = event.changedTouches[0];
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        const dist = Math.hypot(dx, dy);
        const now = performance.now();
        const duration = now - start.startTime;
        const state = latest.current;
        const scrolledDuringTouch =
          Math.abs(container.scrollLeft - start.scrollLeftAtStart) > 2 ||
          Math.abs(container.scrollTop - start.scrollTopAtStart) > 2;

        if (start.maxDistance < 10 && dist < 10 && duration < 350 && !scrolledDuringTouch) {
          setDragOffset(0, true);
          const cr = container.getBoundingClientRect();
          const zoneLeft = cr.left + container.clientLeft;
          const zoneWidth = container.clientWidth;
          const relX = zoneWidth > 0 ? (touch.clientX - zoneLeft) / zoneWidth : 0.5;
          const isZoomedPaged =
            state.scrollMode === ScrollMode.PAGED && state.scale > state.fitScale * 1.02;
          if (relX < 0.25) {
            if (state.pageNumber > 1) {
              state.onNavigate(state.pageNumber - 1, isZoomedPaged ? 'end' : undefined);
            }
          } else if (relX > 0.75) {
            if (state.pageNumber < state.numPages) {
              state.onNavigate(state.pageNumber + 1, isZoomedPaged ? 'start' : undefined);
            }
          } else {
            state.onToggleToolbar?.();
          }
        } else if (start.mode === 'fitted') {
          const holdTime = now - start.lastMoveTime;
          const isFlick = Math.abs(dx) >= 40 && start.lastStepSpeed >= 0.5 && holdTime < 100;
          const isLongSwipe = Math.abs(dx) >= container.clientWidth * 0.25;
          if (
            state.pageNumber === start.page &&
            Math.abs(dx) >= Math.abs(dy) &&
            (isLongSwipe || isFlick)
          ) {
            const targetPage = Math.max(
              1,
              Math.min(state.numPages, start.page + (dx < 0 ? 1 : -1))
            );
            if (targetPage !== start.page) {
              setDragOffset(0, true);
              state.onNavigate(targetPage);
            } else {
              setDragOffset(0, false, true);
            }
          } else {
            setDragOffset(0, false, true);
          }
        } else if (start.mode === 'zoomed') {
          const pullingEdge =
            Math.abs(dx) >= Math.abs(dy) &&
            ((dx < 0 && start.atRightAtStart) || (dx > 0 && start.atLeftAtStart));
          const isLongSwipe = Math.abs(dx) >= container.clientWidth * 0.25;
          if (state.pageNumber === start.page && pullingEdge && isLongSwipe) {
            const targetPage = Math.max(
              1,
              Math.min(state.numPages, start.page + (dx < 0 ? 1 : -1))
            );
            if (targetPage !== start.page) {
              setDragOffset(0, true);
              state.onNavigate(targetPage, dx < 0 ? 'start' : 'end');
            } else {
              container.scrollLeft = start.scrollLeftAtStart;
              setDragOffset(0, false, true);
            }
          } else {
            if (pullingEdge) container.scrollLeft = start.scrollLeftAtStart;
            setDragOffset(0, false, true);
          }
        } else {
          setDragOffset(0, true);
        }
      }
      start = null;
      if (!event.touches.length) blocked = false;
    };

    const interrupted = () => cancel(false);
    container.addEventListener('wheel', wheel, { passive: false });
    container.addEventListener('touchstart', touchStart, { passive: true });
    container.addEventListener('touchmove', touchMove, { passive: true });
    container.addEventListener('touchend', touchEnd);
    container.addEventListener('touchcancel', interrupted);
    window.addEventListener('blur', interrupted);
    document.addEventListener('visibilitychange', interrupted);
    return () => {
      cancel(true);
      clearResetTimer();
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
