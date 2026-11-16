import React, { useEffect } from 'react';
import { Outline } from 'react-pdf';
import { X } from 'lucide-react';
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
      if (event.key === 'Escape' && !event.defaultPrevented && !document.querySelector('#reader-tools:not([hidden])')) {
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
      className="reader-outline fixed inset-y-0 left-0 z-40 flex flex-col"
      style={{
        backgroundColor: 'var(--lumina-toolbar-bg)',
        color: 'var(--lumina-text-primary)',
        borderRight: '1px solid var(--lumina-filet-fort)',
      }}
    >
      {/* En-tête éditorial sans bordure dure */}
      <div
        className="flex items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2 font-semibold text-xl" style={{ fontFamily: 'var(--font-display)' }}>
          <span>Table des matières</span>
        </div>
        <button
          type="button"
          onClick={close}
          className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] -mr-2 rounded-[2px] transition-colors"
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
