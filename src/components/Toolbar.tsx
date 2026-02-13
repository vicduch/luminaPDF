import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize,
  Minimize,
  Sparkles,
  BookOpen,
  FileText,
  GalleryVertical,
  GalleryHorizontal,
  ChevronUp,
  List,
  Scan,
  MessageSquare,
  Home,
  FolderSearch,
  Sun,
  Moon,
  Clock,
  MoreHorizontal
} from './Icons';
import { ToolbarProps, ViewMode, AppTheme, ScrollMode, ThemeVariant } from '../types';
import ThemeSelector from './ThemeSelector';

const getRelativeTime = (ms: number): string => {
  const delta = Date.now() - ms;
  const mins = Math.floor(delta / 60000);
  if (mins < 1) return 'À l\'instant';
  if (mins < 60) return `Il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Il y a ${days}j`;
  return new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

const Toolbar: React.FC<ToolbarProps> = ({
  file,
  numPages,
  pageNumber,
  scale,
  theme,
  themeVariant,
  viewMode,
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
  setViewMode,
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
  onOpenRecentFile
}) => {

  const [isColorMenuOpen, setIsColorMenuOpen] = useState(false);
  const [isRecentsOpen, setIsRecentsOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const recentsRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (recentsRef.current && !recentsRef.current.contains(e.target as Node)) {
        setIsRecentsOpen(false);
      }
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setIsMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isVisible) return null;

  const COLORS = [
    { label: 'Jaune', value: '#facc15' },
    { label: 'Vert', value: '#4ade80' },
    { label: 'Bleu', value: '#60a5fa' },
    { label: 'Rouge', value: '#f87171' },
    { label: 'Violet', value: '#c084fc' },
  ];

  const menuThemeClass = 'bg-[var(--lumina-bg-secondary)]/95 border-[var(--lumina-border)] shadow-xl backdrop-blur-md';

  // Get toolbar background/text colors based on theme
  const getToolbarClasses = () => {
    return 'text-[var(--lumina-text)]';
  };

  return (
    <div className={`
      h-12 md:h-14 border-b flex items-center justify-between px-2 md:px-4 transition-theme z-40 relative flex-shrink-0 shadow-sm glass-premium
      ${getToolbarClasses()}
    `}>
      {/* Left Area: Navigation & Tools */}
      <div className="flex items-center gap-1 md:gap-2 lg:gap-3 flex-shrink-0">
        <button
          onClick={onHome}
          className="btn-action hover:text-violet-500"
          title="Accueil"
        >
          <Home size={18} />
        </button>

        <div className="h-4 w-px bg-current opacity-10 mx-1 hidden sm:block"></div>

        {file && (
          <button
            onClick={toggleOutline}
            className={`btn-action ${isOutlineOpen ? 'active' : ''}`}
            title="Sommaire"
          >
            <List size={18} />
          </button>
        )}

        <label className="btn-action cursor-pointer group" title="Ouvrir un fichier PDF">
          <input type="file" accept="application/pdf" onChange={onFileChange} className="hidden" />
          <FolderSearch size={18} className="group-hover:scale-110 transition-transform" />
        </label>

        {/* Recent Files Dropdown */}
        {recentFiles.length > 0 && (
          <div className="relative group/recents" ref={recentsRef}>
            <button
              onClick={() => setIsRecentsOpen(!isRecentsOpen)}
              className={`btn-action ${isRecentsOpen ? 'active' : ''}`}
              title="Fichiers récents"
            >
              <Clock size={18} />
            </button>

            {isRecentsOpen && (
              <div className={`
                absolute top-full left-0 mt-3 w-64 md:w-80 dropdown-premium z-50
                ${menuThemeClass}
              `}>
                <div className="px-4 py-3 border-b border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5">
                  <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">Dernières lectures</span>
                </div>
                <div className="max-h-[320px] overflow-y-auto">
                  {recentFiles.slice(0, 8).map((f) => {
                    const ago = getRelativeTime(f.lastVisited);
                    return (
                      <button
                        key={f.id}
                        onClick={() => {
                          onOpenRecentFile?.(f.id);
                          setIsRecentsOpen(false);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5 transition flex items-center gap-4 group/item border-b border-black/5 last:border-0 dark:border-white/5"
                      >
                        <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                          <FileText size={16} className="text-violet-500 opacity-70 group-hover/item:opacity-100 transition" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold truncate leading-tight">{f.name}</p>
                          <p className="text-[10px] opacity-40 mt-1 font-medium">{ago}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Center Area: Page Control — Hidden on very small mobile */}
      <div className="flex-1 flex items-center justify-center gap-2 md:gap-4 min-w-0 px-2 lg:px-6">
        <div className="flex items-center bg-black/10 dark:bg-white/10 rounded-xl p-1 shadow-inner h-9 md:h-10">
          <button
            disabled={pageNumber <= 1 || scrollMode === ScrollMode.CONTINUOUS}
            onClick={() => setPageNumber(pageNumber - 1)}
            className="p-1 px-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-30 transition-all shrink-0"
          >
            <ChevronLeft size={16} />
          </button>

          <div className="flex flex-col items-center justify-center px-1 md:px-3 min-w-[70px] md:min-w-[90px]">
            <span className="text-[12px] md:text-[13px] font-bold select-none leading-none">
              {numPages > 0 ? `${pageNumber} / ${numPages}` : '--'}
            </span>
            {file && (
              <span className="text-[9px] opacity-40 truncate max-w-[60px] md:max-w-[100px] mt-0.5 hidden sm:block font-medium uppercase tracking-tighter">
                {file instanceof File ? file.name : 'Document'}
              </span>
            )}
          </div>

          <button
            disabled={pageNumber >= numPages || scrollMode === ScrollMode.CONTINUOUS}
            onClick={() => setPageNumber(pageNumber + 1)}
            className="p-1 px-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-30 transition-all shrink-0"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="hidden lg:flex items-center gap-1 bg-black/5 dark:bg-white/5 rounded-xl p-1 h-9 md:h-10">
          <button onClick={() => setScale(Math.max(0.1, scale / 1.15))} className="btn-action !p-1.5" title="Zoom Arrière">
            <ZoomOut size={16} />
          </button>
          <div className="text-[12px] w-12 text-center font-bold tracking-tight">
            {Math.round(scale * 100)}%
          </div>
          <button onClick={() => setScale(Math.min(8.0, scale * 1.15))} className="btn-action !p-1.5" title="Zoom Avant">
            <ZoomIn size={16} />
          </button>
          <div className="w-px h-4 bg-current opacity-10 mx-1"></div>
          <button onClick={onFitToWidth} className="btn-action !p-1.5" title="Ajuster">
            <Scan size={16} />
          </button>
        </div>
      </div>

      {/* Right Area: Secondary Tools & Customization */}
      <div className="flex items-center gap-0.5 md:gap-1 lg:gap-2 flex-shrink-0">
        {/* Fit Width — visible on mobile/tablet until lg */}
        <button
          onClick={onFitToWidth}
          className="lg:hidden btn-action"
          title="Ajuster"
        >
          <Scan size={18} />
        </button>

        {/* Annotation Toggle */}
        <div
          className="relative flex items-center justify-center"
          onMouseEnter={() => isAnnotationMode && setIsColorMenuOpen(true)}
          onMouseLeave={() => setIsColorMenuOpen(false)}
        >
          <button
            onClick={toggleAnnotationMode}
            className={`btn-action relative ${isAnnotationMode ? 'active' : ''}`}
            title={isAnnotationMode ? "Désactiver les annotations" : "Activer les annotations"}
          >
            <MessageSquare size={17} />
            {isAnnotationMode && (
              <span
                className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full ring-1 ring-white dark:ring-slate-900 shadow-sm"
                style={{ backgroundColor: annotationColor }}
              />
            )}
          </button>

          {/* Color Menu Dropdown */}
          {isAnnotationMode && isColorMenuOpen && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 pt-4 z-50 animate-pop-in">
              <div className={`p-2.5 dropdown-premium flex gap-3 ${menuThemeClass}`}>
                {COLORS.map(color => (
                  <button
                    key={color.value}
                    onClick={(e) => {
                      e.stopPropagation();
                      setAnnotationColor(color.value);
                    }}
                    className={`
                      w-6 h-6 rounded-full transition-transform hover:scale-125 relative z-10 shadow-sm
                      ${annotationColor === color.value ? 'ring-2 ring-offset-1 ring-blue-500 scale-110' : 'ring-1 ring-black/10 hover:ring-black/20'}
                    `}
                    style={{ backgroundColor: color.value }}
                    title={color.label}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* AI Trigger */}
        <button
          onClick={toggleAiPanel}
          className="btn-action hover:text-[var(--lumina-accent)] group"
          title="Assistant IA"
        >
          <Sparkles size={18} className="group-hover:animate-soft-pulse text-[var(--lumina-accent)]" />
        </button>

        <div className="h-4 w-px bg-current opacity-10 mx-1 hidden sm:block"></div>

        {/* View Mode Controls — Hidden below lg */}
        <div className="hidden lg:flex items-center gap-1">
          <button
            onClick={() => setScrollMode(scrollMode === ScrollMode.PAGED ? ScrollMode.CONTINUOUS : ScrollMode.PAGED)}
            className="btn-action"
            title={scrollMode === ScrollMode.PAGED ? "Défilement vertical" : "Mode page par page"}
          >
            {scrollMode === ScrollMode.PAGED ? <GalleryHorizontal size={18} /> : <GalleryVertical size={18} />}
          </button>

          <button
            onClick={() => setViewMode(viewMode === ViewMode.SINGLE ? ViewMode.DOUBLE : ViewMode.SINGLE)}
            className={`btn-action ${scrollMode === ScrollMode.CONTINUOUS ? 'opacity-30 cursor-not-allowed' : ''}`}
            disabled={scrollMode === ScrollMode.CONTINUOUS}
            title={viewMode === ViewMode.SINGLE ? "Vue deux pages" : "Vue une page"}
          >
            {viewMode === ViewMode.SINGLE ? <BookOpen size={18} /> : <FileText size={18} />}
          </button>
        </div>

        <ThemeSelector currentTheme={theme} setTheme={setTheme} />

        <button
          onClick={() => setThemeVariant(themeVariant === 'light' ? 'dark' : 'light')}
          className="btn-action"
          title={themeVariant === 'light' ? 'Mode sombre' : 'Mode clair'}
        >
          {themeVariant === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>

        {/* More Menu — visible below xl */}
        <div className="relative" ref={moreRef}>
          <button
            onClick={() => setIsMoreOpen(!isMoreOpen)}
            className={`btn-action xl:hidden ${isMoreOpen ? 'active' : ''}`}
            title="Plus d'outils"
          >
            <MoreHorizontal size={18} />
          </button>

          {isMoreOpen && (
            <div className={`absolute top-full right-0 mt-3 w-56 dropdown-premium z-50 p-1.5 flex flex-col gap-1 ${menuThemeClass}`}>
              <button
                onClick={() => { setScrollMode(scrollMode === ScrollMode.PAGED ? ScrollMode.CONTINUOUS : ScrollMode.PAGED); setIsMoreOpen(false); }}
                className="w-full text-left px-3 py-2 hover:bg-black/5 dark:hover:bg-white/5 transition flex items-center gap-3 rounded-lg text-sm"
              >
                {scrollMode === ScrollMode.PAGED ? <GalleryHorizontal size={16} /> : <GalleryVertical size={16} />}
                <span>{scrollMode === ScrollMode.PAGED ? "Défilement continu" : "Mode page par page"}</span>
              </button>

              <button
                disabled={scrollMode === ScrollMode.CONTINUOUS}
                onClick={() => { setViewMode(viewMode === ViewMode.SINGLE ? ViewMode.DOUBLE : ViewMode.SINGLE); setIsMoreOpen(false); }}
                className="w-full text-left px-3 py-2 hover:bg-black/5 dark:hover:bg-white/5 transition flex items-center gap-3 rounded-lg text-sm disabled:opacity-30"
              >
                {viewMode === ViewMode.SINGLE ? <BookOpen size={16} /> : <FileText size={16} />}
                <span>{viewMode === ViewMode.SINGLE ? "Vue deux pages" : "Vue une page"}</span>
              </button>

              <div className="h-px bg-current opacity-5 my-1 mx-2"></div>

              <button
                onClick={() => { toggleFullscreen(); setIsMoreOpen(false); }}
                className="w-full text-left px-3 py-2 hover:bg-black/5 dark:hover:bg-white/5 transition flex items-center gap-3 rounded-lg text-sm"
              >
                {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
                <span>{isFullscreen ? "Quitter le plein écran" : "Plein écran"}</span>
              </button>

              <button
                onClick={() => { toggleVisibility(); setIsMoreOpen(false); }}
                className="w-full text-left px-3 py-2 hover:bg-black/5 dark:hover:bg-white/5 transition flex items-center gap-3 rounded-lg text-sm"
              >
                <ChevronUp size={16} />
                <span>Masquer la barre</span>
              </button>
            </div>
          )}
        </div>

        {/* Visibility & Fullscreen — Hidden below xl for density */}
        <div className="hidden xl:flex items-center gap-1">
          <button
            onClick={toggleFullscreen}
            className="btn-action"
            title="Plein écran"
          >
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>

          <button
            onClick={toggleVisibility}
            className="btn-action opacity-40 hover:opacity-100"
            title="Masquer la barre"
          >
            <ChevronUp size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Toolbar;