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
  Clock
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
  const recentsRef = useRef<HTMLDivElement>(null);

  // Close recents dropdown on outside click
  useEffect(() => {
    if (!isRecentsOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (recentsRef.current && !recentsRef.current.contains(e.target as Node)) {
        setIsRecentsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isRecentsOpen]);

  if (!isVisible) return null;

  const COLORS = [
    { label: 'Jaune', value: '#facc15' },
    { label: 'Vert', value: '#4ade80' },
    { label: 'Bleu', value: '#60a5fa' },
    { label: 'Rouge', value: '#f87171' },
    { label: 'Violet', value: '#c084fc' },
  ];

  const getMenuTheme = () => {
    switch (theme) {
      case AppTheme.LIGHT: return 'bg-[#F8FAFC] border-gray-200';
      case AppTheme.SEPIA: return 'bg-[#FDF6E3] border-[#E8D5B5]';
      case AppTheme.SOLARIZED: return 'bg-[#FDF6E3] border-[#D9CDB4]';
      case AppTheme.DARK: return 'bg-[#111111] border-zinc-800';
      case AppTheme.MIDNIGHT: return 'bg-[#1E293B] border-[#334155]';
      case AppTheme.OLED: return 'bg-black border-zinc-900';
      case AppTheme.FOREST: return 'bg-[#14532D] border-[#166534]';
      case AppTheme.EINK: return 'bg-[#d4d4d4] border-[#a3a3a3]';
      default: return 'bg-white border-gray-200';
    }
  };

  const menuThemeClass = getMenuTheme();

  // Get toolbar background/text colors based on theme
  const getToolbarClasses = () => {
    switch (theme) {
      case AppTheme.LIGHT: return 'bg-[#F8FAFC] border-gray-200 text-slate-700';
      case AppTheme.SEPIA: return 'bg-[#FDF6E3] border-[#E8D5B5] text-[#5C4827]';
      case AppTheme.SOLARIZED: return 'bg-[#FDF6E3] border-[#D9CDB4] text-[#657B83]';
      case AppTheme.DARK: return 'bg-[#0A0A0A] border-zinc-800 text-gray-200';
      case AppTheme.MIDNIGHT: return 'bg-[#0F172A] border-[#334155] text-[#E2E8F0]';
      case AppTheme.OLED: return 'bg-black border-zinc-900 text-gray-300';
      case AppTheme.FOREST: return 'bg-[#052E16] border-[#166534] text-[#DCFCE7]';
      case AppTheme.EINK: return 'bg-[#bebebe] border-[#a3a3a3] text-[#111111]';
      default: return 'bg-white border-gray-200 text-slate-700';
    }
  };

  return (
    <div className={`
      h-12 md:h-14 border-b flex items-center justify-between px-2 md:px-4 transition-theme z-40 relative flex-shrink-0 shadow-sm
      ${getToolbarClasses()}
    `}>
      {/* Left: File Loading & Outline */}
      <div className="flex items-center gap-0.5 md:gap-1.5 flex-shrink-0">
        <button
          onClick={onHome}
          className="btn-premium p-1.5 md:p-2 rounded-lg hover:bg-violet-500/10 dark:hover:bg-violet-500/20 transition"
          title="Accueil"
        >
          <Home size={18} />
        </button>

        {file && (
          <button
            onClick={toggleOutline}
            className={`p-1.5 md:p-2 rounded-md transition-all duration-300 ${isOutlineOpen ? 'bg-black/10 dark:bg-white/20' : 'hover:bg-black/5 dark:hover:bg-white/10'}`}
            title="Sommaire"
          >
            <List size={18} />
          </button>
        )}

        <label className="cursor-pointer p-1.5 md:p-2 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition" title="Ouvrir un fichier PDF">
          <input type="file" accept="application/pdf" onChange={onFileChange} className="hidden" />
          <FolderSearch size={18} />
        </label>

        {/* Recent Files Dropdown */}
        {recentFiles.length > 0 && (
          <div className="relative" ref={recentsRef}>
            <button
              onClick={() => setIsRecentsOpen(!isRecentsOpen)}
              className={`p-1.5 md:p-2 rounded-md transition-all duration-300 ${isRecentsOpen ? 'bg-black/10 dark:bg-white/20' : 'hover:bg-black/5 dark:hover:bg-white/10'}`}
              title="Fichiers récents"
            >
              <Clock size={18} />
            </button>

            {isRecentsOpen && (
              <div className={`
                absolute top-full left-0 mt-2 w-64 md:w-72 rounded-xl shadow-2xl border z-50 overflow-hidden
                ${getMenuTheme()}
              `}>
                <div className="px-3 py-2 border-b border-black/10 dark:border-white/10">
                  <span className="text-xs font-semibold uppercase tracking-wider opacity-60">Récents</span>
                </div>
                {recentFiles.slice(0, 5).map((f) => {
                  const ago = getRelativeTime(f.lastVisited);
                  return (
                    <button
                      key={f.id}
                      onClick={() => {
                        onOpenRecentFile?.(f.id);
                        setIsRecentsOpen(false);
                      }}
                      className="w-full text-left px-3 py-2.5 hover:bg-black/5 dark:hover:bg-white/10 transition flex items-center gap-3 group"
                    >
                      <FileText size={16} className="shrink-0 opacity-50 group-hover:opacity-100 transition" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{f.name}</p>
                        <p className="text-xs opacity-50">{ago}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Center: Pagination & Zoom — flexbox based, no absolute positioning */}
      <div className="flex-1 flex items-center justify-center gap-1 md:gap-2 min-w-0 mx-1">
        <div className="flex items-center bg-black/5 dark:bg-white/5 rounded-lg p-0.5 md:p-1 shadow-inner">
          <button
            disabled={pageNumber <= 1 || scrollMode === ScrollMode.CONTINUOUS}
            onClick={() => setPageNumber(pageNumber - 1)}
            className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs md:text-sm font-mono w-14 md:w-20 text-center select-none font-medium">
            {numPages > 0 ? `${pageNumber} / ${numPages}` : '--'}
          </span>
          <button
            disabled={pageNumber >= numPages || scrollMode === ScrollMode.CONTINUOUS}
            onClick={() => setPageNumber(pageNumber + 1)}
            className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Zoom Controls — hidden below md */}
        <div className="hidden md:flex items-center gap-1">
          <button onClick={() => setScale(Math.max(0.1, scale / 1.25))} className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10" title="Zoom Arrière">
            <ZoomOut size={18} />
          </button>
          <span className="text-xs w-12 text-center font-medium">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(Math.min(8.0, scale * 1.25))} className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10" title="Zoom Avant">
            <ZoomIn size={18} />
          </button>
          <button onClick={onFitToWidth} className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10" title="Ajuster à l'écran">
            <Scan size={18} />
          </button>
        </div>
      </div>

      {/* Right: View Modes & Settings */}
      <div className="flex items-center gap-0.5 md:gap-1.5 flex-shrink-0">
        {/* Fit Width — mobile only */}
        <button
          onClick={onFitToWidth}
          className="md:hidden p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition"
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
            className={`
              p-1.5 md:p-2 rounded-md transition-all duration-300 flex items-center justify-center relative
              ${isAnnotationMode
                ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300 ring-1 ring-blue-200 dark:ring-blue-700 shadow-sm'
                : 'hover:bg-black/5 dark:hover:bg-white/10 opacity-70 hover:opacity-100'
              }
            `}
            title={isAnnotationMode ? "Désactiver les annotations" : "Activer les annotations"}
          >
            <MessageSquare size={16} />
            {isAnnotationMode && (
              <span
                className="absolute bottom-0.5 right-0.5 w-2 h-2 rounded-full ring-2 ring-white dark:ring-slate-900"
                style={{ backgroundColor: annotationColor }}
              />
            )}
          </button>

          {/* Color Menu Dropdown */}
          {isAnnotationMode && isColorMenuOpen && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 pt-3 z-50 animate-pop-in">
              <div className={`
                p-2.5 rounded-xl shadow-xl border flex gap-3 relative
                ${menuThemeClass}
              `}>
                <div className={`
                  absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 border-l border-t transform rotate-45
                  ${menuThemeClass}
                `} />
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
          className="btn-premium btn-premium-glow p-1.5 md:p-2 rounded-lg transition-all duration-300 hover:bg-violet-500/10 dark:hover:bg-violet-500/20 hover:text-violet-500"
          title="Assistant IA"
        >
          <Sparkles size={18} />
        </button>

        <div className="h-5 w-px bg-current opacity-10 mx-0.5 hidden md:block"></div>

        {/* Hidden below md: Scroll Mode, View Mode, Fullscreen */}
        <button
          onClick={() => setScrollMode(scrollMode === ScrollMode.PAGED ? ScrollMode.CONTINUOUS : ScrollMode.PAGED)}
          className="p-1.5 md:p-2 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition hidden md:block"
          title={scrollMode === ScrollMode.PAGED ? "Défilement vertical" : "Mode page par page"}
        >
          {scrollMode === ScrollMode.PAGED ? <GalleryHorizontal size={18} /> : <GalleryVertical size={18} />}
        </button>

        <button
          onClick={() => setViewMode(viewMode === ViewMode.SINGLE ? ViewMode.DOUBLE : ViewMode.SINGLE)}
          className={`p-1.5 md:p-2 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition hidden md:block ${scrollMode === ScrollMode.CONTINUOUS ? 'opacity-50 cursor-not-allowed' : ''}`}
          disabled={scrollMode === ScrollMode.CONTINUOUS}
          title={viewMode === ViewMode.SINGLE ? "Vue deux pages" : "Vue une page"}
        >
          {viewMode === ViewMode.SINGLE ? <BookOpen size={18} /> : <FileText size={18} />}
        </button>

        <ThemeSelector currentTheme={theme} setTheme={setTheme} />

        <button
          onClick={() => setThemeVariant(themeVariant === 'light' ? 'dark' : 'light')}
          className="p-1.5 md:p-2 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition"
          title={themeVariant === 'light' ? 'Mode sombre' : 'Mode clair'}
        >
          {themeVariant === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>

        <button
          onClick={toggleFullscreen}
          className="p-1.5 md:p-2 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition hidden md:block"
          title="Plein écran"
        >
          {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
        </button>

        <button
          onClick={toggleVisibility}
          className="p-1.5 md:p-2 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition opacity-50 hover:opacity-100"
          title="Masquer la barre"
        >
          <ChevronUp size={18} />
        </button>
      </div>
    </div>
  );
};

export default Toolbar;