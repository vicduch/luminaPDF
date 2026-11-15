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
  BookOpen,
  Upload,
  EyeOff,
  FileText,
  ArrowLeft,
  SlidersHorizontal,
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
  const [pageInput, setPageInput] = useState(() => String(pageNumber));

  useEffect(() => {
    setPageInput(String(pageNumber));
  }, [pageNumber]);

  if (!isVisible) {
    return (
      <input
        type="number"
        min={1}
        max={numPages || 1}
        step={1}
        aria-label="Aller à la page"
        value={pageInput}
        readOnly
        tabIndex={-1}
        className="sr-only pointer-events-none"
      />
    );
  }

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

  return (
    <div
      className="reader-dock-bar flex-none flex items-center justify-center px-2 pt-2 pb-3 z-30 select-none"
      style={{
        backgroundColor: 'transparent',
      }}
    >
      <nav
        aria-label="Navigation dans le document"
        className="reader-dock flex items-center gap-1 sm:gap-2 px-2 py-0.5 rounded-full max-w-full"
        style={{
          backgroundColor: 'var(--lumina-toolbar-bg)',
          color: 'var(--lumina-text-primary)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          border: '1px solid var(--lumina-filet)',
        }}
      >
        <button
          type="button"
          onClick={() => setPageNumber(pageNumber - 1)}
          disabled={pageNumber <= 1 || !numPages}
          aria-label="Page précédente"
          title="Page précédente"
          className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-md transition-colors disabled:opacity-35 disabled:pointer-events-none"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-1 text-xs font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>
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
            className="w-12 min-w-[44px] min-h-[44px] px-1 text-center text-xs font-semibold rounded-md bg-transparent focus:outline-none focus:ring-2"
            style={{
              color: 'var(--lumina-text-primary)',
              border: '1px solid var(--lumina-filet-fort)',
            }}
          />
          <span className="reader-page-total px-1 whitespace-nowrap" style={{ color: 'var(--lumina-text-secondary)' }}>
            / {numPages || '—'}
          </span>
        </div>

        <div className="dock-progress flex items-center w-14 sm:w-32 px-1">
          <ReadingProgressBar currentPage={pageNumber} numPages={numPages} onNavigate={setPageNumber} />
        </div>

        <button
          type="button"
          onClick={() => setPageNumber(pageNumber + 1)}
          disabled={pageNumber >= numPages || !numPages}
          aria-label="Page suivante"
          title="Page suivante"
          className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-md transition-colors disabled:opacity-35 disabled:pointer-events-none"
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
  scale,
  theme,
  themeVariant,
  scrollMode,
  isFullscreen,
  isVisible,
  isOutlineOpen,
  isAnnotationMode,
  annotationColor,
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

  if (!isVisible) return null;

  const isContinuous = scrollMode === ScrollMode.CONTINUOUS;

  return (
    <header
      ref={rootRef}
      id="reader-toolbar"
      role="toolbar"
      aria-label="Commandes de lecture"
      className="reader-topbar relative z-30 w-full flex-none transition-colors duration-200"
      style={{
        backgroundColor: 'var(--lumina-toolbar-glass-bg)',
        borderBottom: '1px solid color-mix(in srgb, var(--lumina-filet-fort) 14%, transparent)',
        backdropFilter: 'blur(22px)',
        WebkitBackdropFilter: 'blur(22px)',
        color: 'var(--lumina-text-primary)',
      }}
    >
      <div className="reader-topbar-layout mx-auto w-full items-center gap-1 px-1 py-1 sm:gap-2 sm:px-4">
        {/* Gauche : Retour bibliothèque + titre éditorial */}
        <div className="flex items-center gap-1.5 min-w-0 sm:flex-1">
          <button
            type="button"
            onClick={onHome}
            aria-label="Revenir à la bibliothèque"
            title="Revenir à la bibliothèque"
            className="inline-flex items-center justify-center gap-1.5 min-w-[44px] min-h-[44px] px-2 rounded-md text-xs font-medium transition-colors shrink-0"
            style={{ color: 'var(--lumina-text-primary)' }}
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span className="hidden md:inline">Bibliothèque</span>
          </button>

          <div
            className="reader-document-title hidden sm:block min-w-0 flex-1 truncate text-xs sm:text-sm font-medium px-1"
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--lumina-text-primary)',
            }}
            title={documentName}
          >
            {documentName}
          </div>
        </div>

        {/* Centre : deux modes de lecture également accessibles */}
        <div className="reader-modes flex items-center justify-center shrink-0">
          <div
            role="group"
            aria-label="Mode de lecture"
            className="inline-flex items-center rounded-lg p-0.5"
            style={{
              backgroundColor: 'var(--lumina-hover-bg)',
            }}
          >
            <button
              type="button"
              onClick={() => setScrollMode(ScrollMode.CONTINUOUS)}
              aria-label="Lecture continue"
              aria-pressed={isContinuous}
              title="Lecture continue"
              className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] px-2 sm:px-3 rounded-md text-[11px] sm:text-xs font-medium transition-colors whitespace-nowrap"
              style={
                isContinuous
                  ? {
                      backgroundColor: 'var(--lumina-paper-bg)',
                      color: 'var(--lumina-text-primary)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    }
                  : { color: 'var(--lumina-text-secondary)' }
              }
            >
              Continu
            </button>

            <button
              type="button"
              onClick={() => setScrollMode(ScrollMode.PAGED)}
              aria-label="Lecture page par page"
              aria-pressed={!isContinuous}
              title="Lecture page par page"
              className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] px-2 sm:px-3 rounded-md text-[11px] sm:text-xs font-medium transition-colors whitespace-nowrap"
              style={
                !isContinuous
                  ? {
                      backgroundColor: 'var(--lumina-paper-bg)',
                      color: 'var(--lumina-text-primary)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    }
                  : { color: 'var(--lumina-text-secondary)' }
              }
            >
              Page par page
            </button>
          </div>

        </div>

        {/* Droite : accès directs sans passer par les outils */}
        <div className="reader-actions flex items-center justify-end gap-1 shrink-0">
          <button type="button" onClick={toggleOutline}
            aria-label="Sommaire" aria-expanded={isOutlineOpen} aria-controls="reader-outline" title="Sommaire (L)"
            className="inline-flex items-center justify-center gap-1.5 min-w-[44px] min-h-[44px] px-2 sm:px-3 rounded-md text-xs font-medium"
            style={isOutlineOpen ? { backgroundColor: 'var(--lumina-active-bg)', color: 'var(--lumina-accent)' } : { color: 'var(--lumina-text-primary)' }}>
            <BookOpen className="w-4 h-4 shrink-0" />
            <span className="hidden md:inline">Sommaire</span>
          </button>
          <button
            type="button"
            onClick={onFitToWidth}
            disabled={!numPages}
            aria-label="Ajuster la page"
            title="Ajuster la page (W)"
            className="inline-flex items-center justify-center gap-1.5 min-w-[44px] min-h-[44px] px-2 sm:px-3 rounded-md text-xs font-medium transition-colors disabled:opacity-40"
            style={{ color: 'var(--lumina-text-primary)' }}
          >
            <Scan className="w-4 h-4 shrink-0" />
            <span className="hidden md:inline">Ajuster</span>
          </button>

          <button
            ref={toolsButtonRef}
            type="button"
            onClick={() => setToolsOpen((open) => !open)}
            aria-label="Outils de lecture"
            aria-expanded={toolsOpen}
            aria-controls="reader-tools"
            title="Outils de lecture"
            className="relative inline-flex items-center justify-center gap-1.5 min-w-[44px] min-h-[44px] px-2 sm:px-3 rounded-md text-xs font-medium transition-colors"
            style={
              toolsOpen || isAnnotationMode
                ? { backgroundColor: 'var(--lumina-active-bg)', color: 'var(--lumina-accent)' }
                : { color: 'var(--lumina-text-primary)' }
            }
          >
            <SlidersHorizontal className="w-4 h-4 shrink-0" />
            <span className="hidden md:inline">Outils</span>
            {isAnnotationMode && (
              <span
                aria-hidden="true"
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: annotationColor }}
              />
            )}
          </button>
        </div>
      </div>

      {toolsOpen && (
        <div
          id="reader-tools"
          role="region"
          aria-label="Outils de lecture"
          className="reader-tools absolute right-2 top-full mt-2 w-[min(22.5rem,calc(100vw-1rem))] max-h-[calc(100vh-5rem)] overflow-y-auto rounded-lg p-4 space-y-4 z-50"
          style={{
            backgroundColor: 'var(--lumina-toolbar-bg)',
            border: '1px solid var(--lumina-filet)',
            color: 'var(--lumina-text-primary)',
            boxShadow: 'var(--lumina-shadow)',
          }}
        >
          <div className="flex items-center justify-between pb-2">
            <h2 className="text-sm font-medium" style={{ fontFamily: 'var(--font-display)' }}>
              Outils de lecture
            </h2>
            <button
              type="button"
              onClick={() => {
                setToolsOpen(false);
                toolsButtonRef.current?.focus();
              }}
              className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] -my-2 -mr-2 rounded-md text-xs font-medium"
              style={{ color: 'var(--lumina-text-secondary)' }}
            >
              <X className="w-4 h-4" />
              <span className="sr-only">Fermer</span>
            </button>
          </div>

          {/* Affichage : Zoom + Jour/Nuit + 9 thèmes */}
          <section aria-label="Affichage" className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setScale(Math.max(0.1, scale / 1.15))}
                aria-label="Réduire le zoom"
                className="inline-flex items-center justify-center gap-1.5 min-w-[44px] min-h-[44px] px-3 rounded-md text-xs font-medium transition-colors"
                style={{
                  color: 'var(--lumina-text-primary)',
                }}
              >
                <ZoomOut className="w-4 h-4" />
                <span>Réduire</span>
              </button>

              <output
                aria-label="Zoom"
                className="text-xs font-semibold px-2"
                style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--lumina-text-primary)' }}
              >
                {Math.round(scale * 100)} %
              </output>

              <button
                type="button"
                onClick={() => setScale(Math.min(8, scale * 1.15))}
                aria-label="Augmenter le zoom"
                className="inline-flex items-center justify-center gap-1.5 min-w-[44px] min-h-[44px] px-3 rounded-md text-xs font-medium transition-colors"
                style={{
                  color: 'var(--lumina-text-primary)',
                }}
              >
                <ZoomIn className="w-4 h-4" />
                <span>Agrandir</span>
              </button>
            </div>

            <div
              role="group"
              aria-label="Variante de luminosité"
              className="grid grid-cols-2 gap-1.5 p-1 rounded-lg"
              style={{ backgroundColor: 'var(--lumina-hover-bg)' }}
            >
              <button
                type="button"
                onClick={() => setThemeVariant('light')}
                aria-pressed={themeVariant === 'light'}
                className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 rounded-lg text-xs font-medium transition-colors"
                style={
                  themeVariant === 'light'
                    ? {
                        backgroundColor: 'var(--lumina-paper-bg)',
                        color: 'var(--lumina-text-primary)',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
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
                className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 rounded-lg text-xs font-medium transition-colors"
                style={
                  themeVariant === 'dark'
                    ? {
                        backgroundColor: 'var(--lumina-paper-bg)',
                        color: 'var(--lumina-text-primary)',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.14)',
                      }
                    : { color: 'var(--lumina-text-secondary)' }
                }
              >
                <Moon className="w-4 h-4" />
                <span>Nuit</span>
              </button>
            </div>

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
                    className="flex items-center gap-2 min-h-[44px] px-2.5 py-1.5 rounded-md text-left text-xs font-medium transition-colors"
                    style={
                      isSelected
                        ? {
                            backgroundColor: 'var(--lumina-active-bg)',
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
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
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
              className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-3 rounded-md text-xs font-semibold transition-colors"
              style={
                isAnnotationMode
                  ? { backgroundColor: 'var(--lumina-accent)', color: 'var(--lumina-accent-fg)' }
                  : { backgroundColor: 'var(--lumina-hover-bg)', color: 'var(--lumina-text-primary)' }
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
                    className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-md transition-transform"
                    style={{
                      backgroundColor: selected ? 'var(--lumina-active-bg)' : 'transparent',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className="w-5 h-5 rounded-full border border-black/20"
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
            <button
              type="button"
              onClick={() => {
                setToolsOpen(false);
                fileInputRef.current?.click();
              }}
              className="inline-flex items-center gap-2 min-h-[44px] px-3 rounded-md text-xs font-medium transition-colors"
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
              className="inline-flex items-center gap-2 min-h-[44px] px-3 rounded-md text-xs font-medium transition-colors col-span-2"
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
              className="inline-flex items-center gap-2 min-h-[44px] px-3 rounded-md text-xs font-medium transition-colors"
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
              className="inline-flex items-center gap-2 min-h-[44px] px-3 rounded-md text-xs font-medium transition-colors"
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
                    className="w-full flex items-center gap-2 min-h-[44px] px-2.5 py-1.5 rounded-md text-left text-xs transition-colors"
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
      )}

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
