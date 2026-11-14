import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Home, List, FolderSearch, Scan, MoreHorizontal, ZoomIn, ZoomOut } from './Icons';
import { AppTheme, ScrollMode, ToolbarProps } from '../types';

const THEMES = [
  [AppTheme.LIGHT, 'Clair'], [AppTheme.SOLARIZED, 'Confort'], [AppTheme.SEPIA, 'Sépia'],
  [AppTheme.FOREST, 'Forêt'], [AppTheme.MIDNIGHT, 'Minuit'], [AppTheme.DARK, 'Sombre'],
  [AppTheme.BLUE_NIGHT, 'Bleu nuit'], [AppTheme.OLED, 'OLED'], [AppTheme.EINK, 'eInk'],
] as const;
const COLORS = [
  ['Jaune', '#facc15'], ['Vert', '#4ade80'], ['Bleu', '#60a5fa'],
  ['Rouge', '#f87171'], ['Violet', '#c084fc'],
] as const;

const Toolbar: React.FC<ToolbarProps> = ({
  file, numPages, pageNumber, scale, theme, themeVariant, scrollMode,
  isFullscreen, isVisible, isOutlineOpen, isAnnotationMode, annotationColor,
  setPageNumber, setScale, onFitToWidth, setTheme, setThemeVariant, setScrollMode,
  setAnnotationColor, toggleFullscreen, toggleOutline, toggleAnnotationMode,
  onFileChange, toggleAiPanel, toggleVisibility, onHome, recentFiles = [], onOpenRecentFile,
}) => {
  const [toolsOpen, setToolsOpen] = useState(false);
  const [pageInput, setPageInput] = useState(String(pageNumber));
  const rootRef = useRef<HTMLDivElement>(null);
  const toolsButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setPageInput(String(pageNumber)), [pageNumber, file]);
  useEffect(() => setToolsOpen(false), [file, isVisible]);
  useEffect(() => {
    if (!toolsOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setToolsOpen(false);
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
  const documentName = file instanceof File ? file.name : 'Document PDF';
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
    <div className="reader-header" ref={rootRef}>
      <div id="reader-toolbar" role="toolbar" aria-label="Commandes de lecture" className="reader-toolbar">
        <div className="reader-document">
          <button onClick={onHome} aria-label="Revenir à la bibliothèque" title="Bibliothèque"><Home size={20} /></button>
          <div className="reader-document-title" title={documentName}>{documentName}</div>
          <button onClick={toggleOutline} aria-label="Sommaire" aria-pressed={isOutlineOpen} title="Sommaire (L)"><List size={20} /></button>
          <button onClick={() => fileInputRef.current?.click()} aria-label="Ouvrir un PDF" title="Ouvrir un PDF"><FolderSearch size={20} /></button>
          <input ref={fileInputRef} type="file" accept="application/pdf" onChange={onFileChange} hidden aria-label="Choisir un PDF" />
        </div>
        <div className="reader-modes" role="group" aria-label="Mode de lecture">
          <button aria-label="Lecture continue" aria-pressed={scrollMode === ScrollMode.CONTINUOUS} onClick={() => setScrollMode(ScrollMode.CONTINUOUS)}>Continu</button>
          <button aria-label="Lecture page par page" aria-pressed={scrollMode === ScrollMode.PAGED} onClick={() => setScrollMode(ScrollMode.PAGED)}>Page par page</button>
        </div>
        <div className="reader-navigation" role="group" aria-label="Navigation dans le document">
          <button onClick={() => setPageNumber(pageNumber - 1)} disabled={pageNumber <= 1 || !numPages} aria-label="Page précédente"><ChevronLeft size={20} /></button>
          <input type="number" aria-label="Aller à la page" min={1} max={numPages || 1} step={1} value={pageInput} disabled={!numPages}
            onChange={event => setPageInput(event.target.value)} onBlur={() => setPageInput(String(pageNumber))}
            onKeyDown={event => {
              if (event.key === 'Enter') { event.preventDefault(); navigate(); }
              if (event.key === 'Escape') { event.preventDefault(); setPageInput(String(pageNumber)); }
            }} />
          <span className="reader-page-total">/ {numPages || '—'}</span>
          <button onClick={() => setPageNumber(pageNumber + 1)} disabled={pageNumber >= numPages || !numPages} aria-label="Page suivante"><ChevronRight size={20} /></button>
        </div>
        <div className="reader-primary-actions">
          <button onClick={onFitToWidth} disabled={!numPages} aria-label="Ajuster la page" title="Ajuster la page (W)"><Scan size={18} /><span>Ajuster</span></button>
          <button ref={toolsButtonRef} aria-label="Outils de lecture" aria-expanded={toolsOpen} aria-controls="reader-tools" onClick={() => setToolsOpen(open => !open)}><MoreHorizontal size={20} /><span>Outils</span></button>
        </div>
      </div>
      {toolsOpen && (
        <div id="reader-tools" role="region" aria-label="Outils de lecture" className="reader-tools">
          <div className="reader-tools-heading"><h2>Outils de lecture</h2><button onClick={() => { setToolsOpen(false); toolsButtonRef.current?.focus(); }}>Fermer</button></div>
          <section aria-label="Affichage">
            <h3>Affichage</h3>
            <div className="reader-tool-row">
              <button onClick={() => setScale(Math.max(0.1, scale / 1.15))} aria-label="Réduire le zoom"><ZoomOut size={18} /></button>
              <output aria-label="Zoom">{Math.round(scale * 100)} %</output>
              <button onClick={() => setScale(Math.min(8, scale * 1.15))} aria-label="Augmenter le zoom"><ZoomIn size={18} /></button>
            </div>
            <label className="reader-field">Thème<select value={theme} onChange={event => setTheme(event.target.value as AppTheme)}>{THEMES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="reader-field">Apparence<select value={themeVariant} onChange={event => setThemeVariant(event.target.value as 'light' | 'dark')}><option value="light">Claire</option><option value="dark">Sombre</option></select></label>
            <p className="reader-help">Vue deux pages : non disponible dans ce lecteur.</p>
          </section>
          <section aria-label="Notes">
            <h3>Notes</h3>
            <button className="reader-tool-wide" aria-pressed={isAnnotationMode} onClick={toggleAnnotationMode}>{isAnnotationMode ? 'Terminer la pose de note' : 'Ajouter une note sur la page'}</button>
            <div className="reader-colors" role="group" aria-label="Couleur des notes">
              {COLORS.map(([label, value]) => <button key={value} aria-label={label} aria-pressed={annotationColor === value} onClick={() => setAnnotationColor(value)}><span style={{ backgroundColor: value }} aria-hidden="true" />{annotationColor === value && <span aria-hidden="true">✓</span>}</button>)}
            </div>
            <p className="reader-help">Notes conservées sur cet appareil, dans les données locales de ce navigateur.</p>
          </section>
          <section aria-label="Autres outils">
            <button className="reader-tool-wide" onClick={() => { toggleAiPanel(); setToolsOpen(false); toolsButtonRef.current?.focus(); }}>Ouvrir l’assistant IA</button>
            <p className="reader-help">Le texte de la page n’est pas transmis à l’assistant.</p>
            <button className="reader-tool-wide" onClick={toggleFullscreen}>{isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}</button>
            <button className="reader-tool-wide" onClick={() => { setToolsOpen(false); toggleVisibility(); }}>Masquer la barre (H)</button>
          </section>
          <section aria-label="Lectures récentes">
            <h3>Lectures récentes</h3>
            {recentFiles.length ? recentFiles.slice(0, 8).map(recent => (
              <button className="reader-recent" key={recent.id} title={recent.name} onClick={() => { onOpenRecentFile?.(recent.id); setToolsOpen(false); }}>
                <span>{recent.name}</span><small>{new Date(recent.lastVisited).toLocaleDateString('fr-FR')}</small>
              </button>
            )) : <p className="reader-help">Aucune lecture récente.</p>}
          </section>
        </div>
      )}
    </div>
  );
};

export default Toolbar;
