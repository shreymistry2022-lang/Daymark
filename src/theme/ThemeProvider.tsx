// src/theme/ThemeProvider.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeMode, ThemePalette, THEME_PALETTES } from './tokens';

type ThemeContextType = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  colors: ThemePalette;
  isDark: boolean;
};

const THEME_STORAGE_KEY = '@daymark_theme_mode';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [mode, setModeState] = useState<ThemeMode>('midnight');

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then(savedMode => {
        if (savedMode && (savedMode === 'midnight' || savedMode === 'pure' || savedMode === 'light')) {
          setModeState(savedMode as ThemeMode);
        }
      })
      .catch(err => {
        console.error('Failed to load theme preference:', err);
      });
  }, []);

  const setMode = (newMode: ThemeMode) => {
    setModeState(newMode);
    AsyncStorage.setItem(THEME_STORAGE_KEY, newMode).catch(() => {});
  };

  const currentColors = THEME_PALETTES[mode] || THEME_PALETTES.midnight;

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
