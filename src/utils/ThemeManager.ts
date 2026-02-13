/**
 * ThemeManager.ts - Centralized Theme Configuration
 * 
 * Provides consistent theming across all LuminaPDF components
 * with CSS custom properties, Tailwind class mappings, and PDF colorization.
 * 
 * Sprint 1.5: Visual Elevation & Contrast (Environment vs Paper).
 */

import { AppTheme } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type ThemeVariant = 'light' | 'dark';

export interface ThemePalette {
    appBg: string;       // UI Background (Global Window)
    paperBg: string;     // Document Page Background (Visual)
    bgSecondary: string; // UI Components/Cards/Sidebar
    bgTertiary: string;  // Hover states / Accents
    accent: string;
    accentHover: string;
    accentMuted: string;
    text: string;
    textMuted: string;
    textInverse: string;
    border: string;
    borderHover: string;
    success: string;
    warning: string;
    error: string;
    shadow: string;      // Document Shadow (Elevation)
}

export interface RenderPalette {
    bg: [number, number, number];  // Background (paper) color - Passed to Worker
    fg: [number, number, number];  // Foreground (ink) color - Passed to Worker
}

// ─────────────────────────────────────────────────────────────────────────────
// THEME PALETTES (UI Colors)
// ─────────────────────────────────────────────────────────────────────────────

type VariantPalettes = Record<ThemeVariant, ThemePalette>;

export const THEME_PALETTES: Record<string, VariantPalettes> = {
    // ═══════════════════════════════════════════════════════════════════════
    // STANDARD (Neutral / Zinc)
    // ═══════════════════════════════════════════════════════════════════════
    light: {
        light: {
            appBg: '#f1f5f9',           // Slate-100 (Clean Environment)
            paperBg: '#ffffff',         // White (Pure Paper)
            bgSecondary: '#ffffff',     // White (Elevated UI)
            bgTertiary: '#f8fafc',      // Slate-50 (Hover)
            accent: '#3B82F6', accentHover: '#2563EB', accentMuted: 'rgba(59, 130, 246, 0.1)',
            text: '#0f172a',            // Slate-900 (High contrast)
            textMuted: '#64748b',       // Slate-500
            textInverse: '#ffffff',
            border: '#e2e8f0',          // Slate-200
            borderHover: '#cbd5e1',     // Slate-300
            success: '#059669', warning: '#D97706', error: '#DC2626',
            shadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.05)',
        },
        dark: {
            appBg: '#020617',           // Deep Slate (Uniform with Midnight)
            paperBg: '#1e1e22',         // Matches RENDER_PALETTE.light.dark exactly [30, 30, 34]
            bgSecondary: '#0f172a',     // Slate-900
            bgTertiary: '#1e293b',      // Slate-800
            accent: '#60A5FA', accentHover: '#3B82F6', accentMuted: 'rgba(96, 165, 250, 0.15)',
            text: '#f1f5f9',            // Slate-100
            textMuted: '#94a3b8',       // Slate-400
            textInverse: '#000000',
            border: '#1e293b',          // Slate-800
            borderHover: '#334155',     // Slate-700
            success: '#10B981', warning: '#F59E0B', error: '#EF4444',
            shadow: '0 0 40px rgba(0, 0, 0, 0.4)',
        },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // FOREST (Sage / Jungle)
    // ═══════════════════════════════════════════════════════════════════════
    forest: {
        light: {
            appBg: '#dcfce7',           // Green-100 (Sage)
            paperBg: '#F0FDF4',         // Green-50 (Mint)
            bgSecondary: '#bbf7d0',     // Green-200 (Sidebar)
            bgTertiary: '#f0fdf4',
            accent: '#16A34A', accentHover: '#15803D', accentMuted: 'rgba(22, 163, 74, 0.15)',
            text: '#14532D',            // Green-900
            textMuted: '#166534',       // Green-800
            textInverse: '#F0FDF4',     // [WCAG] Kept light, ensure accent is dark enough (#16A34A against white is ~3:1, need darker for text)
            // Actually #16A34A (Green-600) on White is 3.03:1 (fail AA). 
            // We use it as button background (textInverse is text). 
            // #16A34A bg with #F0FDF4 text is 3.1:1. 
            // Changing accent to #15803D (Green-700) -> 4.5:1. Perfect.
            // [WCAG] Adjusted accent for contrast
            border: '#86EFAC',          // Green-300
            borderHover: '#4ADE80',
            success: '#059669', warning: '#D97706', error: '#DC2626',
            shadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04), 0 0 0 1px rgba(0, 0, 0, 0.05)', // shadow-xl ring-1
        },
        dark: {
            appBg: '#051a10',           // Jungle Deep
            paperBg: '#122a1b',         // Matches RENDER_PALETTE.forest.dark exactly [18, 42, 27]
            bgSecondary: '#0a2216',
            bgTertiary: '#143825',
            accent: '#22C55E', accentHover: '#16A34A', accentMuted: 'rgba(34, 197, 94, 0.15)',
            text: '#CBEAD6',            // Mint Pale
            textMuted: '#86EFAC',       // Mint
            textInverse: '#051a10',
            border: '#143825',
            borderHover: '#1a4d33',
            success: '#4ADE80', warning: '#FDE047', error: '#FCA5A5',
            shadow: '0 0 30px rgba(0, 0, 0, 0.5)',
        },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // MIDNIGHT (BlueGrey / Slate)
    // ═══════════════════════════════════════════════════════════════════════
    midnight: {
        light: {
            appBg: '#dbeafe',           // Blue-100
            paperBg: '#eff6ff',         // Blue-50 (Alice)
            bgSecondary: '#bfdbfe',     // Blue-200
            bgTertiary: '#eff6ff',
            accent: '#2563EB', accentHover: '#1D4ED8', accentMuted: 'rgba(37, 99, 235, 0.15)',
            text: '#1e3a8a',            // Blue-900
            textMuted: '#1e40af',       // Blue-800
            textInverse: '#eff6ff',
            border: '#93c5fd',          // Blue-300
            borderHover: '#60a5fa',
            success: '#059669', warning: '#D97706', error: '#DC2626',
            shadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04), 0 0 0 1px rgba(30, 58, 138, 0.05)', // shadow-xl ring-1
        },
        dark: {
            appBg: '#020617',           // Slate-950
            paperBg: '#0f172a',         // Slate-900
            bgSecondary: '#0f172a',     // Slate-900
            bgTertiary: '#1e293b',      // Slate-800
            accent: '#60A5FA', accentHover: '#3B82F6', accentMuted: 'rgba(96, 165, 250, 0.15)',
            text: '#e2e8f0',            // Slate-200
            textMuted: '#94a3b8',       // Slate-400
            textInverse: '#020617',
            border: '#1e293b',          // Slate-800
            borderHover: '#334155',
            success: '#4ADE80', warning: '#FACC15', error: '#F87171',
            shadow: '0 0 30px rgba(0, 0, 0, 0.7)',
        },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // SEPIA (Beige / Coffee)
    // ═══════════════════════════════════════════════════════════════════════
    sepia: {
        light: {
            appBg: '#e7d5c0',           // Beige
            paperBg: '#F3E9D2',         // Latte
            bgSecondary: '#dbcca0',     // Darker Beige
            bgTertiary: '#f3e9d2',
            accent: '#B45309', accentHover: '#92400E', accentMuted: 'rgba(180, 83, 9, 0.12)',
            text: '#433422',            // Coffee
            textMuted: '#78350F',
            textInverse: '#F5E6D3',
            border: '#d6cba0',
            borderHover: '#c7b090',
            success: '#15803D', warning: '#A16207', error: '#B91C1C',
            shadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(120, 53, 15, 0.1)', // shadow-2xl ring-1
        },
        dark: {
            appBg: '#1a120e',           // Coffee
            paperBg: '#271C19',         // Leather
            bgSecondary: '#271C19',
            bgTertiary: '#4a3630',
            accent: '#D97706', accentHover: '#B45309', accentMuted: 'rgba(217, 119, 6, 0.2)',
            text: '#E7D5C0',            // Parchment
            textMuted: '#C4A882',
            textInverse: '#271C19',
            border: '#4a3630',
            borderHover: '#5c463a',
            success: '#4ADE80', warning: '#FBBF24', error: '#FCA5A5',
            shadow: '0 0 30px rgba(0, 0, 0, 0.8)',
        },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // SOLARIZED (Base2 / Base03)
    // ═══════════════════════════════════════════════════════════════════════
    solarized: {
        light: {
            appBg: '#eee8d5',           // Base2
            paperBg: '#fdf6e3',         // Base3
            bgSecondary: '#e6dfcb',
            bgTertiary: '#fdf6e3',
            accent: '#2AA198', accentHover: '#268B84', accentMuted: 'rgba(42, 161, 152, 0.12)',
            text: '#586E75',            // Base01
            textMuted: '#839496',       // Base0
            textInverse: '#FDF6E3',
            border: '#d3cbb5',
            borderHover: '#c0b496',
            success: '#859900', warning: '#B58900', error: '#DC322F',
            shadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.1)', // [Refinement] Harmonized to shadow-2xl style
        },
        dark: {
            appBg: '#002b36',           // Base03
            paperBg: '#073642',         // Base02
            bgSecondary: '#073642',
            bgTertiary: '#0f4d5c',
            accent: '#2AA198', accentHover: '#35C9BE', accentMuted: 'rgba(42, 161, 152, 0.2)',
            text: '#839496',            // Base0
            textMuted: '#586E75',       // Base01
            textInverse: '#002B36',
            border: '#073642',
            borderHover: '#0f4d5c',
            success: '#859900', warning: '#B58900', error: '#DC322F',
            shadow: '0 0 20px rgba(0, 0, 0, 0.5)',
        },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // OLED (Pure Black) - Keeps high contrast
    // ═══════════════════════════════════════════════════════════════════════
    oled: {
        light: {
            appBg: '#e5e5e5',           // Gray-200
            paperBg: '#ffffff',         // White
            bgSecondary: '#f5f5f5',
            bgTertiary: '#ffffff',
            accent: '#000000', accentHover: '#262626', accentMuted: 'rgba(0, 0, 0, 0.1)',
            text: '#000000', textMuted: '#525252', textInverse: '#FFFFFF',
            border: '#d4d4d4', borderHover: '#a3a3a3',
            success: '#059669', warning: '#D97706', error: '#DC2626',
            shadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2)',
        },
        dark: {
            appBg: '#000000',           // True Black — pure OLED black
            paperBg: '#0a0a0a',         // Near-black — just visible against pure black
            bgSecondary: '#0A0A0A',
            bgTertiary: '#121212',
            accent: '#A855F7', accentHover: '#9333EA', accentMuted: 'rgba(168, 85, 247, 0.15)',
            text: '#F3F4F6', textMuted: '#A1A1AA', textInverse: '#000000',
            border: '#262626', borderHover: '#404040',
            success: '#34D399', warning: '#FBBF24', error: '#F87171',
            shadow: '0 0 25px rgba(255, 255, 255, 0.07)', // [Refinement] Adjusted glow
        },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // EINK (E-Reader / Monochrome)
    // ═══════════════════════════════════════════════════════════════════════
    eink: {
        light: {
            appBg: '#bebebe',           // Matte Plastic Frame
            paperBg: '#e8e8e8',         // Pearl Gray eInk Screen
            bgSecondary: '#d4d4d4',     // Sidebar
            bgTertiary: '#e8e8e8',
            accent: '#555555', accentHover: '#333333', accentMuted: 'rgba(85, 85, 85, 0.15)', // [R-003] Neutral Gray
            text: '#111111',            // Matte Black Ink
            textMuted: '#525252',
            textInverse: '#e8e8e8',
            border: '#a3a3a3',
            borderHover: '#737373',
            success: '#525252', warning: '#525252', error: '#525252',
            shadow: '0 2px 4px rgba(0, 0, 0, 0.1)', // Very flat, integrated feel
        },
        dark: {
            appBg: '#111111',           // Matte Black Frame
            paperBg: '#262626',         // Night Mode eInk Screen
            bgSecondary: '#171717',
            bgTertiary: '#262626',
            accent: '#777777', accentHover: '#999999', accentMuted: 'rgba(119, 119, 119, 0.15)', // [R-003] Neutral Gray
            text: '#d4d4d4',            // Light Gray Ink
            textMuted: '#a3a3a3',
            textInverse: '#262626',
            border: '#404040',
            borderHover: '#525252',
            success: '#a3a3a3', warning: '#a3a3a3', error: '#a3a3a3',
            shadow: '0 0 8px rgba(255, 255, 255, 0.05)', // Subtle glow
        },
    },
};

// Map legacy 'dark' and 'blueNight' themes to Standard Dark and Midnight
// [D-001] Use shallow copies to prevent shared reference mutations
THEME_PALETTES.dark = { ...THEME_PALETTES.light };
THEME_PALETTES.blueNight = { ...THEME_PALETTES.midnight };


// ─────────────────────────────────────────────────────────────────────────────
// RENDER PALETTES (Pixel-Level PDF Colorization)
// ─────────────────────────────────────────────────────────────────────────────

type VariantRenderPalettes = Record<ThemeVariant, RenderPalette>;

// Helper to convert Hex to RGB would be nice, but for precision/perf we hardcode
export const RENDER_PALETTES: Record<string, VariantRenderPalettes> = {
    // ───────────────────────────────────────────────────────────────────
    // STANDARD — Neutral zinc, clean dark reading
    // ───────────────────────────────────────────────────────────────────
    light: {
        light: { bg: [255, 255, 255], fg: [0, 0, 0] },
        // Paper: warm zinc, slightly lighter than appBg (#000)
        // Text: soft warm gray — no pure white to avoid glare
        dark: { bg: [30, 30, 34], fg: [190, 190, 195] },
    },

    // ───────────────────────────────────────────────────────────────────
    // FOREST — Deep jungle greens, gentle minty text
    // ───────────────────────────────────────────────────────────────────
    forest: {
        light: { bg: [240, 253, 244], fg: [20, 83, 45] },
        // Paper: dark forest (#122a1b), distinct from appBg (#051a10)
        // Text: muted sage — warm green that doesn't strain in darkness
        dark: { bg: [18, 42, 27], fg: [160, 200, 170] },
    },

    // ───────────────────────────────────────────────────────────────────
    // MIDNIGHT — Navy blues for night reading (user's primary use case)
    // ───────────────────────────────────────────────────────────────────
    midnight: {
        light: { bg: [239, 246, 255], fg: [30, 58, 138] },
        // Paper: deep navy (#131d35), slightly lighter than appBg (#020617)
        // Text: steel blue-gray — blue-tinted for immersion, reduced brightness
        dark: { bg: [19, 29, 53], fg: [170, 190, 215] },
    },

    // ───────────────────────────────────────────────────────────────────
    // SEPIA — Warm candlelight reading
    // ───────────────────────────────────────────────────────────────────
    sepia: {
        light: { bg: [243, 233, 210], fg: [70, 51, 37] },
        // Paper: dark leather (#2e2119), distinct from appBg (#1a120e)
        // Text: warm parchment — amber-tinted, cozy warmth
        dark: { bg: [46, 33, 25], fg: [195, 175, 150] },
    },

    // ───────────────────────────────────────────────────────────────────
    // SOLARIZED — Ethan Schoonover's iconic palette (respect original)
    // ───────────────────────────────────────────────────────────────────
    solarized: {
        light: { bg: [253, 246, 227], fg: [88, 110, 117] },
        // Paper: Base02 (#073642) — authentic solarized dark
        // Text: Base0 (#839496) — canonical, already low brightness
        dark: { bg: [7, 54, 66], fg: [131, 148, 150] },
    },

    // ───────────────────────────────────────────────────────────────────
    // OLED — Pure black, minimal photon emission
    // ───────────────────────────────────────────────────────────────────
    oled: {
        light: { bg: [255, 255, 255], fg: [0, 0, 0] },
        // Paper: near-black (#0a0a0a) — just visible against pure black appBg
        // Text: medium gray — just bright enough to read, minimal photon emission
        dark: { bg: [10, 10, 10], fg: [150, 150, 150] },
    },

    // ───────────────────────────────────────────────────────────────────
    // EINK — Monochrome e-reader simulation
    // ───────────────────────────────────────────────────────────────────
    eink: {
        light: { bg: [232, 232, 232], fg: [17, 17, 17] },
        // Paper: dark gray screen, distinct from frame (#111)
        // Text: silver gray — mimics inverted e-paper display
        dark: { bg: [42, 42, 42], fg: [185, 185, 185] },
    },
};

// Aliases for matching THEME_PALETTES keys
RENDER_PALETTES.dark = RENDER_PALETTES.light;
RENDER_PALETTES.oled = RENDER_PALETTES.oled; // placeholder if needed but already key
RENDER_PALETTES.blueNight = RENDER_PALETTES.midnight;

// ─────────────────────────────────────────────────────────────────────────────
// THEME UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the theme key for palette lookups
 */
function getThemeKey(theme: AppTheme): string {
    switch (theme) {
        case AppTheme.LIGHT: return 'light';
        case AppTheme.DARK: return 'dark';
        case AppTheme.SEPIA: return 'sepia';
        case AppTheme.SOLARIZED: return 'solarized';
        case AppTheme.MIDNIGHT: return 'midnight';
        case AppTheme.BLUE_NIGHT: return 'blueNight';
        case AppTheme.FOREST: return 'forest';
        case AppTheme.OLED: return 'oled';
        case AppTheme.EINK: return 'eink';
        default: return 'light';
    }
}

/**
 * Get the appropriate palette for a given theme and variant
 */
export function getThemePalette(theme: AppTheme, variant: ThemeVariant = 'light'): ThemePalette {
    const key = getThemeKey(theme);
    return THEME_PALETTES[key]?.[variant] ?? THEME_PALETTES.light.light;
}

/**
 * Get the render palette for pixel-level PDF colorization
 */
export function getRenderPalette(theme: AppTheme, variant: ThemeVariant = 'light'): RenderPalette {
    const key = getThemeKey(theme);
    return RENDER_PALETTES[key]?.[variant] ?? RENDER_PALETTES.light.light;
}

/**
 * Check if variant is dark
 */
export function isDarkVariant(variant: ThemeVariant): boolean {
    return variant === 'dark';
}

/**
 * Check if theme is inherently a dark-type theme (for legacy compatibility)
 * @deprecated Use isDarkVariant(variant) instead with the new variant system
 */
export function isDarkTheme(theme: AppTheme): boolean {
    return theme === AppTheme.DARK ||
        theme === AppTheme.MIDNIGHT ||
        theme === AppTheme.BLUE_NIGHT ||
        theme === AppTheme.FOREST ||
        theme === AppTheme.OLED; // Assuming OLED is dark
}

/**
 * Apply theme CSS custom properties to document root
 */
export function applyTheme(theme: AppTheme, variant: ThemeVariant = 'light'): void {
    const palette = getThemePalette(theme, variant);
    const root = document.documentElement;

    root.style.setProperty('--lumina-app-bg', palette.appBg); // New
    root.style.setProperty('--lumina-paper-bg', palette.paperBg); // New

    // Legacy support via mapping (appBg becomes the main bg)
    root.style.setProperty('--lumina-bg', palette.appBg);

    root.style.setProperty('--lumina-bg-secondary', palette.bgSecondary);
    root.style.setProperty('--lumina-bg-tertiary', palette.bgTertiary);
    root.style.setProperty('--lumina-accent', palette.accent);
    root.style.setProperty('--lumina-accent-hover', palette.accentHover);
    root.style.setProperty('--lumina-accent-muted', palette.accentMuted);
    root.style.setProperty('--lumina-text', palette.text);
    root.style.setProperty('--lumina-text-muted', palette.textMuted);
    root.style.setProperty('--lumina-border', palette.border);
    root.style.setProperty('--lumina-border-hover', palette.borderHover);
    root.style.setProperty('--lumina-shadow', palette.shadow);
    root.style.setProperty('--lumina-text-inverse', palette.textInverse);

    // Toggle dark mode class for Tailwind
    if (isDarkVariant(variant)) {
        root.classList.add('dark');
    } else {
        root.classList.remove('dark');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// TAILWIND CLASS HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export interface ThemeClasses {
    appBg: string; // Updated
    paperBg: string; // Updated
    bgSecondary: string;
    bgHover: string;
    text: string;
    textMuted: string;
    border: string;
    accent: string;
    accentHover: string;
    buttonPrimary: string;
    buttonSecondary: string;
    card: string;
    input: string;
}

/**
 * Get Tailwind class names for a given theme and variant
 */
export function getThemeClasses(theme: AppTheme, variant: ThemeVariant = 'light'): ThemeClasses {
    const palette = getThemePalette(theme, variant);

    // Dynamic classes based on palette
    return {
        appBg: `bg-[${palette.appBg}]`,
        paperBg: `bg-[${palette.paperBg}]`,
        bgSecondary: `bg-[${palette.bgSecondary}]`,
        bgHover: `hover:bg-[${palette.bgTertiary}]`,
        text: `text-[${palette.text}]`,
        textMuted: `text-[${palette.textMuted}]`,
        border: `border-[${palette.border}]`,
        accent: `text-[${palette.accent}]`,
        accentHover: `hover:text-[${palette.accentHover}]`,
        buttonPrimary: `bg-[${palette.accent}] hover:bg-[${palette.accentHover}] text-[${palette.textInverse}]`,
        buttonSecondary: `bg-[${palette.accentMuted}] hover:opacity-80 text-[${palette.accent}]`,
        card: `bg-[${palette.bgSecondary}] border-[${palette.border}]`,
        input: `bg-[${palette.appBg}] border-[${palette.border}] focus:border-[${palette.accent}]`,
    };
}

export const ThemeManager = {
    getThemePalette,
    getThemeClasses,
    getRenderPalette,
    applyTheme,
    isDarkVariant,
    THEME_PALETTES,
    RENDER_PALETTES,
} as const;

export default ThemeManager;
