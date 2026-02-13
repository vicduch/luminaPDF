import React from 'react';
import { Outline } from 'react-pdf';
import { X } from 'lucide-react';

interface OutlinePanelProps {
  isOpen: boolean;
  onClose: () => void;
  onItemClick: ({ pageNumber }: { pageNumber: number }) => void;
  theme: any;
}

const OutlinePanel: React.FC<OutlinePanelProps> = ({ isOpen, onClose, onItemClick, theme }) => {
  return (
    <>
      {/* Backdrop overlay — visible only on mobile/tablet when panel is open */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-[99] md:hidden"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`
          fixed top-0 left-0 h-full z-[100]
          w-[85vw] max-w-sm md:w-80
          bg-[var(--lumina-bg-secondary)] border-r border-[var(--lumina-border)]
          transform transition-transform duration-300 ease-in-out shadow-2xl flex flex-col
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex items-center justify-between p-4 border-b border-[var(--lumina-border)]">
          <h3 className="font-semibold text-[var(--lumina-text)]">Table des matières</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 text-[var(--lumina-text-muted)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 custom-scrollbar">
          <Outline
            onItemClick={onItemClick}
            className="react-pdf__Outline"
          />
        </div>
      </div>
    </>
  );
};

export default OutlinePanel;
