import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from './supabase';
import { useAuth } from './AuthProvider';
import { ThemeMode } from '../theme/tokens';

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
interface PreferencesValue { preferences: DaymarkPreferences; isLoading: boolean; error: string | null; updatePreferences: (changes: PreferencesChanges) => void }
const PreferencesContext = createContext<PreferencesValue | null>(null);
const storageKey = (id?: string) => `@daymark_preferences_v1:${id ?? 'guest'}`;
export const DEFAULT_ACCENTS = ['#4169E1', '#5C7CFA', '#14B8A6', '#38BDF8', '#FF7A00', '#E879F9', '#F43F5E'];
const defaultPreferences = (): DaymarkPreferences => ({ themeMode: 'automatic', weekStart: 1, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', dateFormat: 'system', hapticsEnabled: true, soundEnabled: true, notifications: { daily: true, routine: true }, dashboardSort: 'custom', accentColor: DEFAULT_ACCENTS[0], wakeTime: null, sleepTime: null, updatedAt: new Date(0).toISOString() });
const validTheme = (value: unknown): value is ThemeMode => value === 'midnight' || value === 'pure' || value === 'light' || value === 'automatic';

export const usePreferences = () => { const value = useContext(PreferencesContext); if (!value) throw new Error('usePreferences must be used within PreferencesProvider'); return value; };

export const PreferencesProvider = ({ children }: { children: ReactNode }) => {
  const { user, session } = useAuth();
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const ownerId = user?.id ?? undefined;
  const key = storageKey(ownerId);
  const persist = useCallback(async (next: DaymarkPreferences, sync = true) => {
    setPreferences(next);
    try { await AsyncStorage.setItem(key, JSON.stringify(next)); }
    catch { setError('Settings could not be saved on this device.'); }
    if (sync && session && user && !user.isGuest && isSupabaseConfigured) {
      const { error: syncError } = await supabase.from('user_preferences').upsert({
        user_id: user.id, wake_time: next.wakeTime, sleep_time: next.sleepTime, week_start: next.weekStart,
        timezone: next.timezone, date_format: next.dateFormat, haptics_enabled: next.hapticsEnabled,
        sound_enabled: next.soundEnabled, notification_preferences: next.notifications,
        dashboard_sort: next.dashboardSort, accent_color: next.accentColor || null,
        theme_mode: next.themeMode, updated_at: next.updatedAt,
      }, { onConflict: 'user_id' });
      if (syncError) {
        console.warn('Preferences saved locally; cloud sync status:', syncError.message);
        const isMissingTable = syncError.code === 'PGRST205' || syncError.message?.includes('schema cache');
        if (!isMissingTable) {
          setError('Settings are saved on this device, but cloud sync failed.');
        }
      }
    }
  }, [key, session, user]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      let local = defaultPreferences();
      try { const saved = await AsyncStorage.getItem(key); if (saved) local = { ...local, ...(JSON.parse(saved) as Partial<DaymarkPreferences>) }; }
      catch { if (mounted) setError('Saved settings could not be read.'); }
      if (session && user && !user.isGuest && isSupabaseConfigured) {
        try {
          const { data, error: queryError } = await supabase.from('user_preferences').select('*').eq('user_id', user.id).maybeSingle();
          if (queryError) {
            const isMissingTable = queryError.code === 'PGRST205' || queryError.message?.includes('schema cache');
            if (!isMissingTable) throw queryError;
          } else if (data) {
            const cloudTime = data.updated_at ?? new Date(0).toISOString();
            if (local.updatedAt > cloudTime) await persist(local);
            else local = {
              ...local, weekStart: Number(data.week_start ?? local.weekStart), timezone: data.timezone ?? local.timezone,
              dateFormat: data.date_format ?? local.dateFormat, hapticsEnabled: data.haptics_enabled ?? local.hapticsEnabled,
              soundEnabled: data.sound_enabled ?? local.soundEnabled, notifications: { ...local.notifications, ...(data.notification_preferences ?? {}) },
              dashboardSort: data.dashboard_sort ?? local.dashboardSort, accentColor: data.accent_color ?? local.accentColor,
              themeMode: validTheme(data.theme_mode) ? data.theme_mode : local.themeMode,
              wakeTime: data.wake_time ?? null, sleepTime: data.sleep_time ?? null, updatedAt: cloudTime,
            };
          } else if (local.updatedAt > new Date(0).toISOString()) await persist(local);
        } catch (syncError: any) {
          console.warn('Preferences cloud sync unavailable:', syncError);
          const isMissingTable = syncError?.code === 'PGRST205' || syncError?.message?.includes('schema cache');
          if (mounted && !isMissingTable) setError('Cloud sync is unavailable. Settings remain saved locally.');
        }
      }
      if (!mounted) return;
      setPreferences(local);
      try { await AsyncStorage.setItem(key, JSON.stringify(local)); } catch { setError('Settings could not be saved on this device.'); }
      setIsLoading(false);
    };
    void load(); return () => { mounted = false; };
  }, [key, session, user, persist]);

  const updatePreferences = (changes: PreferencesChanges) => {
    const next: DaymarkPreferences = { ...preferences, ...changes, notifications: { ...preferences.notifications, ...(changes.notifications ?? {}) }, updatedAt: new Date().toISOString() };
    setError(null); void persist(next);
  };
  return <PreferencesContext.Provider value={{ preferences, isLoading, error, updatePreferences }}>{children}</PreferencesContext.Provider>;
};
