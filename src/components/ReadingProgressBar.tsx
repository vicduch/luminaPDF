/**
 * ReadingProgressBar.tsx - Visual reading progress indicator
 * 
 * Displays a thin progress bar showing the percentage of the document read.
 * Uses transform: scaleX() for smooth animations without layout recalculation.
 * Clicking on the bar navigates directly to the corresponding page.
 */

import React, { useCallback, useMemo } from 'react';
import { AppTheme } from '../types';
import { getThemePalette, isDarkTheme } from '../utils/ThemeManager';

interface ReadingProgressBarProps {
    pageNumber: number;
    numPages: number;
    theme: AppTheme;
    onNavigate: (page: number) => void;
}

const ReadingProgressBar: React.FC<ReadingProgressBarProps> = ({
    pageNumber,
    numPages,
    theme,
    onNavigate
}) => {
    // Calculate progress percentage
    const progress = useMemo(() => {
        if (numPages <= 0) return 0;
        return (pageNumber / numPages) * 100;
    }, [pageNumber, numPages]);

    // Get theme colors
    const palette = useMemo(() => getThemePalette(theme), [theme]);
    const dark = isDarkTheme(theme);

    // Handle click to navigate
    const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const percentage = clickX / rect.width;
        const targetPage = Math.max(1, Math.min(numPages, Math.round(percentage * numPages)));
        onNavigate(targetPage);
    }, [numPages, onNavigate]);

    // Don't render if no pages
    if (numPages <= 0) return null;

    return (
        <div
            className={`
                fixed top-0 left-0 right-0 h-1 z-50 cursor-pointer
                transition-theme
                ${dark ? 'bg-zinc-900' : 'bg-gray-200/50'}
            `}
            onClick={handleClick}
            title={`Page ${pageNumber} / ${numPages} (${Math.round(progress)}%)`}
            role="progressbar"
            aria-valuenow={pageNumber}
            aria-valuemin={1}
            aria-valuemax={numPages}
            aria-label="Progression de lecture"
        >
            {/* Progress fill - uses scaleX for performance */}
            <div
                className="h-full origin-left transition-transform duration-300 ease-out"
                style={{
                    transform: `scaleX(${progress / 100})`,
                    background: `linear-gradient(90deg, ${palette.accent}, ${palette.accentHover})`,
                }}
            />

            {/* Glow effect on hover */}
            <div
                className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-200"
                style={{
                    background: `linear-gradient(90deg, transparent, ${palette.accentMuted}, transparent)`,
                }}
            />
        </div>
    );
};

export default ReadingProgressBar;
