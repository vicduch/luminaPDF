import { AppTheme } from '../types';

export type ThemeVariant = 'light' | 'dark';

export interface ThemePalette {
  appBg: string;
  paperBg: string;
  paperFg: string;
  toolbarBg: string;
  toolbarGlassBg: string;
  toolbarBorder: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  accentFg: string;
  hoverBg: string;
  activeBg: string;
  shadow: string;
  scrollbarThumb: string;
  scrollbarTrack: string;
  outlineBg: string;
  outlineHover: string;
  filet: string;
  filetFort: string;
}

export interface ThemeSwatchMeta {
  id: AppTheme;
  name: string;
  note: string;
  jour: { paperBg: string; paperFg: string };
  nuit: { paperBg: string; paperFg: string };
}

// Source locale unique : palettes de la maquette approuvée, y compris les filets forts.
const APPROVED_PALETTES = {
  light: {
    id: 'light',
    nom: 'Clair',
    note: 'Le PDF tel quel le jour ; gris neutre doux la nuit.',
    jour: {
      desk: '#ECE9E3',
      surface: '#FAF9F6',
      page: '#FFFFFF',
      ink: '#000000',
      text: '#1F1D1A',
      muted: '#5B554B',
      accent: '#23408E',
      filet: '#D8D3C8',
      filetFort: '#8C8576',
    },
    nuit: {
      desk: '#121212',
      surface: '#1A1A1A',
      page: '#1E1E1E',
      ink: '#DCDCDC',
      text: '#E6E3DE',
      muted: '#A5A09A',
      accent: '#9DB4F0',
      filet: '#333333',
      filetFort: '#6E6A64',
    },
  },
  solarized: {
    id: 'solarized',
    nom: 'Confort',
    note: 'Le papier chaud de OneLearn, et son « papier de nuit ».',
    jour: {
      desk: '#EFE8DA',
      surface: '#FBF8F2',
      page: '#FBF8F2',
      ink: '#1F1D1A',
      text: '#1F1D1A',
      muted: '#5B554B',
      accent: '#23408E',
      filet: '#D8D1C3',
      filetFort: '#8C8576',
    },
    nuit: {
      desk: '#141210',
      surface: '#1C1A17',
      page: '#1C1A17',
      ink: '#E6DFD3',
      text: '#E6DFD3',
      muted: '#A8A092',
      accent: '#9DB4F0',
      filet: '#3A362F',
      filetFort: '#7C7567',
    },
  },
  sepia: {
    id: 'sepia',
    nom: 'Sépia',
    note: 'Papier ancien, encre brune ; cuir sombre la nuit.',
    jour: {
      desk: '#E6D8BF',
      surface: '#F3E9D5',
      page: '#F4EAD5',
      ink: '#3A2C1E',
      text: '#3A2C1E',
      muted: '#6B5640',
      accent: '#7A3B12',
      filet: '#D4C3A3',
      filetFort: '#8E7A5C',
    },
    nuit: {
      desk: '#17110C',
      surface: '#211912',
      page: '#241B14',
      ink: '#E2D2B8',
      text: '#E2D2B8',
      muted: '#B09A80',
      accent: '#E0A878',
      filet: '#3E3226',
      filetFort: '#7A6650',
    },
  },
  forest: {
    id: 'forest',
    nom: 'Forêt',
    note: 'Sauge pâle et encre vert sapin ; sous-bois la nuit.',
    jour: {
      desk: '#DFE6D8',
      surface: '#F0F3EB',
      page: '#F2F5EE',
      ink: '#17271C',
      text: '#17271C',
      muted: '#4D5E50',
      accent: '#1F5C3B',
      filet: '#C5D0BC',
      filetFort: '#7E8C79',
    },
    nuit: {
      desk: '#0F1712',
      surface: '#152019',
      page: '#17231B',
      ink: '#CBDCCD',
      text: '#CBDCCD',
      muted: '#93A795',
      accent: '#7FC79B',
      filet: '#2A3A2F',
      filetFort: '#5D7062',
    },
  },
  midnight: {
    id: 'midnight',
    nom: 'Minuit',
    note: 'Gris-bleu ardoise, calme et froid.',
    jour: {
      desk: '#DFE4EA',
      surface: '#F2F4F7',
      page: '#F4F6F9',
      ink: '#18202C',
      text: '#18202C',
      muted: '#4F5A6A',
      accent: '#23408E',
      filet: '#C8D0DA',
      filetFort: '#7D8796',
    },
    nuit: {
      desk: '#0F141B',
      surface: '#161C25',
      page: '#18202A',
      ink: '#D0D8E2',
      text: '#D0D8E2',
      muted: '#8E9AAB',
      accent: '#9DB4F0',
      filet: '#2A3442',
      filetFort: '#5A6678',
    },
  },
  dark: {
    id: 'dark',
    nom: 'Sombre',
    note: 'Graphite à faible éblouissement, le jour comme la nuit.',
    jour: {
      desk: '#D6D4CF',
      surface: '#E6E4DF',
      page: '#E9E7E2',
      ink: '#161616',
      text: '#161616',
      muted: '#4A4844',
      accent: '#23408E',
      filet: '#C2BFB8',
      filetFort: '#7F7C76',
    },
    nuit: {
      desk: '#0B0B0B',
      surface: '#141414',
      page: '#141414',
      ink: '#BEBEBE',
      text: '#C8C8C8',
      muted: '#8A8A8A',
      accent: '#8FA6E0',
      filet: '#2A2A2A',
      filetFort: '#555555',
    },
  },
  blue_night: {
    id: 'blue_night',
    nom: 'Bleu nuit',
    note: 'Indigo profond, encre bleutée.',
    jour: {
      desk: '#E2E3F1',
      surface: '#F3F3FA',
      page: '#F5F5FB',
      ink: '#1A1D3A',
      text: '#1A1D3A',
      muted: '#4E5275',
      accent: '#2E3A9E',
      filet: '#CDCFE6',
      filetFort: '#7E82A6',
    },
    nuit: {
      desk: '#0A0F24',
      surface: '#10162F',
      page: '#111834',
      ink: '#C9D1F0',
      text: '#C9D1F0',
      muted: '#8B93BE',
      accent: '#A9B8F5',
      filet: '#252E55',
      filetFort: '#4F5A8A',
    },
  },
  oled: {
    id: 'oled',
    nom: 'OLED',
    note: 'Contraste maximal le jour ; noir absolu la nuit.',
    jour: {
      desk: '#FFFFFF',
      surface: '#FFFFFF',
      page: '#FFFFFF',
      ink: '#000000',
      text: '#000000',
      muted: '#3D3D3D',
      accent: '#1A2F80',
      filet: '#000000',
      filetFort: '#000000',
    },
    nuit: {
      desk: '#000000',
      surface: '#000000',
      page: '#000000',
      ink: '#D0D0D0',
      text: '#D8D8D8',
      muted: '#9A9A9A',
      accent: '#9DB4F0',
      filet: '#2E2E2E',
      filetFort: '#5A5A5A',
    },
  },
  eink: {
    id: 'eink',
    nom: 'eInk',
    note: 'Liseuse en niveaux de gris, images comprises.',
    jour: {
      desk: '#D9D9D6',
      surface: '#ECECE9',
      page: '#EDEDEA',
      ink: '#121212',
      text: '#121212',
      muted: '#4A4A4A',
      accent: '#121212',
      filet: '#BDBDB9',
      filetFort: '#6E6E6B',
    },
    nuit: {
      desk: '#1A1A1A',
      surface: '#262626',
      page: '#2A2A2A',
      ink: '#E0E0E0',
      text: '#E0E0E0',
      muted: '#A0A0A0',
      accent: '#E0E0E0',
      filet: '#3D3D3D',
      filetFort: '#6A6A6A',
    },
  },
} as const;

const themeIds = [AppTheme.LIGHT, AppTheme.SOLARIZED, AppTheme.SEPIA, AppTheme.FOREST,
  AppTheme.MIDNIGHT, AppTheme.DARK, AppTheme.BLUE_NIGHT, AppTheme.OLED, AppTheme.EINK];
const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16),
];

export const THEME_PALETTES = Object.fromEntries(themeIds.map(id => {
  const entry = APPROVED_PALETTES[id];
  return [id, Object.fromEntries((['light', 'dark'] as const).map(variant => {
    const p = variant === 'light' ? entry.jour : entry.nuit;
    return [variant, {
      appBg: p.desk, paperBg: p.page, paperFg: p.ink,
      toolbarBg: p.surface, toolbarGlassBg: `rgba(${rgb(p.surface).join(', ')}, 0.9)`, toolbarBorder: p.filet,
      textPrimary: p.text, textSecondary: p.muted, accent: p.accent,
      // Papier clair sur accent sombre ; bureau sombre sur accent clair.
      accentFg: variant === 'light' ? p.surface : p.desk,
      hoverBg: `color-mix(in srgb, ${p.text} 6%, ${p.surface})`,
      activeBg: `color-mix(in srgb, ${p.accent} 12%, ${p.surface})`,
      shadow: id === AppTheme.EINK ? 'none' : '0 12px 32px rgba(0, 0, 0, 0.16)',
      scrollbarThumb: p.filetFort, scrollbarTrack: p.desk,
      outlineBg: p.surface,
      outlineHover: `color-mix(in srgb, ${p.text} 6%, ${p.surface})`,
      filet: p.filet, filetFort: p.filetFort,
    }];
  }))];
})) as Record<AppTheme, Record<ThemeVariant, ThemePalette>>;

export const THEME_LIST: ThemeSwatchMeta[] = themeIds.map(id => ({
  id, name: APPROVED_PALETTES[id].nom, note: APPROVED_PALETTES[id].note,
  jour: { paperBg: THEME_PALETTES[id].light.paperBg, paperFg: THEME_PALETTES[id].light.paperFg },
  nuit: { paperBg: THEME_PALETTES[id].dark.paperBg, paperFg: THEME_PALETTES[id].dark.paperFg },
}));

export const RENDER_PALETTES = Object.fromEntries(themeIds.map(id => [id,
  Object.fromEntries((['light', 'dark'] as const).map(variant => [variant, {
    bg: rgb(THEME_PALETTES[id][variant].paperBg), fg: rgb(THEME_PALETTES[id][variant].paperFg),
  }])),
])) as Record<AppTheme, Record<ThemeVariant, { bg: [number, number, number]; fg: [number, number, number] }>>;

export function getThemePalette(theme: AppTheme, variant: ThemeVariant): ThemePalette {
  const themeEntry = THEME_PALETTES[theme] || THEME_PALETTES[AppTheme.LIGHT];
  return themeEntry[variant] || themeEntry.light;
}

export function getRenderPalette(theme: AppTheme, variant: ThemeVariant) {
  const themeEntry = RENDER_PALETTES[theme] || RENDER_PALETTES[AppTheme.LIGHT];
  return themeEntry[variant] || themeEntry.light;
}

export function isDarkVariant(variant: ThemeVariant): boolean {
  return variant === 'dark';
}

export function isDarkTheme(theme: AppTheme): boolean {
  return (
    theme === AppTheme.DARK ||
    theme === AppTheme.MIDNIGHT ||
    theme === AppTheme.BLUE_NIGHT ||
    theme === AppTheme.FOREST ||
    theme === AppTheme.OLED
  );
}

export function applyTheme(theme: AppTheme, variant: ThemeVariant = 'light') {
  const palette = getThemePalette(theme, variant);
  const root = document.documentElement;

  root.style.setProperty('--lumina-app-bg', palette.appBg);
  root.style.setProperty('--lumina-paper-bg', palette.paperBg);
  root.style.setProperty('--lumina-paper-fg', palette.paperFg);
  root.style.setProperty('--lumina-toolbar-bg', palette.toolbarBg);
  root.style.setProperty('--lumina-toolbar-glass-bg', palette.toolbarGlassBg);
  root.style.setProperty('--lumina-toolbar-border', palette.toolbarBorder);
  root.style.setProperty('--lumina-text-primary', palette.textPrimary);
  root.style.setProperty('--lumina-text-secondary', palette.textSecondary);
  root.style.setProperty('--lumina-accent', palette.accent);
  root.style.setProperty('--lumina-accent-fg', palette.accentFg);
  root.style.setProperty('--lumina-hover-bg', palette.hoverBg);
  root.style.setProperty('--lumina-active-bg', palette.activeBg);
  root.style.setProperty('--lumina-shadow', palette.shadow);
  root.style.setProperty('--lumina-scrollbar-thumb', palette.scrollbarThumb);
  root.style.setProperty('--lumina-scrollbar-track', palette.scrollbarTrack);
  root.style.setProperty('--lumina-outline-bg', palette.outlineBg);
  root.style.setProperty('--lumina-outline-hover', palette.outlineHover);
  root.style.setProperty('--lumina-filet', palette.filet);
  root.style.setProperty('--lumina-filet-fort', palette.filetFort);

  // Alias historiques utilisés par AiPanel / App
  root.style.setProperty('--lumina-bg', palette.appBg);
  root.style.setProperty('--lumina-bg-secondary', palette.toolbarBg);
  root.style.setProperty('--lumina-bg-tertiary', palette.hoverBg);
  root.style.setProperty('--lumina-text', palette.textPrimary);
  root.style.setProperty('--lumina-text-muted', palette.textSecondary);
  root.style.setProperty('--lumina-border', palette.filet);
  root.style.setProperty('--lumina-border-hover', palette.filetFort);
  root.style.setProperty('--lumina-accent-hover', palette.accent);
  root.style.setProperty('--lumina-accent-muted', palette.activeBg);
  root.style.setProperty('--lumina-text-inverse', palette.accentFg);

  // Variables éditoriales Option A
  root.style.setProperty('--desk', palette.appBg);
  root.style.setProperty('--surface', palette.toolbarBg);
  root.style.setProperty('--page', palette.paperBg);
  root.style.setProperty('--ink', palette.paperFg);
  root.style.setProperty('--text', palette.textPrimary);
  root.style.setProperty('--muted', palette.textSecondary);
  root.style.setProperty('--accent', palette.accent);
  root.style.setProperty('--filet', palette.filet);
  root.style.setProperty('--filet-fort', palette.filetFort);

  if (variant === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', palette.appBg);
  }

  root.dataset.theme = theme;
  root.dataset.variant = variant;
}
