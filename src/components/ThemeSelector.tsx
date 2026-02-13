import React, { useState, useRef, useEffect } from 'react';
import { AppTheme } from '../types';
import { Sun, Moon, Coffee, Monitor, Settings, Trees, Droplet, Feather, Check, Tablet } from './Icons';

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
    { id: AppTheme.MIDNIGHT, label: 'Minuit', icon: <Droplet size={16} /> },
    { id: AppTheme.DARK, label: 'Sombre', icon: <Moon size={16} /> },
    { id: AppTheme.OLED, label: 'OLED', icon: <Monitor size={16} /> },
    { id: AppTheme.EINK, label: 'eInk', icon: <Tablet size={16} /> },
  ];

  const handleSelect = (id: AppTheme) => {
    setTheme(id);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
            p-2 rounded-md transition-colors flex items-center gap-2 text-sm font-medium
            ${isOpen ? 'bg-[var(--lumina-bg-tertiary)]' : 'hover:bg-[var(--lumina-bg-tertiary)]'}
        `}
        title="Changer le thème (T)"
      >
        <Settings size={18} />
        <span className="hidden sm:inline">Thème</span>
      </button>

      {isOpen && (
        <div className={`
            absolute right-0 mt-2 w-56 z-50 overflow-hidden py-1 origin-top-right dropdown-premium text-[var(--lumina-text)]
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
                    ? 'bg-[var(--lumina-accent-muted)] font-medium'
                    : 'hover:bg-[var(--lumina-bg-tertiary)] opacity-80 hover:opacity-100'
                  }
                `}
              >
                <span className={`${isSelected ? 'text-[var(--lumina-accent)]' : 'opacity-70'}`}>
                  {theme.icon}
                </span>
                <span className="flex-1">{theme.label}</span>
                {isSelected && <Check size={14} className="text-[var(--lumina-accent)]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ThemeSelector;