import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize,
  Minimize,
  Sun,
  Moon,
  Upload,
  EyeOff,
  FileText,
  ArrowLeft,
  Scan,
  StickyNote,
  Sparkles,
  X,
} from 'lucide-react';
import { AppTheme, ScrollMode, ToolbarProps } from '../types';
import { THEME_LIST } from '../utils/ThemeManager';
import ReadingProgressBar from './ReadingProgressBar';

const NOTE_COLORS = [
  { value: '#facc15', label: 'Jaune' },
  { value: '#4ade80', label: 'Vert' },
  { value: '#60a5fa', label: 'Bleu' },
  { value: '#f87171', label: 'Rouge' },
  { value: '#c084fc', label: 'Violet' },
];

export interface ReaderBottomDockProps {
  numPages: number;
  pageNumber: number;
  isVisible: boolean;
  setPageNumber: (page: number) => void;
}

export const ReaderBottomDock: React.FC<ReaderBottomDockProps> = ({
  numPages,
  pageNumber,
  isVisible,
  setPageNumber,
}) => {
  if (!isVisible) {
    return (
      <input
        type="number"
        min={1}
        max={numPages || 1}
        step={1}
        aria-label="Aller à la page"
        value={String(pageNumber)}
        readOnly
        tabIndex={-1}
        className="sr-only pointer-events-none"
      />
    );
  }

  return (
    <div
      className="reader-dock-bar absolute inset-x-0 bottom-0 z-30 select-none"
    >
      <nav
        aria-label="Navigation dans le document"
        className="reader-dock"
        style={{
          backgroundColor: 'transparent',
          color: 'var(--lumina-text-secondary)',
        }}
      >
        <button
          type="button"
          onClick={() => setPageNumber(pageNumber - 1)}
          disabled={pageNumber <= 1 || !numPages}
          aria-label="Page précédente"
          title="Page précédente"
          className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-[2px] transition-colors disabled:opacity-35 disabled:pointer-events-none"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="dock-progress">
          <ReadingProgressBar currentPage={pageNumber} numPages={numPages} onNavigate={setPageNumber} />
        </div>

        <button
          type="button"
          onClick={() => setPageNumber(pageNumber + 1)}
          disabled={pageNumber >= numPages || !numPages}
          aria-label="Page suivante"
          title="Page suivante"
          className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-[2px] transition-colors disabled:opacity-35 disabled:pointer-events-none"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </nav>
    </div>
  );
};

const Toolbar: React.FC<ToolbarProps> = ({
  file,
  numPages,
  pageNumber,
  scale,
  theme,
  themeVariant,
  scrollMode,
  isFullscreen,
  isVisible,
  isOutlineOpen,
  isAnnotationMode,
  annotationColor,
  setPageNumber,
  setScale,
  onFitToWidth,
  setTheme,
  setThemeVariant,
  setScrollMode,
  setAnnotationColor,
  toggleFullscreen,
  toggleOutline,
  toggleAnnotationMode,
  onFileChange,
  toggleAiPanel,
  toggleVisibility,
  onHome,
  recentFiles = [],
  onOpenRecentFile,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const toolsButtonRef = useRef<HTMLButtonElement>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [pageInput, setPageInput] = useState(() => String(pageNumber));

  useEffect(() => {
    setPageInput(String(pageNumber));
  }, [pageNumber]);

  const navigate = () => {
    const value = Number(pageInput);
    if (pageInput.trim() && Number.isFinite(value) && numPages > 0) {
      const page = Math.max(1, Math.min(numPages, Math.trunc(value)));
      setPageNumber(page);
      setPageInput(String(page));
    } else {
      setPageInput(String(pageNumber));
    }
  };

  const documentName = file instanceof File
    ? file.name
    : typeof file === 'string'
      ? file
      : 'Document PDF';

  useEffect(() => {
    setToolsOpen(false);
  }, [file, isVisible]);

  useEffect(() => {
    if (!toolsOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setToolsOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setToolsOpen(false);
        toolsButtonRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [toolsOpen]);

  const isContinuous = scrollMode === ScrollMode.CONTINUOUS;

  return (
    <header
      ref={rootRef}
      id="reader-toolbar"
      role="toolbar"
      aria-label="Commandes de lecture"
      hidden={!isVisible}
      className="reader-topbar w-full"
    >
      <div className="reader-topbar-layout">
        <button type="button" onClick={onHome} aria-label="Revenir à la bibliothèque"
          title="Revenir à la bibliothèque" className="reader-icon">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="reader-document-position">
          <div className="reader-document-title" title={documentName}>{documentName}</div>
          {isVisible && (
            <div className="reader-page-position">
              <input
                type="number"
                min={1}
                max={numPages || 1}
                step={1}
                aria-label="Aller à la page"
                value={pageInput}
                disabled={!numPages}
                onChange={(e) => setPageInput(e.target.value)}
                onBlur={() => setPageInput(String(pageNumber))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    navigate();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setPageInput(String(pageNumber));
                  }
                }}
                className="reader-page-input"
                style={{ width: `${Math.max(3, String(numPages).length + 1)}ch` }}
              />
              <span className="reader-page-total">/ {numPages || '—'}</span>
            </div>
          )}
        </div>
        <button type="button" onClick={onFitToWidth} disabled={!numPages}
          aria-label="Ajuster la page" title="Ajuster la page (W)" className="reader-icon justify-self-end">
          <Scan className="w-5 h-5" />
        </button>
      </div>

      <button type="button" onClick={toggleOutline}
        aria-label="Sommaire" aria-expanded={isOutlineOpen} aria-controls="reader-outline" title="Sommaire (L)"
        className="reader-edge-tab reader-edge-left">Sommaire</button>
      <button ref={toolsButtonRef} type="button" onClick={() => setToolsOpen((open) => !open)}
        aria-label="Outils de lecture" aria-expanded={toolsOpen} aria-controls="reader-tools"
        className="reader-edge-tab reader-edge-right">Outils</button>

      <div
        id="reader-tools"
        role="region"
        aria-label="Outils de lecture"
        hidden={!toolsOpen}
        className="reader-tools p-6 space-y-4"
      >
          <div className="flex items-center justify-between">
            <h2>Outils de lecture</h2>
            <button type="button" onClick={() => {
              setToolsOpen(false);
              toolsButtonRef.current?.focus();
            }} className="reader-icon" style={{ color: 'var(--lumina-text-secondary)' }}>
              <X className="w-5 h-5" />
              <span className="sr-only">Fermer</span>
            </button>
          </div>
          <section aria-label="Mode">
            <h3>Mode</h3>
            <div role="group" aria-label="Mode de lecture" className="flex flex-wrap gap-3">
              <button type="button" onClick={() => setScrollMode(ScrollMode.CONTINUOUS)}
                aria-label="Lecture continue" aria-pressed={isContinuous} className="reader-text-action">Continu</button>
              <button type="button" onClick={() => setScrollMode(ScrollMode.PAGED)}
                aria-label="Lecture page par page" aria-pressed={!isContinuous} className="reader-text-action">Page par page</button>
            </div>
          </section>

          {/* Affichage : Zoom + Jour/Nuit + 9 thèmes */}
          <section aria-label="Affichage" className="space-y-3">
            <h3>Zoom</h3>
            <div className="reader-zoom-controls flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setScale(Math.max(0.1, scale / 1.15))}
                aria-label="Réduire le zoom"
                className="inline-flex items-center justify-center gap-1.5 min-w-[44px] min-h-[44px] px-3 rounded-[2px] text-xs font-medium transition-colors"
                style={{
                  color: 'var(--lumina-text-primary)',
                }}
              >
                <ZoomOut className="w-4 h-4" />
                <span>Réduire</span>
              </button>

              <output
                aria-label="Zoom"
                className="text-xs font-semibold px-2 whitespace-nowrap shrink-0"
                style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--lumina-text-primary)' }}
              >
                {Math.round(scale * 100)} %
              </output>

              <button
                type="button"
                onClick={() => setScale(Math.min(8, scale * 1.15))}
                aria-label="Augmenter le zoom"
                className="inline-flex items-center justify-center gap-1.5 min-w-[44px] min-h-[44px] px-3 rounded-[2px] text-xs font-medium transition-colors"
                style={{
                  color: 'var(--lumina-text-primary)',
                }}
              >
                <ZoomIn className="w-4 h-4" />
                <span>Agrandir</span>
              </button>
            </div>

            <h3>Apparence</h3>
            <div
              role="group"
              aria-label="Variante de luminosité"
              className="grid grid-cols-2 gap-1.5 p-1 rounded-[2px]"
              style={{ backgroundColor: 'transparent' }}
            >
              <button
                type="button"
                onClick={() => setThemeVariant('light')}
                aria-pressed={themeVariant === 'light'}
                className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 rounded-[2px] text-xs font-medium transition-colors"
                style={
                  themeVariant === 'light'
                    ? {
                        backgroundColor: 'transparent',
                        color: 'var(--lumina-accent)',
                      }
                    : { color: 'var(--lumina-text-secondary)' }
                }
              >
                <Sun className="w-4 h-4" />
                <span>Jour</span>
              </button>
              <button
                type="button"
                onClick={() => setThemeVariant('dark')}
                aria-pressed={themeVariant === 'dark'}
                className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 rounded-[2px] text-xs font-medium transition-colors"
                style={
                  themeVariant === 'dark'
                    ? {
                        backgroundColor: 'transparent',
                        color: 'var(--lumina-accent)',
                      }
                    : { color: 'var(--lumina-text-secondary)' }
                }
              >
                <Moon className="w-4 h-4" />
                <span>Nuit</span>
              </button>
            </div>

            <h3>Ambiance</h3>
            <div role="group" aria-label="Thème de couleur" className="grid grid-cols-3 gap-1.5">
              {THEME_LIST.map((item) => {
                const isSelected = theme === item.id;
                const swatch = themeVariant === 'dark' ? item.nuit : item.jour;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-label={item.name}
                    onClick={() => setTheme(item.id)}
                    aria-pressed={isSelected}
                    className="flex items-center gap-2 min-h-[44px] px-2.5 py-1.5 rounded-[2px] text-left text-xs font-medium transition-colors"
                    style={
                      isSelected
                        ? {
                            backgroundColor: 'transparent',
                            color: 'var(--lumina-accent)',
                            outline: '1.5px solid var(--lumina-accent)',
                          }
                        : {
                            color: 'var(--lumina-text-primary)',
                          }
                    }
                  >
                    <span
                      aria-hidden="true"
                      className="w-5 h-5 rounded-[2px] flex items-center justify-center text-[10px] font-bold shrink-0"
                      style={{
                        backgroundColor: swatch.paperBg,
                        color: swatch.paperFg,
                        border: '1px solid rgba(128,128,128,0.28)',
                        fontFamily: 'var(--font-display)',
                      }}
                    >
                      Aa
                    </span>
                    <span className="truncate">{item.name}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Notes */}
          <section
            aria-label="Notes"
            className="space-y-2.5 pt-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--lumina-text-secondary)' }}>
                Notes
              </h3>
            </div>

            <button
              type="button"
              onClick={toggleAnnotationMode}
              aria-pressed={isAnnotationMode}
              className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-3 rounded-[2px] text-xs font-semibold transition-colors"
              style={
                isAnnotationMode
                  ? { backgroundColor: 'transparent', color: 'var(--lumina-accent)' }
                  : { backgroundColor: 'transparent', color: 'var(--lumina-text-primary)' }
              }
            >
              <StickyNote className="w-4 h-4" />
              <span>{isAnnotationMode ? 'Terminer la pose de note' : 'Ajouter une note sur la page'}</span>
            </button>

            <div role="group" aria-label="Couleur des notes" className="flex items-center justify-between gap-1">
              {NOTE_COLORS.map((color) => {
                const selected = annotationColor === color.value;
                return (
                  <button
                    key={color.value}
                    type="button"
                    onClick={() => setAnnotationColor(color.value)}
                    aria-label={color.label}
                    aria-pressed={selected}
                    title={color.label}
                    className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-[2px] transition-transform"
                    style={{
                      backgroundColor: selected ? 'var(--lumina-active-bg)' : 'transparent',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className="w-5 h-5 rounded-[2px] border border-black/20"
                      style={{
                        backgroundColor: color.value,
                        transform: selected ? 'scale(1.18)' : 'scale(1)',
                      }}
                    />
                  </button>
                );
              })}
            </div>

            <p className="text-[11px]" style={{ color: 'var(--lumina-text-secondary)' }}>
              Vos notes sont conservées sur cet appareil. Gardez une copie de vos PDF ; les données de ce navigateur ne sont pas une sauvegarde indépendante.
            </p>
          </section>

          {/* Autres outils */}
          <section
            aria-label="Autres outils"
            className="grid grid-cols-2 gap-2 pt-3"
          >
            <h3 className="col-span-2">Autres actions</h3>
            <button
              type="button"
              onClick={() => {
                setToolsOpen(false);
                fileInputRef.current?.click();
              }}
              className="inline-flex items-center gap-2 min-h-[44px] px-3 rounded-[2px] text-xs font-medium transition-colors"
              style={{
                color: 'var(--lumina-text-primary)',
              }}
            >
              <Upload className="w-4 h-4 shrink-0" />
              <span>Ouvrir un PDF</span>
            </button>

            <button
              type="button"
              onClick={() => {
                toggleAiPanel();
                setToolsOpen(false);
                toolsButtonRef.current?.focus();
              }}
              className="inline-flex items-center gap-2 min-h-[44px] px-3 rounded-[2px] text-xs font-medium transition-colors col-span-2"
              style={{
                color: 'var(--lumina-text-primary)',
              }}
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>Ouvrir l’assistant IA</span>
            </button>

            <button
              type="button"
              onClick={toggleFullscreen}
              aria-pressed={isFullscreen}
              className="inline-flex items-center gap-2 min-h-[44px] px-3 rounded-[2px] text-xs font-medium transition-colors"
              style={{
                color: 'var(--lumina-text-primary)',
              }}
            >
              {isFullscreen ? <Minimize className="w-4 h-4 shrink-0" /> : <Maximize className="w-4 h-4 shrink-0" />}
              <span>{isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setToolsOpen(false);
                toggleVisibility();
              }}
              className="inline-flex items-center gap-2 min-h-[44px] px-3 rounded-[2px] text-xs font-medium transition-colors"
              style={{
                color: 'var(--lumina-text-primary)',
              }}
            >
              <EyeOff className="w-4 h-4 shrink-0" />
              <span>Masquer la barre (H)</span>
            </button>
          </section>

          {/* Lectures récentes */}
          {recentFiles.length > 0 && onOpenRecentFile && (
            <section
              aria-label="Lectures récentes"
              className="space-y-1.5 pt-3"
              >
              <div className="text-sm font-semibold" style={{ color: 'var(--lumina-text-secondary)' }}>
                <span>Lectures récentes</span>
              </div>
              <div className="max-h-36 overflow-y-auto space-y-1">
                {recentFiles.slice(0, 8).map((recent) => (
                  <button
                    key={recent.id}
                    type="button"
                    title={recent.name}
                    onClick={() => {
                      onOpenRecentFile(recent.id);
                      setToolsOpen(false);
                    }}
                    className="w-full flex items-center gap-2 min-h-[44px] px-2.5 py-1.5 rounded-[2px] text-left text-xs transition-colors"
                    style={{ color: 'var(--lumina-text-primary)' }}
                  >
                    <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--lumina-accent)' }} />
                    <span className="truncate flex-1">{recent.name}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        onChange={onFileChange}
        hidden
        aria-label="Choisir un PDF"
        className="hidden"
      />
    </header>
  );
};

export default Toolbar;
