import React from 'react';

interface ReadingProgressBarProps {
  currentPage: number;
  numPages: number;
  onNavigate: (page: number) => void;
}

const ReadingProgressBar: React.FC<ReadingProgressBarProps> = ({ currentPage, numPages, onNavigate }) => {
  if (numPages <= 0) return null;
  const progress = numPages > 1 ? ((currentPage - 1) / (numPages - 1)) * 100 : 100;

  return (
    <input
      type="range"
      min={1}
      max={numPages}
      step={1}
      value={currentPage}
      aria-label="Progression de lecture"
      aria-valuetext={`Page ${currentPage} sur ${numPages}`}
      onChange={(event) => onNavigate(Number(event.target.value))}
      className="dock-progress-input"
      style={{ '--reader-progress': `${progress}%` } as React.CSSProperties}
    />
  );
};

export default ReadingProgressBar;
