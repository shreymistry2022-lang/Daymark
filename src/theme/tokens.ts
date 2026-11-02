// src/theme/tokens.ts
export type ThemeMode = 'midnight' | 'pure' | 'light';

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

export const THEME_PALETTES: Record<ThemeMode, ThemePalette> = {
  midnight: {
    background: '#0D0E12',
    secondaryBackground: '#14161D',
    card: '#1A1D26',
    elevatedCard: '#242834',
    primaryText: '#F8F9FA',
    secondaryText: '#8E95A5',
    mutedText: '#606778',
    accent: '#FF7A00',
    accentHover: '#FF9500',
    error: '#FF453A',
    border: '#252936',
    isDark: true,
  },
  pure: {
    background: '#000000',
    secondaryBackground: '#090A0C',
    card: '#111215',
    elevatedCard: '#1A1B20',
    primaryText: '#FFFFFF',
    secondaryText: '#9CA3AF',
    mutedText: '#4B5563',
    accent: '#38BDF8',
    accentHover: '#60A5FA',
    error: '#EF4444',
    border: '#202228',
    isDark: true,
  },
  light: {
    background: '#F5F6F9',
    secondaryBackground: '#EAECEF',
    card: '#FFFFFF',
    elevatedCard: '#E2E5EA',
    primaryText: '#0A0D14',
    secondaryText: '#4B5565',
    mutedText: '#94A3B8',
    accent: '#FF6B00',
    accentHover: '#E05D00',
    error: '#DC2626',
    border: '#E2E6ED',
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
    id: 'midnight',
    label: 'Midnight Obsidian',
    desc: 'Deep Charcoal & Tangerine glow',
    accentLabel: '#FF7A00',
    preview: {
      bg: '#0D0E12',
      card: '#1A1D26',
      accent: '#FF7A00',
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
  sm: 4,
  md: 8,
  lg: 12,
  xl: 20,
  full: 9999,
};

export const typography = {
  fontFamily: 'Inter',
  fontWeightRegular: '400',
  fontWeightMedium: '500',
  fontWeightBold: '700',
};
