import React, { useEffect } from 'react';
import { Outline } from 'react-pdf';
import { X, BookOpen } from 'lucide-react';
import { AppTheme } from '../types';

interface OutlinePanelProps {
  isOpen: boolean;
  onClose: () => void;
  onItemClick: ({ pageNumber }: { pageNumber: number }) => void;
  theme?: AppTheme;
}

const OutlinePanel: React.FC<OutlinePanelProps> = ({ isOpen, onClose, onItemClick }) => {
  const close = () => {
    onClose();
    document.querySelector<HTMLButtonElement>('button[aria-controls="reader-outline"]')?.focus();
  };
  useEffect(() => {
    if (!isOpen) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !document.getElementById('reader-tools')) {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [isOpen, onClose]);

  return (
    <aside
      id="reader-outline"
      hidden={!isOpen}
      aria-label="Table des matières"
      className={`fixed top-14 left-3 z-40 w-80 max-w-[calc(100vw-24px)] max-h-[calc(100vh-128px)] flex flex-col rounded-2xl transition-all duration-200 ease-out transform ${isOpen ? 'translate-x-0 opacity-100' : '-translate-x-6 opacity-0 pointer-events-none'}`}
      style={{
        backgroundColor: 'var(--lumina-outline-bg)',
        color: 'var(--lumina-text-primary)',
        boxShadow: 'var(--lumina-shadow)',
      }}
    >
      {/* En-tête éditorial sans bordure dure */}
      <div
        className="flex items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2 font-medium text-sm" style={{ fontFamily: 'var(--font-display)' }}>
          <BookOpen className="w-4 h-4" style={{ color: 'var(--lumina-accent)' }} />
          <span>Table des matières</span>
        </div>
        <button
          type="button"
          onClick={close}
          className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] -mr-2 rounded-full transition-colors"
          style={{ color: 'var(--lumina-text-secondary)' }}
          aria-label="Fermer la table des matières"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Contenu */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 custom-outline-container">
        <Outline
          onItemClick={onItemClick}
          className="text-sm space-y-1"
          onLoadError={(error) => console.warn('Outline load error:', error)}
        />
        <div className="hidden only:flex flex-col items-center justify-center h-40 text-center p-4" style={{ color: 'var(--lumina-text-secondary)' }}>
          <p className="text-xs">Aucune table des matières disponible pour ce document.</p>
        </div>
      </div>
    </aside>
  );
};

export default OutlinePanel;
