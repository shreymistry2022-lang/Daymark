import React, { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from './supabase';
import { useAuth } from './AuthProvider';
import { useHabits } from './HabitContext';
import { AchievementKey, AchievementProgress, calculateAchievementProgress } from '../domain/achievementEngine';
import { usePreferences } from './PreferencesContext';
import { dateKeyInTimezone } from '../domain/preferencesEngine';
import { parseLocalDate } from '../domain/habitEngine';

interface AchievementsValue { achievements: AchievementProgress[]; isLoading: boolean; error: string | null }
const AchievementContext = createContext<AchievementsValue | null>(null);
const storageKey = (userId?: string) => `@daymark_achievements_v1:${userId ?? 'guest'}`;
export const useAchievements = () => { const value = useContext(AchievementContext); if (!value) throw new Error('useAchievements must be used within AchievementsProvider'); return value; };

export const AchievementsProvider = ({ children }: { children: ReactNode }) => {
  const { user, session } = useAuth();
  const { allHabits } = useHabits();
  const { preferences } = usePreferences();
  const [unlocked, setUnlocked] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const queuedAwards = useRef(new Set<string>());
  const owner = user?.id ?? 'guest';
  const key = storageKey(owner);
  const persist = useCallback(async (next: Record<string, string>) => { setUnlocked(next); try { await AsyncStorage.setItem(key, JSON.stringify(next)); } catch { setError('Achievement history could not be saved on this device.'); } }, [key]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setIsLoading(true);
      let local: Record<string, string> = {};
      try { local = JSON.parse((await AsyncStorage.getItem(key)) ?? '{}') as Record<string, string>; }
      catch { if (mounted) setError('Saved achievement history could not be read.'); }
      if (session && user && !user.isGuest && isSupabaseConfigured) {
        try {
          const { data, error: queryError } = await supabase.from('achievements').select('achievement_key,unlocked_at').eq('user_id', user.id);
          if (queryError) throw queryError;
          const cloudKeys = new Set<string>();
          for (const row of data ?? []) if (row.achievement_key && row.unlocked_at) { local[row.achievement_key] = row.unlocked_at; cloudKeys.add(row.achievement_key); }
          if (mounted) await persist(local);
          const pending = Object.entries(local).filter(([achievement_key]) => !cloudKeys.has(achievement_key));
          if (pending.length) {
            const { error: uploadError } = await supabase.from('achievements').upsert(pending.map(([achievement_key, unlocked_at]) => ({ user_id: user.id, achievement_key, unlocked_at })), { onConflict: 'user_id,achievement_key', ignoreDuplicates: true });
            if (uploadError) throw uploadError;
          }
          if (mounted) setError(null);
        } catch (syncError) { console.warn('Achievement cloud sync failed:', syncError); if (mounted) setError('Achievement sync is unavailable. Your local history remains available.'); }
      } else if (mounted) setUnlocked(local);
      if (mounted) setIsLoading(false);
    };
    void load(); return () => { mounted = false; };
  }, [key, session, user, persist]);

  useEffect(() => {
    if (isLoading) return;
    const now = parseLocalDate(dateKeyInTimezone(new Date(), preferences.timezone)) ?? new Date();
    const calculated = calculateAchievementProgress(allHabits, now, unlocked);
    const next = { ...unlocked };
    const newlyUnlocked: AchievementKey[] = [];
    for (const item of calculated) if (item.unlocked && !next[item.key]) { next[item.key] = new Date().toISOString(); newlyUnlocked.push(item.key); }
    const awardsToSave = newlyUnlocked.filter(item => !queuedAwards.current.has(item));
    if (!awardsToSave.length) return;
    awardsToSave.forEach(item => queuedAwards.current.add(item));
    setTimeout(() => { void persist(next); }, 0);
    if (session && user && !user.isGuest && isSupabaseConfigured) {
      void supabase.from('achievements').upsert(awardsToSave.map(achievement_key => ({ user_id: user.id, achievement_key, unlocked_at: next[achievement_key] })), { onConflict: 'user_id,achievement_key', ignoreDuplicates: true }).then(({ error: syncError }) => {
        if (syncError) { console.warn('Achievements saved locally; cloud sync failed:', syncError); setError('New achievements are saved locally, but cloud sync failed.'); }
      });
    }
  }, [allHabits, isLoading, unlocked, persist, session, user, preferences.timezone]);

  const achievementNow = parseLocalDate(dateKeyInTimezone(new Date(), preferences.timezone)) ?? new Date();
  const achievements = calculateAchievementProgress(allHabits, achievementNow, unlocked);
  return <AchievementContext.Provider value={{ achievements, isLoading, error }}>{children}</AchievementContext.Provider>;
};
