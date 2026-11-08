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
    background: '#0F1015',
    secondaryBackground: '#171822',
    card: '#1E202B',
    elevatedCard: '#252836',
    primaryText: '#F8F9FA',
    secondaryText: '#9BA3AF',
    mutedText: '#6B7280',
    accent: '#FF5264',
    accentHover: '#FF6E7E',
    error: '#FF453A',
    border: '#282A38',
    isDark: true,
  },
  pure: {
    background: '#000000',
    secondaryBackground: '#0B0C10',
    card: '#13141B',
    elevatedCard: '#1C1D26',
    primaryText: '#FFFFFF',
    secondaryText: '#9CA3AF',
    mutedText: '#4B5563',
    accent: '#FF5264',
    accentHover: '#FF6E7E',
    error: '#EF4444',
    border: '#1E2028',
    isDark: true,
  },
  light: {
    background: '#FDFBF9',
    secondaryBackground: '#F2F4F7',
    card: '#FFFFFF',
    elevatedCard: '#F7F8FA',
    primaryText: '#181A20',
    secondaryText: '#5A5F6E',
    mutedText: '#959BAA',
    accent: '#FF5264',
    accentHover: '#FF3B50',
    error: '#DC2626',
    border: '#E8ECF2',
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

export interface HabitPastelTheme {
  bg: string;
  fill: string;
  border: string;
  text: string;
  accent: string;
}

export const PASTEL_PALETTE = {
  blue: { bg: '#E2F1FF', fill: '#B3DCFF', border: '#CBE5FD', text: '#0D47A1', accent: '#2196F3' },
  pink: { bg: '#FFE5E8', fill: '#FFB8C2', border: '#FFCCD3', text: '#C2185B', accent: '#FF5264' },
  slate: { bg: '#E4ECF7', fill: '#B8CEEB', border: '#CDDEFA', text: '#283593', accent: '#5C6BC0' },
  purple: { bg: '#F6EBFF', fill: '#E0BDF7', border: '#EBD4FB', text: '#6A1B9A', accent: '#AB47BC' },
  green: { bg: '#E4F8D5', fill: '#BEEBA5', border: '#CEF5B8', text: '#1B5E20', accent: '#4CAF50' },
  orange: { bg: '#FFE9D5', fill: '#FFCCA5', border: '#FFDCBF', text: '#E65100', accent: '#FF9800' },
  cyan: { bg: '#E0F7FA', fill: '#B2EBF2', border: '#CEF4F8', text: '#006064', accent: '#00BCD4' },
  yellow: { bg: '#FFFAD0', fill: '#FFEE99', border: '#FFF4B3', text: '#F57F17', accent: '#FFCA28' },
  teal: { bg: '#E0F2F1', fill: '#B2DFDB', border: '#C7EBE7', text: '#004D40', accent: '#26A69A' },
  red: { bg: '#FFEBEE', fill: '#FFCDD2', border: '#FFCCD3', text: '#B71C1C', accent: '#EF5350' },
};

export const getHabitPastelTheme = (
  habit: { category?: string; name?: string; color?: string },
  isDark = false
): HabitPastelTheme => {
  const name = (habit.name || '').toLowerCase();
  const cat = (habit.category || '').toLowerCase();

  let base = PASTEL_PALETTE.blue;
  if (name.includes('water') || (name.includes('drink') && !name.includes('less')) || cat.includes('water') || cat.includes('nutri')) {
    base = PASTEL_PALETTE.blue;
  } else if (name.includes('yoga') || name.includes('stretch') || cat.includes('mind') || cat.includes('creativ')) {
    base = PASTEL_PALETTE.pink;
  } else if (name.includes('less') || name.includes('quit') || name.includes('beverage') || name.includes('detox')) {
    base = PASTEL_PALETTE.slate;
  } else if (name.includes('breakfast') || name.includes('eat') || name.includes('meal') || name.includes('food')) {
    base = PASTEL_PALETTE.purple;
  } else if (name.includes('walk') || name.includes('step') || cat.includes('nature') || cat.includes('outdoor')) {
    base = PASTEL_PALETTE.green;
  } else if (name.includes('run') || name.includes('workout') || name.includes('gym') || cat.includes('fit')) {
    base = PASTEL_PALETTE.orange;
  } else if (name.includes('meditat') || name.includes('breath') || name.includes('calm')) {
    base = PASTEL_PALETTE.cyan;
  } else if (name.includes('money') || name.includes('save') || cat.includes('financ') || cat.includes('wealth')) {
    base = PASTEL_PALETTE.yellow;
  } else if (habit.color) {
    const c = habit.color.toLowerCase();
    if (c.includes('ff7a') || c.includes('ffa') || c.includes('ff9')) base = PASTEL_PALETTE.orange;
    else if (c.includes('10b9') || c.includes('4ca') || c.includes('84c')) base = PASTEL_PALETTE.green;
    else if (c.includes('3b82') || c.includes('2196') || c.includes('38b')) base = PASTEL_PALETTE.blue;
    else if (c.includes('ec48') || c.includes('f43') || c.includes('ff5')) base = PASTEL_PALETTE.pink;
    else if (c.includes('8b5c') || c.includes('d94') || c.includes('ab4')) base = PASTEL_PALETTE.purple;
    else if (c.includes('f59') || c.includes('ffc') || c.includes('fbc')) base = PASTEL_PALETTE.yellow;
  }

  if (isDark) {
    return {
      bg: '#181A24',
      fill: base.accent,
      border: `${base.accent}40`,
      text: '#F8F9FA',
      accent: base.accent,
    };
  }

  return base;
};
