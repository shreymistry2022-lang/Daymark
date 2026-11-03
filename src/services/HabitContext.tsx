// src/services/HabitContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { supabase, isSupabaseConfigured } from './supabase';
import { useAuth } from './AuthProvider';
import { canCreateHabit } from './subscriptionEntitlements';
import { useSubscription } from './SubscriptionProvider';

export interface Habit {
  id: string;
  name: string;
  category: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  streak: number;
  completedDates: string[]; // YYYY-MM-DD
  targetFrequency: string; // e.g. 'Daily', 'Weekdays', 'Weekends', '3x / week'
}

interface HabitContextType {
  habits: Habit[];
  toggleHabit: (id: string, dateStr?: string) => void;
  addHabit: (newHabit: Omit<Habit, 'id' | 'streak' | 'completedDates'>) => void;
  addMultipleHabits: (newHabits: Omit<Habit, 'id' | 'streak' | 'completedDates'>[]) => void;
  deleteHabit: (id: string) => void;
  todayDateStr: string;
  hasCompletedOnboarding: boolean;
  completeOnboarding: () => void;
  restartOnboarding: () => void;
  isLoadingData: boolean;
  exportDataJson: () => string;
  isCelebrationVisible: boolean;
  triggerCelebration: () => void;
  dismissCelebration: () => void;
  stats: {
    completedToday: number;
    totalToday: number;
    completionRate: number;
    bestStreak: number;
    totalCompletions: number;
  };
}

const STORAGE_KEYS = {
  HABITS: '@daymark_habits_v1',
  ONBOARDING: '@daymark_onboarding_v1',
};

const getTodayString = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getRelativeDateString = (daysOffset: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const generatePastDates = (count: number, includeToday = true): string[] => {
  const dates: string[] = [];
  const startOffset = includeToday ? 0 : 1;
  for (let i = startOffset; i < count + startOffset; i++) {
    dates.push(getRelativeDateString(-i));
  }
  return dates.reverse();
};

const INITIAL_HABITS: Habit[] = [
  {
    id: 'h1',
    name: 'Morning Sunlight & Walk',
    category: 'Morning Routine',
    color: '#FF7A00',
    icon: 'sunny-outline',
    streak: 14,
    completedDates: generatePastDates(14, true),
    targetFrequency: 'Daily',
  },
  {
    id: 'h2',
    name: 'Drink 2.5L Filtered Water',
    category: 'Nutrition & Water',
    color: '#06B6D4',
    icon: 'water-outline',
    streak: 21,
    completedDates: generatePastDates(21, true),
    targetFrequency: 'Daily',
  },
  {
    id: 'h3',
    name: 'Deep Work Block (90m)',
    category: 'Focus & Career',
    color: '#3B82F6',
    icon: 'briefcase-outline',
    streak: 8,
    completedDates: generatePastDates(8, false),
    targetFrequency: 'Weekdays',
  },
  {
    id: 'h4',
    name: 'Read 20 Pages Non-Fiction',
    category: 'Learning & Reading',
    color: '#8B5CF6',
    icon: 'book-outline',
    streak: 6,
    completedDates: generatePastDates(6, true),
    targetFrequency: 'Daily',
  },
  {
    id: 'h5',
    name: 'Strength Training / Gym',
    category: 'Health & Fitness',
    color: '#10B981',
    icon: 'fitness-outline',
    streak: 12,
    completedDates: generatePastDates(12, false),
    targetFrequency: 'Daily',
  },
];

const HabitContext = createContext<HabitContextType | undefined>(undefined);

export const useHabits = () => {
  const context = useContext(HabitContext);
  if (!context) {
    throw new Error('useHabits must be used within a HabitProvider');
  }
  return context;
};

export const HabitProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const { isPro } = useSubscription();
  const [habits, setHabits] = useState<Habit[]>(INITIAL_HABITS);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean>(true);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
  const [isCelebrationVisible, setIsCelebrationVisible] = useState<boolean>(false);
  const isLoadedRef = useRef(false);

  const todayStr = getTodayString();

  const triggerCelebration = () => setIsCelebrationVisible(true);
  const dismissCelebration = () => setIsCelebrationVisible(false);

  // Load recorded data from persistent storage (and Supabase if configured)
  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      try {
        // 1. ALWAYS load cached habits from AsyncStorage first so data from previous days is never lost!
        const [savedHabitsJson, savedOnboarding] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.HABITS),
          AsyncStorage.getItem(STORAGE_KEYS.ONBOARDING),
        ]);

        let localHabits: Habit[] = [];
        if (savedHabitsJson) {
          try {
            const parsed = JSON.parse(savedHabitsJson);
            if (Array.isArray(parsed) && parsed.length > 0) {
              localHabits = parsed;
              if (isMounted) {
                setHabits(parsed);
              }
            }
          } catch (parseErr) {
            console.warn('Failed to parse cached habits:', parseErr);
          }
        }

        // If user has never had habits saved locally, seed INITIAL_HABITS
        if (localHabits.length === 0) {
          localHabits = INITIAL_HABITS;
          if (isMounted) {
            setHabits(INITIAL_HABITS);
          }
          await AsyncStorage.setItem(STORAGE_KEYS.HABITS, JSON.stringify(INITIAL_HABITS)).catch(() => {});
        }

        if (savedOnboarding !== null && isMounted) {
          setHasCompletedOnboarding(savedOnboarding === 'true');
        }

        // 2. If user is logged in with Supabase, merge with cloud and preserve all completed dates!
        if (user && !user.isGuest && isSupabaseConfigured) {
          const { data: cloudRows, error } = await supabase
            .from('habits')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

          if (!error && Array.isArray(cloudRows) && cloudRows.length > 0 && isMounted) {
            const cloudHabits: Habit[] = cloudRows.map(row => {
              const cloudDates: string[] = Array.isArray(row.completed_dates) ? row.completed_dates : [];
              // Find matching local habit to combine all previous days' dates
              const localMatch = localHabits.find(
                lh => lh.id === row.id || lh.name.toLowerCase() === row.name.toLowerCase()
              );
              const localDates = localMatch ? localMatch.completedDates : [];
              const mergedDates = Array.from(new Set([...cloudDates, ...localDates])).sort();

              return {
                id: row.id,
                name: row.name,
                category: row.category,
                color: row.color,
                icon: row.icon as keyof typeof Ionicons.glyphMap,
                streak: row.streak || mergedDates.length,
                completedDates: mergedDates,
                targetFrequency: row.target_frequency || 'Daily',
              };
            });

            setHabits(cloudHabits);
            await AsyncStorage.setItem(STORAGE_KEYS.HABITS, JSON.stringify(cloudHabits));

            // Sync merged previous days back to Supabase in background
            for (const ch of cloudHabits) {
              supabase
                .from('habits')
                .upsert({
                  id: ch.id,
                  user_id: user.id,
                  name: ch.name,
                  category: ch.category,
                  color: ch.color,
                  icon: ch.icon,
                  streak: ch.streak,
                  completed_dates: ch.completedDates,
                  target_frequency: ch.targetFrequency,
                  updated_at: new Date().toISOString(),
                })
                .then(() => {});
            }
          } else if (!error && Array.isArray(cloudRows) && cloudRows.length === 0) {
            // New cloud account: upload local habits WITH all previous days' history
            const uploadPayload = localHabits.map(h => ({
              id: h.id.startsWith(user.id) ? h.id : `${user.id}_${h.id}`,
              user_id: user.id,
              name: h.name,
              category: h.category,
              color: h.color,
              icon: h.icon,
              streak: h.streak,
              completed_dates: h.completedDates, // ALL PREVIOUS DAYS PRESERVED!
              target_frequency: h.targetFrequency,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }));

            const { error: upsertErr } = await supabase.from('habits').upsert(uploadPayload);
            if (!upsertErr && isMounted) {
              const syncedHabits: Habit[] = uploadPayload.map(p => ({
                id: p.id,
                name: p.name,
                category: p.category,
                color: p.color,
                icon: p.icon as keyof typeof Ionicons.glyphMap,
                streak: p.streak,
                completedDates: p.completed_dates,
                targetFrequency: p.target_frequency,
              }));
              setHabits(syncedHabits);
              await AsyncStorage.setItem(STORAGE_KEYS.HABITS, JSON.stringify(syncedHabits));
            } else if (upsertErr) {
              console.warn('Failed to seed starter habits to Supabase:', upsertErr.message);
            }
          }
        }
      } catch (err) {
        console.error('Failed to load recorded habits:', err);
      } finally {
        if (isMounted) {
          isLoadedRef.current = true;
          setIsLoadingData(false);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [user]);

  // Save habits to local storage and sync with Supabase
  const saveHabits = async (updated: Habit[]) => {
    setHabits(updated);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.HABITS, JSON.stringify(updated));
    } catch (err) {
      console.error('Failed to save habit data to storage:', err);
    }
  };

  const toggleHabit = (id: string, dateStr: string = todayStr) => {
    let targetUpdatedHabit: Habit | null = null;

    const updated = habits.map(habit => {
      if (habit.id !== id) return habit;
      const isDone = habit.completedDates.includes(dateStr);
      let newCompletedDates: string[];
      let newStreak = habit.streak;

      if (isDone) {
        newCompletedDates = habit.completedDates.filter(d => d !== dateStr);
        if (dateStr === todayStr) {
          newStreak = Math.max(0, newStreak - 1);
        }
      } else {
        newCompletedDates = [...habit.completedDates, dateStr];
        if (dateStr === todayStr) {
          newStreak += 1;
        }
      }

      const updatedHabit = {
        ...habit,
        completedDates: newCompletedDates,
        streak: newStreak,
      };
      targetUpdatedHabit = updatedHabit;
      return updatedHabit;
    });

    // Check if this action completed all habits scheduled for today
    if (dateStr === todayStr && updated.length > 0) {
      const wasAllDoneBefore = habits.every(h => h.completedDates.includes(todayStr));
      const isAllDoneNow = updated.every(h => h.completedDates.includes(todayStr));
      if (!wasAllDoneBefore && isAllDoneNow) {
        setIsCelebrationVisible(true);
      }
    }

    saveHabits(updated);

    // Sync to Supabase if logged in
    if (user && !user.isGuest && isSupabaseConfigured && targetUpdatedHabit) {
      const h: Habit = targetUpdatedHabit;
      supabase
        .from('habits')
        .upsert({
          id: h.id,
          user_id: user.id,
          name: h.name,
          category: h.category,
          color: h.color,
          icon: h.icon,
          streak: h.streak,
          completed_dates: h.completedDates,
          target_frequency: h.targetFrequency,
          updated_at: new Date().toISOString(),
        })
        .then(({ error }) => {
          if (error) console.warn('Supabase toggleHabit sync warning:', error.message);
        });
    }
  };

  const addHabit = (newHabit: Omit<Habit, 'id' | 'streak' | 'completedDates'>) => {
    if (!canCreateHabit(habits.length, isPro)) return;
    const habitId = user && !user.isGuest ? `${user.id}_h_${Date.now()}` : `h_${Date.now()}`;
    const created: Habit = {
      ...newHabit,
      id: habitId,
      streak: 0,
      completedDates: [],
    };
    const updated = [created, ...habits];
    saveHabits(updated);

    // Sync to Supabase if logged in
    if (user && !user.isGuest && isSupabaseConfigured) {
      supabase
        .from('habits')
        .upsert({
          id: created.id,
          user_id: user.id,
          name: created.name,
          category: created.category,
          color: created.color,
          icon: created.icon,
          streak: created.streak,
          completed_dates: created.completedDates,
          target_frequency: created.targetFrequency,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .then(({ error }) => {
          if (error) console.warn('Supabase addHabit sync warning:', error.message);
        });
    }
  };

  const addMultipleHabits = (newHabits: Omit<Habit, 'id' | 'streak' | 'completedDates'>[]) => {
    const allowedCount = isPro ? newHabits.length : Math.max(0, 5 - habits.length);
    if (allowedCount === 0) return;
    const habitsToCreate = newHabits.slice(0, allowedCount);
    const prefix = user && !user.isGuest ? `${user.id}_onboard_${Date.now()}` : `h_onboard_${Date.now()}`;
    const createdList: Habit[] = habitsToCreate.map((h, i) => ({
      ...h,
      id: `${prefix}_${i}`,
      streak: 0,
      completedDates: [],
    }));
    const updated = [...createdList, ...habits];
    saveHabits(updated);

    // Sync to Supabase if logged in
    if (user && !user.isGuest && isSupabaseConfigured) {
      const payload = createdList.map(item => ({
        id: item.id,
        user_id: user.id,
        name: item.name,
        category: item.category,
        color: item.color,
        icon: item.icon,
        streak: item.streak,
        completed_dates: item.completedDates,
        target_frequency: item.targetFrequency,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
      supabase
        .from('habits')
        .upsert(payload)
        .then(({ error }) => {
          if (error) console.warn('Supabase addMultipleHabits sync warning:', error.message);
        });
    }
  };

  const deleteHabit = (id: string) => {
    const updated = habits.filter(h => h.id !== id);
    saveHabits(updated);

    // Sync to Supabase if logged in
    if (user && !user.isGuest && isSupabaseConfigured) {
      supabase
        .from('habits')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)
        .then(({ error }) => {
          if (error) console.warn('Supabase deleteHabit sync warning:', error.message);
        });
    }
  };

  const completeOnboarding = () => {
    setHasCompletedOnboarding(true);
    AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING, 'true').catch(() => {});
  };

  const restartOnboarding = () => {
    setHasCompletedOnboarding(false);
    AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING, 'false').catch(() => {});
  };

  const exportDataJson = () => {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        totalHabits: habits.length,
        habits,
      },
      null,
      2
    );
  };

  const completedToday = habits.filter(h => h.completedDates.includes(todayStr)).length;
  const totalToday = habits.length;
  const completionRate = totalToday > 0 ? Math.round((completedToday / totalToday) * 100) : 0;
  const bestStreak = habits.length > 0 ? Math.max(...habits.map(h => h.streak)) : 0;
  const totalCompletions = habits.reduce((acc, h) => acc + h.completedDates.length, 0);

  return (
    <HabitContext.Provider
      value={{
        habits,
        toggleHabit,
        addHabit,
        addMultipleHabits,
        deleteHabit,
        todayDateStr: todayStr,
        hasCompletedOnboarding,
        completeOnboarding,
        restartOnboarding,
        isLoadingData,
        exportDataJson,
        isCelebrationVisible,
        triggerCelebration,
        dismissCelebration,
        stats: {
          completedToday,
          totalToday,
          completionRate,
          bestStreak,
          totalCompletions,
        },
      }}
    >
      {children}
    </HabitContext.Provider>
  );
};
