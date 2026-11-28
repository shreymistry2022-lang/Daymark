// src/services/PreferencesContext.tsx
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeMode } from '../theme/tokens';
import { scheduleRhythmRemindersAsync } from './localReminders';
import { useDeviceIdentity } from './DeviceIdentityProvider';

export type DateFormat = 'system' | 'us' | 'uk' | 'iso';
export type DashboardSort = 'custom' | 'alphabetical' | 'consistency' | 'completion';
export interface DaymarkPreferences {
  themeMode: ThemeMode;
  weekStart: number;
  timezone: string;
  dateFormat: DateFormat;
  hapticsEnabled: boolean;
  soundEnabled: boolean;
  notifications: { daily: boolean; routine: boolean };
  dashboardSort: DashboardSort;
  accentColor: string;
  wakeTime: string | null;
  sleepTime: string | null;
  updatedAt: string;
}
export type PreferencesChanges = Partial<Omit<DaymarkPreferences, 'updatedAt' | 'notifications'>> & { notifications?: Partial<DaymarkPreferences['notifications']> };
interface PreferencesValue { preferences: DaymarkPreferences; isLoading: boolean; error: string | null; updatePreferences: (changes: PreferencesChanges) => void; clearError: () => void; }
const PreferencesContext = createContext<PreferencesValue | null>(null);
const storageKey = (id: string) => `@daymark_preferences_v1:${id}`;
export const DEFAULT_ACCENTS = ['#7C83FF', '#4169E1', '#14B8A6', '#38BDF8', '#FF7A00', '#E879F9', '#F43F5E'];
const defaultPreferences = (): DaymarkPreferences => ({ themeMode: 'automatic', weekStart: 1, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', dateFormat: 'system', hapticsEnabled: true, soundEnabled: true, notifications: { daily: true, routine: true }, dashboardSort: 'custom', accentColor: DEFAULT_ACCENTS[0], wakeTime: null, sleepTime: null, updatedAt: new Date(0).toISOString() });
const validTheme = (value: unknown): value is ThemeMode => value === 'midnight' || value === 'pure' || value === 'light' || value === 'automatic';

export const usePreferences = () => { const value = useContext(PreferencesContext); if (!value) throw new Error('usePreferences must be used within PreferencesProvider'); return value; };

export const PreferencesProvider = ({ children }: { children: ReactNode }) => {
  const { deviceOwnerId, isReady } = useDeviceIdentity();
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const deviceOwnerIdRef = useRef(deviceOwnerId);
  const preferencesRef = useRef(preferences);
  useEffect(() => {
    deviceOwnerIdRef.current = deviceOwnerId;
    preferencesRef.current = preferences;
  });

  const persist = useCallback(async (next: DaymarkPreferences) => {
    setPreferences(next);
    preferencesRef.current = next;
    const key = storageKey(deviceOwnerIdRef.current);
    try {
      await AsyncStorage.setItem(key, JSON.stringify(next));
    } catch (err) {
      console.warn('Could not save preferences locally:', err);
      setError('Preferences could not be saved on this device.');
    }
  }, []);

  // Load preferences from AsyncStorage
  useEffect(() => {
    if (!isReady) return;
    let mounted = true;
    const load = async () => {
      setIsLoading(true);
      const key = storageKey(deviceOwnerId);
      try {
        // Try user-scoped key first, fall back to guest key
        let raw = await AsyncStorage.getItem(key);
        if (!raw) raw = await AsyncStorage.getItem('@daymark_preferences_v1:guest');
        if (raw && mounted) {
          const parsed = JSON.parse(raw) as Partial<DaymarkPreferences>;
          const merged: DaymarkPreferences = {
            ...defaultPreferences(),
            ...parsed,
            themeMode: validTheme(parsed.themeMode) ? parsed.themeMode : defaultPreferences().themeMode,
            notifications: { ...defaultPreferences().notifications, ...(parsed.notifications ?? {}) },
          };
          setPreferences(merged);
          preferencesRef.current = merged;
        }
      } catch (err) {
        console.warn('Could not load preferences:', err);
        if (mounted) setError('Saved preferences could not be read from this device.');
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    void load();
    return () => { mounted = false; };
  }, [deviceOwnerId, isReady]);

  // Schedule rhythm reminders when wake/sleep times change
  const lastRhythmRef = useRef({ wakeTime: preferences.wakeTime, sleepTime: preferences.sleepTime });
  useEffect(() => {
    if (isLoading) return;
    const { wakeTime, sleepTime } = preferences;
    if (lastRhythmRef.current.wakeTime === wakeTime && lastRhythmRef.current.sleepTime === sleepTime) return;
    lastRhythmRef.current = { wakeTime, sleepTime };
    if (wakeTime || sleepTime) {
      void scheduleRhythmRemindersAsync({ wakeTime, sleepTime }).catch(err =>
        console.warn('Could not schedule rhythm reminders:', err)
      );
    }
  }, [preferences, isLoading]);

  const updatePreferences = useCallback((changes: PreferencesChanges) => {
    setError(null);
    const current = preferencesRef.current;
    const next: DaymarkPreferences = {
      ...current,
      ...changes,
      notifications: changes.notifications
        ? { ...current.notifications, ...changes.notifications }
        : current.notifications,
      updatedAt: new Date().toISOString(),
    };
    void persist(next);
  }, [persist]);

  const clearError = useCallback(() => setError(null), []);

  return (
    <PreferencesContext.Provider value={{ preferences, isLoading, error, updatePreferences, clearError }}>
      {children}
    </PreferencesContext.Provider>
  );
};
