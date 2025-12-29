import React, { useState } from 'react';
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
  FolderOpen,
  MessageSquare
} from './Icons';
import { ToolbarProps, ViewMode, AppTheme, ScrollMode } from '../types';
import ThemeSelector from './ThemeSelector';

const Toolbar: React.FC<ToolbarProps> = ({
  file,
  numPages,
  pageNumber,
  scale,
  theme,
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
  setViewMode,
  setScrollMode,
  setAnnotationColor,
  toggleFullscreen,
  toggleOutline,
  toggleAnnotationMode,
  onFileChange,
  toggleAiPanel,
  toggleVisibility,
  onHome
}) => {

  const [isColorMenuOpen, setIsColorMenuOpen] = useState(false);

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
      case AppTheme.LIGHT: return 'bg-white border-gray-200';
      case AppTheme.SOLARIZED: return 'bg-[#fdf6e3] border-[#eee8d5]';
      case AppTheme.SEPIA: return 'bg-[#fcf7e9] border-[#e0d6b5]';
      case AppTheme.FOREST: return 'bg-[#1a2f23] border-[#2c4236]';
      case AppTheme.BLUE_NIGHT: return 'bg-[#0f172a] border-[#1e293b]';
      case AppTheme.DARK: return 'bg-slate-900 border-slate-700';
      case AppTheme.MIDNIGHT: return 'bg-black border-gray-800';
      default: return 'bg-white border-gray-200';
    }
  };

  const menuThemeClass = getMenuTheme();

  return (
    <div className={`
      h-16 border-b flex items-center justify-between px-3 md:px-4 transition-all duration-300 z-40 relative flex-shrink-0 shadow-sm
      ${theme === AppTheme.LIGHT ? 'bg-white border-gray-200 text-slate-700' : ''}
      ${theme === AppTheme.SOLARIZED ? 'bg-[#fdf6e3] border-[#eee8d5] text-[#586e75]' : ''}
      ${theme === AppTheme.SEPIA ? 'bg-[#f4ecd8] border-[#e0d6b5] text-[#5b4636]' : ''}
      ${theme === AppTheme.FOREST ? 'bg-[#1a2f23] border-[#2c4236] text-[#c1d1c8]' : ''}
      ${theme === AppTheme.BLUE_NIGHT ? 'bg-[#0f172a] border-[#1e293b] text-[#94a3b8]' : ''}
      ${theme === AppTheme.DARK ? 'bg-slate-900 border-slate-700 text-slate-200' : ''}
      ${theme === AppTheme.MIDNIGHT ? 'bg-black border-gray-800 text-gray-400' : ''}
    `}>
      {/* Left: File Loading & Outline */}
      <div className="flex items-center gap-1 sm:gap-2">
        {/* Home Button */}
        <button
          onClick={onHome}
          className="p-2 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition flex items-center gap-2"
          title="Accueil"
        >
          <FolderOpen size={20} />
        </button>

        {file && (
          <button
            onClick={toggleOutline}
            className={`p-2 rounded-md transition-all duration-300 ${isOutlineOpen ? 'bg-black/10 dark:bg-white/20' : 'hover:bg-black/5 dark:hover:bg-white/10'}`}
            title="Sommaire"
          >
            <List size={20} />
          </button>
        )}

        {/* Simplified Open Button - REMOVED since Home button covers it essentially, but kept for direct access if needed, OR merged. Let's start with replacing it or keeping it next to home */}
        <label className="cursor-pointer p-2 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition flex items-center gap-2" title="Ouvrir un fichier PDF">
          <input type="file" accept="application/pdf" onChange={onFileChange} className="hidden" />
          <FileText size={20} />
        </label>
      </div>

      {/* Center: Pagination & Zoom */}
      <div className="flex items-center gap-1 sm:gap-3 absolute left-1/2 transform -translate-x-1/2">
        <div className="flex items-center bg-black/5 dark:bg-white/5 rounded-lg p-1 shadow-inner">
          <button
            disabled={pageNumber <= 1 || scrollMode === ScrollMode.CONTINUOUS}
            onClick={() => setPageNumber(pageNumber - 1)}
            className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-mono w-16 sm:w-20 text-center select-none font-medium text-xs sm:text-sm">
            {numPages > 0 ? `${pageNumber} / ${numPages}` : '--'}
          </span>
          <button
            disabled={pageNumber >= numPages || scrollMode === ScrollMode.CONTINUOUS}
            onClick={() => setPageNumber(pageNumber + 1)}
            className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Zoom Controls - Completely hidden on Mobile, Desktop only */}
        <div className="hidden md:flex items-center gap-1">
          <button onClick={() => setScale(Math.max(0.5, scale - 0.1))} className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10" title="Zoom Arrière">
            <ZoomOut size={18} />
          </button>
          <span className="text-xs w-12 text-center font-medium">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(Math.min(3.0, scale + 0.1))} className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10" title="Zoom Avant">
            <ZoomIn size={18} />
          </button>
          {/* Fit Width button for Desktop */}
          <button onClick={onFitToWidth} className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10" title="Ajuster à l'écran">
            <Scan size={18} />
          </button>
        </div>
      </div>

      {/* Right: View Modes & Settings */}
      <div className="flex items-center gap-1 sm:gap-2">
        {/* Fit Width Button for Mobile (Visible only on mobile) */}
        <button
          onClick={onFitToWidth}
          className="md:hidden p-2 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition"
          title="Ajuster"
        >
          <Scan size={20} />
        </button>

        {/* Annotation Toggle Group */}
        <div
          className="relative flex items-center justify-center"
          onMouseEnter={() => isAnnotationMode && setIsColorMenuOpen(true)}
          onMouseLeave={() => setIsColorMenuOpen(false)}
        >
          <button
            onClick={toggleAnnotationMode}
            className={`
                    p-2 rounded-md transition-all duration-300 flex items-center justify-center relative
                    ${isAnnotationMode
                ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300 ring-1 ring-blue-200 dark:ring-blue-700 shadow-sm'
                : 'hover:bg-black/5 dark:hover:bg-white/10 opacity-70 hover:opacity-100'
              }
                `}
            title={isAnnotationMode ? "Désactiver les annotations" : "Activer les annotations"}
          >
            <MessageSquare size={18} />
            {isAnnotationMode && (
              <span
                className="absolute bottom-1 right-1 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-slate-900"
                style={{ backgroundColor: annotationColor }}
              />
            )}
          </button>

          {/* Color Menu Dropdown */}
          {isAnnotationMode && isColorMenuOpen && (
            // Invisible wrapper with padding to bridge the hover gap
            <div className="absolute top-full left-1/2 -translate-x-1/2 pt-3 z-50 animate-pop-in">
              <div className={`
                        p-2.5 rounded-xl shadow-xl border flex gap-3 relative
                        ${menuThemeClass}
                    `}>
                {/* Arrow */}
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
                    style={{
                      backgroundColor: color.value,
                    }}
                    title={color.label}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Gemini AI Trigger */}
        <button
          onClick={toggleAiPanel}
          className={`
            p-2 rounded-md transition-all duration-300 flex items-center gap-2
            hover:bg-black/5 dark:hover:bg-white/10
          `}
          title="Assistant IA"
        >
          <Sparkles size={20} />
        </button>

        <div className="h-6 w-px bg-current opacity-10 mx-1 hidden sm:block"></div>

        {/* Hidden on Mobile: Scroll Mode, View Mode, Fullscreen */}
        <button
          onClick={() => setScrollMode(scrollMode === ScrollMode.PAGED ? ScrollMode.CONTINUOUS : ScrollMode.PAGED)}
          className="p-2 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition hidden sm:block"
          title={scrollMode === ScrollMode.PAGED ? "Passer en défilement vertical" : "Passer en mode page par page"}
        >
          {scrollMode === ScrollMode.PAGED ? <GalleryHorizontal size={20} /> : <GalleryVertical size={20} />}
        </button>

        <button
          onClick={() => setViewMode(viewMode === ViewMode.SINGLE ? ViewMode.DOUBLE : ViewMode.SINGLE)}
          className={`p-2 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition hidden sm:block ${scrollMode === ScrollMode.CONTINUOUS ? 'opacity-50 cursor-not-allowed' : ''}`}
          disabled={scrollMode === ScrollMode.CONTINUOUS}
          title={viewMode === ViewMode.SINGLE ? "Vue deux pages" : "Vue une page"}
        >
          {viewMode === ViewMode.SINGLE ? <BookOpen size={20} /> : <FileText size={20} />}
        </button>

        <ThemeSelector currentTheme={theme} setTheme={setTheme} />

        <button
          onClick={toggleFullscreen}
          className="p-2 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition hidden sm:block"
          title="Plein écran"
        >
          {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
        </button>

        <button
          onClick={toggleVisibility}
          className="p-2 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition opacity-50 hover:opacity-100"
          title="Masquer la barre"
        >
          <ChevronUp size={20} />
        </button>
      </div>
    </div>
  );
};

export default Toolbar;