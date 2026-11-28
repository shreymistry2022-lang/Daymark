// src/theme/tokens.ts
export type ThemeMode = 'automatic' | 'midnight' | 'pure' | 'light';

export interface ThemePalette {
  background: string;
  secondaryBackground: string;
  card: string;
  elevatedCard: string;
  primaryText: string;
  secondaryText: string;
  mutedText: string;
  accent: string;
  accentHover: string;
  error: string;
  border: string;
  isDark: boolean;
}

export const THEME_PALETTES: Record<Exclude<ThemeMode, 'automatic'>, ThemePalette> = {
  midnight: {
    background: '#0A0B0F',
    secondaryBackground: '#16171F',
    card: '#13141B',
    elevatedCard: '#1D1F29',
    primaryText: '#F8F9FA',
    secondaryText: '#8E95A5',
    mutedText: '#5F6676',
    accent: '#7C83FF',
    accentHover: '#9298FF',
    error: '#FF453A',
    border: '#232531',
    isDark: true,
  },
  pure: {
    background: '#000000',
    secondaryBackground: '#0E0F13',
    card: '#111216',
    elevatedCard: '#1A1B22',
    primaryText: '#FFFFFF',
    secondaryText: '#9CA3AF',
    mutedText: '#525866',
    accent: '#38BDF8',
    accentHover: '#60A5FA',
    error: '#EF4444',
    border: '#1E2028',
    isDark: true,
  },
  light: {
    background: '#F4F5F8',
    secondaryBackground: '#EAECEF',
    card: '#FFFFFF',
    elevatedCard: '#E5E8EE',
    primaryText: '#0D1017',
    secondaryText: '#525C6E',
    mutedText: '#94A3B8',
    accent: '#5B63F6',
    accentHover: '#4A52E8',
    error: '#DC2626',
    border: '#E4E7EE',
    isDark: false,
  },
};

export interface ThemeOptionDef {
  id: ThemeMode;
  label: string;
  desc: string;
  accentLabel: string;
  preview: {
    bg: string;
    card: string;
    accent: string;
  };
}

export const THEME_OPTIONS: ThemeOptionDef[] = [
  {
    id: 'automatic',
    label: 'Automatic',
    desc: 'Follow your device appearance',
    accentLabel: '#4169E1',
    preview: { bg: '#0D0E12', card: '#1A1D26', accent: '#4169E1' },
  },
  {
    id: 'midnight',
    label: 'Midnight Obsidian',
    desc: 'Deep Charcoal & Soft Indigo glow',
    accentLabel: '#7C83FF',
    preview: {
      bg: '#0A0B0F',
      card: '#13141B',
      accent: '#7C83FF',
    },
  },
  {
    id: 'pure',
    label: 'Pure OLED Black',
    desc: 'Pitch-black contrast & Electric Cobalt',
    accentLabel: '#38BDF8',
    preview: {
      bg: '#000000',
      card: '#111215',
      accent: '#38BDF8',
    },
  },
  {
    id: 'light',
    label: 'Swiss Editorial Light',
    desc: 'Crisp Architectural paper & Vermilion',
    accentLabel: '#FF6B00',
    preview: {
      bg: '#F5F6F9',
      card: '#FFFFFF',
      accent: '#FF6B00',
    },
  },
];

// Default fallback
export const colors = THEME_PALETTES.midnight;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

export const radii = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 26,
  full: 9999,
};

export const typography = {
  fontFamily: 'Inter',
  fontWeightRegular: '400',
  fontWeightMedium: '500',
  fontWeightBold: '700',
};
