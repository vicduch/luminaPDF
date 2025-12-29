import React, { useState, useRef, useEffect } from 'react';
import { AppTheme } from '../types';
import { Sun, Moon, Coffee, Monitor, Settings, Trees, Droplet, Feather, Check } from './Icons';

interface ThemeSelectorProps {
  currentTheme: AppTheme;
  setTheme: (theme: AppTheme) => void;
}

const ThemeSelector: React.FC<ThemeSelectorProps> = ({ currentTheme, setTheme }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    
    if (isOpen) {
        document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const themes = [
    { id: AppTheme.LIGHT, label: 'Clair', icon: <Sun size={16} /> },
    { id: AppTheme.SOLARIZED, label: 'Confort', icon: <Feather size={16} /> },
    { id: AppTheme.SEPIA, label: 'Sépia', icon: <Coffee size={16} /> },
    { id: AppTheme.FOREST, label: 'Forêt', icon: <Trees size={16} /> },
    { id: AppTheme.BLUE_NIGHT, label: 'Nuit Bleue', icon: <Droplet size={16} /> },
    { id: AppTheme.DARK, label: 'Sombre', icon: <Moon size={16} /> },
    { id: AppTheme.MIDNIGHT, label: 'OLED', icon: <Monitor size={16} /> },
  ];

  const handleSelect = (id: AppTheme) => {
      setTheme(id);
      setIsOpen(false);
  };

  const getMenuBackground = () => {
    switch (currentTheme) {
      case AppTheme.LIGHT: return 'bg-white border-gray-200 text-gray-800';
      case AppTheme.SOLARIZED: return 'bg-[#fdf6e3] border-[#eee8d5] text-[#586e75]';
      case AppTheme.SEPIA: return 'bg-[#fcf7e9] border-[#e0d6b5] text-[#5b4636]';
      case AppTheme.FOREST: return 'bg-[#1a2f23] border-[#2c4236] text-[#c1d1c8]';
      case AppTheme.BLUE_NIGHT: return 'bg-[#0f172a] border-[#1e293b] text-[#94a3b8]';
      case AppTheme.DARK: return 'bg-slate-900 border-gray-700 text-gray-200';
      case AppTheme.MIDNIGHT: return 'bg-black border-gray-800 text-gray-400';
      default: return 'bg-white border-gray-200 text-gray-800';
    }
  };

  const isLight = currentTheme === AppTheme.LIGHT || currentTheme === AppTheme.SEPIA || currentTheme === AppTheme.SOLARIZED;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
            p-2 rounded-md transition-colors flex items-center gap-2 text-sm font-medium
            ${isOpen ? 'bg-black/10 dark:bg-white/10' : 'hover:bg-black/5 dark:hover:bg-white/10'}
        `}
        title="Changer le thème"
      >
        <Settings size={18} />
        <span className="hidden sm:inline">Thème</span>
      </button>

      {isOpen && (
        <div className={`
            absolute right-0 mt-2 w-56 rounded-xl shadow-2xl border z-50 overflow-hidden py-1 animate-in fade-in zoom-in-95 duration-200 origin-top-right
            ${getMenuBackground()}
        `}>
          <div className="px-3 py-2 text-xs font-semibold opacity-60 uppercase tracking-wider">
            Apparence
          </div>
          {themes.map((theme) => {
            const isSelected = currentTheme === theme.id;
            return (
                <button
                key={theme.id}
                onClick={() => handleSelect(theme.id)}
                className={`
                    w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors
                    ${isSelected 
                        ? 'bg-blue-500/10 font-medium' 
                        : 'hover:bg-black/5 dark:hover:bg-white/10'
                    }
                `}
                >
                <span className={`${isSelected ? 'text-blue-500' : 'opacity-70'}`}>
                    {theme.icon}
                </span>
                <span className="flex-1">{theme.label}</span>
                {isSelected && <Check size={14} className="text-blue-500" />}
                </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ThemeSelector;