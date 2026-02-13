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
          transform transition-transform duration-500 cubic-bezier(0.16, 1, 0.3, 1) shadow-2xl flex flex-col glass-premium
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex items-center justify-between p-5 border-b border-[var(--lumina-border)] bg-black/5 dark:bg-white/5">
          <div className="flex flex-col">
            <h3 className="font-bold text-[var(--lumina-text)] tracking-tight">Sommaire</h3>
            <span className="text-[10px] uppercase tracking-widest opacity-40 font-bold mt-0.5">Structure</span>
          </div>
          <button
            onClick={onClose}
            className="btn-action !p-1.5"
          >
            <X size={18} />
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
