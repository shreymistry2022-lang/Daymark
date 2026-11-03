// src/theme/ThemeProvider.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeMode, ThemePalette, THEME_PALETTES } from './tokens';
import { useSubscription } from '../services/SubscriptionProvider';

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
  const { isPro, isLoading: isSubscriptionLoading } = useSubscription();
  const [mode, setModeState] = useState<ThemeMode>('midnight');

  useEffect(() => {
    if (isSubscriptionLoading) return;
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then(savedMode => {
        if (savedMode && (savedMode === 'midnight' || savedMode === 'pure' || savedMode === 'light')) {
          const allowedMode = savedMode === 'pure' && !isPro ? 'midnight' : savedMode as ThemeMode;
          setModeState(allowedMode);
          if (allowedMode !== savedMode) AsyncStorage.setItem(THEME_STORAGE_KEY, allowedMode).catch(() => {});
        }
      })
      .catch(err => {
        console.error('Failed to load theme preference:', err);
      });
  }, [isPro, isSubscriptionLoading]);

  useEffect(() => {
    if (!isSubscriptionLoading && !isPro && mode === 'pure') {
      AsyncStorage.setItem(THEME_STORAGE_KEY, 'midnight').catch(() => {});
    }
  }, [isPro, isSubscriptionLoading, mode]);

  const setMode = (newMode: ThemeMode) => {
    if (newMode === 'pure' && !isPro) return;
    setModeState(newMode);
    AsyncStorage.setItem(THEME_STORAGE_KEY, newMode).catch(() => {});
  };

  const effectiveMode = mode === 'pure' && !isPro ? 'midnight' : mode;
  const currentColors = THEME_PALETTES[effectiveMode] || THEME_PALETTES.midnight;

  return (
    <ThemeContext.Provider
      value={{
        mode: effectiveMode,
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
