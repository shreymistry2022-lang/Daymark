// src/services/AchievementsContext.tsx
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useHabits } from './HabitContext';
import { ACHIEVEMENTS, AchievementKey, AchievementProgress, calculateAchievementProgress } from '../domain/achievementEngine';
import { usePreferences } from './PreferencesContext';
import { dateKeyInTimezone } from '../domain/preferencesEngine';
import { parseLocalDate } from '../domain/habitEngine';
import { useDeviceIdentity } from './DeviceIdentityProvider';

interface AchievementsValue {
  achievements: AchievementProgress[];
  isLoading: boolean;
  error: string | null;
}

const AchievementContext = createContext<AchievementsValue | null>(null);
const storageKey = (userId: string) => `@daymark_achievements_v1:${userId}`;

export const useAchievements = () => {
  const value = useContext(AchievementContext);
  if (!value) throw new Error('useAchievements must be used within AchievementsProvider');
  return value;
};

const initialAchievementsPlaceholder = (): AchievementProgress[] =>
  ACHIEVEMENTS.map(item => ({ ...item, progress: 0, unlocked: false, unlockedAt: null }));

export const AchievementsProvider = ({ children }: { children: ReactNode }) => {
  const { deviceOwnerId, isReady } = useDeviceIdentity();
  const { allHabits } = useHabits();
  const { preferences } = usePreferences();
  const [unlocked, setUnlocked] = useState<Record<string, string>>({});
  const [achievements, setAchievements] = useState<AchievementProgress[]>(initialAchievementsPlaceholder);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const queuedAwards = useRef(new Set<string>());
  const hasEvaluatedOnceRef = useRef(false);

  const key = storageKey(deviceOwnerId);

  const persist = useCallback(async (next: Record<string, string>) => {
    setUnlocked(next);
    try {
      await AsyncStorage.setItem(key, JSON.stringify(next));
    } catch {
      setError('Achievement history could not be saved on this device.');
    }
  }, [key]);

  useEffect(() => {
    if (!isReady) return;
    let mounted = true;
    const load = async () => {
      setIsLoading(true);
      let local: Record<string, string> = {};
      try {
        local = JSON.parse((await AsyncStorage.getItem(key)) ?? '{}') as Record<string, string>;
      } catch {
        if (mounted) setError('Saved achievement history could not be read.');
      }
      if (mounted) {
        setUnlocked(local);
        setIsLoading(false);
      }
    };
    void load();
    return () => { mounted = false; };
  }, [key, isReady]);

  useEffect(() => {
    if (isLoading) return;
    let cancelled = false;

    const evaluate = () => {
      if (cancelled) return;
      const now = parseLocalDate(dateKeyInTimezone(new Date(), preferences.timezone)) ?? new Date();
      const calculated = calculateAchievementProgress(allHabits, now, unlocked);
      setAchievements(calculated);

      const next = { ...unlocked };
      const newlyUnlocked: AchievementKey[] = [];
      for (const item of calculated) {
        if (item.unlocked && !next[item.key]) {
          next[item.key] = new Date().toISOString();
          newlyUnlocked.push(item.key);
        }
      }
      const awardsToSave = newlyUnlocked.filter(item => !queuedAwards.current.has(item));
      if (!awardsToSave.length) return;
      awardsToSave.forEach(item => queuedAwards.current.add(item));
      void persist(next);
    };

    const delayMs = hasEvaluatedOnceRef.current ? 800 : 60;
    hasEvaluatedOnceRef.current = true;
    const timer = setTimeout(evaluate, delayMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [allHabits, isLoading, unlocked, persist, preferences.timezone]);

  return <AchievementContext.Provider value={{ achievements, isLoading, error }}>{children}</AchievementContext.Provider>;
};
