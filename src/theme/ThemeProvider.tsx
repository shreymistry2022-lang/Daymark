// src/theme/ThemeProvider.tsx
import React, { createContext, useContext, ReactNode } from 'react';
import { useColorScheme, View } from 'react-native';
import { ThemeMode, ThemePalette, THEME_PALETTES } from './tokens';
import { useSubscription } from '../services/SubscriptionProvider';
import { usePreferences } from '../services/PreferencesContext';

type ThemeContextType = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  colors: ThemePalette;
  isDark: boolean;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const { isPro, isLoading: isSubscriptionLoading } = useSubscription();
  const { preferences, updatePreferences } = usePreferences();
  const deviceScheme = useColorScheme();
  const mode = preferences.themeMode;

  const setMode = (newMode: ThemeMode) => {
    if (newMode === 'pure' && (!isPro || isSubscriptionLoading)) return;
    updatePreferences({ themeMode: newMode });
  };

  const effectiveMode = mode === 'automatic' ? (deviceScheme === 'light' ? 'light' : 'midnight') : mode;
  const palette = THEME_PALETTES[effectiveMode === 'pure' && !isPro ? 'midnight' : effectiveMode] || THEME_PALETTES.midnight;
  const currentColors = preferences.accentColor ? { ...palette, accent: preferences.accentColor, accentHover: preferences.accentColor } : palette;

  return (
    <ThemeContext.Provider
      value={{
        mode,
        setMode,
        colors: currentColors,
        isDark: currentColors.isDark,
      }}
    >
      <View style={{ backgroundColor: currentColors.background, flex: 1 }}>
        {children}
      </View>
    </ThemeContext.Provider>
  );
};
