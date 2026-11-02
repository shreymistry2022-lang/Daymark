// src/services/HabitContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { supabase, isSupabaseConfigured } from './supabase';
import { useAuth } from './AuthProvider';

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

const INITIAL_HABITS: Habit[] = [
  {
    id: 'h1',
    name: 'Morning Sunlight & Walk',
    category: 'Morning Routine',
    color: '#FF7A00',
    icon: 'sunny-outline',
    streak: 14,
    completedDates: [getTodayString()],
    targetFrequency: 'Daily',
  },
  {
    id: 'h2',
    name: 'Drink 2.5L Filtered Water',
    category: 'Nutrition & Water',
    color: '#06B6D4',
    icon: 'water-outline',
    streak: 21,
    completedDates: [getTodayString()],
    targetFrequency: 'Daily',
  },
  {
    id: 'h3',
    name: 'Deep Work Block (90m)',
    category: 'Focus & Career',
    color: '#3B82F6',
    icon: 'briefcase-outline',
    streak: 8,
    completedDates: [],
    targetFrequency: 'Weekdays',
  },
  {
    id: 'h4',
    name: 'Read 20 Pages Non-Fiction',
    category: 'Learning & Reading',
    color: '#8B5CF6',
    icon: 'book-outline',
    streak: 6,
    completedDates: [getTodayString()],
    targetFrequency: 'Daily',
  },
  {
    id: 'h5',
    name: 'Strength Training / Gym',
    category: 'Health & Fitness',
    color: '#10B981',
    icon: 'fitness-outline',
    streak: 12,
    completedDates: [],
    targetFrequency: 'Daily',
  },
  {
    id: 'h6',
    name: 'Evening Wind-down (No Screens)',
    category: 'Night Routine',
    color: '#6366F1',
    icon: 'moon-outline',
    streak: 9,
    completedDates: [],
    targetFrequency: 'Daily',
  },
  {
    id: 'h7',
    name: 'Track Daily Expenses',
    category: 'Finance & Wealth',
    color: '#F59E0B',
    icon: 'wallet-outline',
    streak: 15,
    completedDates: [getTodayString()],
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
  const [habits, setHabits] = useState<Habit[]>(INITIAL_HABITS);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean>(true);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
  const isLoadedRef = useRef(false);

  const todayStr = getTodayString();

  // Load recorded data from persistent storage (and Supabase if configured)
  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      try {
        // 1. First load local cache for instant UI
        const [savedHabitsJson, savedOnboarding] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.HABITS),
          AsyncStorage.getItem(STORAGE_KEYS.ONBOARDING),
        ]);

        if (savedHabitsJson && isMounted) {
          const parsed = JSON.parse(savedHabitsJson);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setHabits(parsed);
          }
        }

        if (savedOnboarding !== null && isMounted) {
          setHasCompletedOnboarding(savedOnboarding === 'true');
        }

        // 2. If user is logged in and Supabase is configured, fetch latest from cloud
        if (user && !user.isGuest && isSupabaseConfigured) {
          const { data: cloudRows, error } = await supabase
            .from('habits')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

          if (!error && Array.isArray(cloudRows) && cloudRows.length > 0 && isMounted) {
            const mapped: Habit[] = cloudRows.map(row => ({
              id: row.id,
              name: row.name,
              category: row.category,
              color: row.color,
              icon: row.icon as keyof typeof Ionicons.glyphMap,
              streak: row.streak || 0,
              completedDates: Array.isArray(row.completed_dates) ? row.completed_dates : [],
              targetFrequency: row.target_frequency || 'Daily',
            }));
            setHabits(mapped);
            await AsyncStorage.setItem(STORAGE_KEYS.HABITS, JSON.stringify(mapped));
          } else if (!error && Array.isArray(cloudRows) && cloudRows.length === 0) {
            // New cloud account: seed initial starter habits to Supabase
            const starterPayload = INITIAL_HABITS.map(h => ({
              id: `${h.id}_${Date.now()}`,
              user_id: user.id,
              name: h.name,
              category: h.category,
              color: h.color,
              icon: h.icon,
              streak: h.streak,
              completed_dates: h.completedDates,
              target_frequency: h.targetFrequency,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }));
            await supabase.from('habits').insert(starterPayload);
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

    saveHabits(updated);

    // Sync to Supabase if logged in
    if (user && !user.isGuest && isSupabaseConfigured && targetUpdatedHabit) {
      const h: Habit = targetUpdatedHabit;
      supabase
        .from('habits')
        .update({
          completed_dates: h.completedDates,
          streak: h.streak,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .then(({ error }) => {
          if (error) console.warn('Supabase toggleHabit sync warning:', error.message);
        });
    }
  };

  const addHabit = (newHabit: Omit<Habit, 'id' | 'streak' | 'completedDates'>) => {
    const created: Habit = {
      ...newHabit,
      id: `h_${Date.now()}`,
      streak: 0,
      completedDates: [],
    };
    const updated = [created, ...habits];
    saveHabits(updated);

    // Sync to Supabase if logged in
    if (user && !user.isGuest && isSupabaseConfigured) {
      supabase
        .from('habits')
        .insert({
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
    const createdList: Habit[] = newHabits.map((h, i) => ({
      ...h,
      id: `h_onboard_${Date.now()}_${i}`,
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
        .insert(payload)
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
