// src/services/HabitContext.tsx
import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { canCreateHabit } from './subscriptionEntitlements';
import { useSubscription } from './SubscriptionProvider';
import { addLocalDays, calculateCompletionStats, calculateStreakStats, canLogHabitOnDate, getHabitDayStatus, isScheduledOnDate, normalizeSchedule, parseLocalDate } from '../domain/habitEngine';
import { HabitConfigurationSnapshot, HabitKind, HabitLog, HabitPause, HabitReminder, HabitSchedule, TrackingMethod } from '../domain/habitTypes';
import { replaceLocalHabitReminders, cleanupDuplicateNotificationsAsync, schedulePendingHabitsReminderAsync } from './localReminders';
import { usePreferences } from './PreferencesContext';
import { dateKeyInTimezone } from '../domain/preferencesEngine';
import DaymarkTodayWidget from '../widgets/DaymarkTodayWidget';
import { useDeviceIdentity } from './DeviceIdentityProvider';

export interface Habit {
  id: string;
  name: string;
  category: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  streak: number;
  completedDates: string[]; // YYYY-MM-DD
  targetFrequency: string; // e.g. 'Daily', 'Weekdays', 'Weekends', '3x / week'
  description?: string;
  habitKind?: HabitKind;
  trackingMethod?: TrackingMethod;
  targetValue?: number;
  unit?: string;
  schedule?: HabitSchedule;
  startDate?: string;
  endDate?: string | null;
  archivedAt?: string | null;
  pausedPeriods?: HabitPause[];
  logs?: HabitLog[];
  reminders?: HabitReminder[];
  configurationHistory?: HabitConfigurationSnapshot[];
  configurationEffectiveFrom?: string;
  sortOrder?: number;
}

interface HabitContextType {
  habits: Habit[];
  archivedHabits: Habit[];
  allHabits: Habit[];
  toggleHabit: (id: string, dateStr?: string) => void;
  addHabit: (newHabit: Omit<Habit, 'id' | 'streak' | 'completedDates'>) => { error?: string };
  addMultipleHabits: (newHabits: Omit<Habit, 'id' | 'streak' | 'completedDates'>[]) => void;
  updateHabit: (id: string, changes: Partial<Omit<Habit, 'id' | 'completedDates' | 'streak'>>) => { error?: string };
  moveHabit: (id: string, swapWithId: string) => void;
  archiveHabit: (id: string) => void;
  restoreHabit: (id: string) => void;
  pauseHabit: (id: string, startDate: string, endDate: string | null) => { error?: string };
  resumeHabit: (id: string, date?: string) => void;
  recordHabitLog: (id: string, log: HabitLog) => { error?: string };
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
    remainingToday: number;
    completionRate: number;
    bestStreak: number;
    totalCompletions: number;
  };
}

const STORAGE_KEYS = {
  HABITS: '@daymark_habits_v1',
  ONBOARDING: '@daymark_onboarding_v1',
};

const INITIAL_HABITS: Habit[] = [];

const HabitContext = createContext<HabitContextType | undefined>(undefined);

export const useHabits = () => {
  const context = useContext(HabitContext);
  if (!context) {
    throw new Error('useHabits must be used within a HabitProvider');
  }
  return context;
};

export const HabitProvider = ({ children }: { children: ReactNode }) => {
  const { deviceOwnerId, isReady } = useDeviceIdentity();
  const { isPro } = useSubscription();
  const { preferences } = usePreferences();
  const [habits, setHabits] = useState<Habit[]>(INITIAL_HABITS);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean>(false);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
  const [isCelebrationVisible, setIsCelebrationVisible] = useState<boolean>(false);
  const habitsRef = useRef(habits);
  const deviceOwnerIdRef = useRef(deviceOwnerId);

  useEffect(() => {
    habitsRef.current = habits;
    deviceOwnerIdRef.current = deviceOwnerId;
  });

  const todayStr = dateKeyInTimezone(new Date(), preferences.timezone);
  const todayReferenceDate = useMemo(() => parseLocalDate(todayStr) ?? new Date(), [todayStr]);

  const triggerCelebration = () => setIsCelebrationVisible(true);
  const dismissCelebration = () => setIsCelebrationVisible(false);

  // Load recorded data from local AsyncStorage
  useEffect(() => {
    if (!isReady) return;
    let isMounted = true;

    const loadData = async () => {
      try {
        const [savedHabitsJson, savedOnboarding] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.HABITS),
          AsyncStorage.getItem(STORAGE_KEYS.ONBOARDING),
        ]);

        let localHabits: Habit[] = [];
        if (savedHabitsJson) {
          try {
            const parsed = JSON.parse(savedHabitsJson);
            if (Array.isArray(parsed) && parsed.length > 0) {
              localHabits = parsed.map((item: Habit) =>
                item.habitKind !== 'quit' && (item.trackingMethod === 'count' || item.trackingMethod === 'measurable')
                  ? { ...item, trackingMethod: 'yes_no' as const }
                  : item
              );
              if (isMounted) {
                setHabits(localHabits);
                habitsRef.current = localHabits;
              }
            }
          } catch (parseErr) {
            console.warn('Failed to parse cached habits:', parseErr);
          }
        }

        const isFreshInstall = savedHabitsJson === null && savedOnboarding === null;
        if (savedOnboarding !== null && isMounted) {
          setHasCompletedOnboarding(savedOnboarding === 'true');
        } else if (!isFreshInstall && localHabits.length > 0 && isMounted) {
          setHasCompletedOnboarding(true);
        } else if (isMounted) {
          setHasCompletedOnboarding(false);
        }
      } catch (err) {
        console.error('Failed to load recorded habits:', err);
      } finally {
        if (isMounted) {
          setIsLoadingData(false);
        }
      }
    };

    void loadData();
    return () => { isMounted = false; };
  }, [isReady]);

  const saveHabits = async (updated: Habit[]) => {
    setHabits(updated);
    habitsRef.current = updated;
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.HABITS, JSON.stringify(updated));
    } catch (err) {
      console.error('Failed to save recorded habits locally:', err);
    }
  };

  const refreshReminderSchedule = async (habit: Habit, fallbackHabits: Habit[], previous?: Habit) => {
    try {
      const reminders = await replaceLocalHabitReminders(
        { ...habit, notificationsEnabled: preferences.notifications.daily, soundEnabled: preferences.soundEnabled },
        previous?.reminders,
      );
      const saved = await AsyncStorage.getItem(STORAGE_KEYS.HABITS);
      let latest: Habit[] = fallbackHabits;
      if (saved) {
        try { latest = JSON.parse(saved) as Habit[]; } catch { /* Keep the in-memory snapshot. */ }
      }
      const current = latest.find(item => item.id === habit.id);
      if (!current) return;
      const changed = { ...current, reminders };
      const updated = latest.map(item => item.id === habit.id ? changed : item);
      await saveHabits(updated);
    } catch (error) {
      console.warn('Habit reminders remain saved but could not be scheduled:', error);
    }
  };

  const saveAndUpdateReminders = (updated: Habit[], changed: Habit) => {
    const previous = habits.find(item => item.id === changed.id);
    void saveHabits(updated);
    if (!previous || JSON.stringify(previous.reminders) !== JSON.stringify(changed.reminders)
      || JSON.stringify(previous.schedule) !== JSON.stringify(changed.schedule)
      || JSON.stringify(previous.pausedPeriods) !== JSON.stringify(changed.pausedPeriods)
      || Boolean(previous.archivedAt) !== Boolean(changed.archivedAt)) {
      void refreshReminderSchedule(changed, updated, previous);
    }
  };

  const lastReminderSettingsRef = useRef({ enabled: preferences.notifications.daily, sound: preferences.soundEnabled });
  const hasInitializedRemindersRef = useRef(false);
  useEffect(() => {
    if (isLoadingData) return;
    const previous = lastReminderSettingsRef.current;
    const prefChanged = previous.enabled !== preferences.notifications.daily || previous.sound !== preferences.soundEnabled;
    if (!hasInitializedRemindersRef.current || prefChanged) {
      hasInitializedRemindersRef.current = true;
      lastReminderSettingsRef.current = { enabled: preferences.notifications.daily, sound: preferences.soundEnabled };
      void cleanupDuplicateNotificationsAsync(habits);
      habits.filter(habit => !habit.archivedAt && habit.reminders?.length).forEach(habit => { void refreshReminderSchedule(habit, habits, habit); });
      void schedulePendingHabitsReminderAsync(habits, {
        notificationsEnabled: preferences.notifications.daily,
        soundEnabled: preferences.soundEnabled,
        todayDateStr: todayStr,
        timezone: preferences.timezone,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferences.notifications.daily, preferences.soundEnabled, isLoadingData]);

  const toggleSideEffectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleDeferredToggleEffects = useCallback((shouldReschedulePendingReminder: boolean) => {
    if (toggleSideEffectTimerRef.current) {
      clearTimeout(toggleSideEffectTimerRef.current);
    }
    toggleSideEffectTimerRef.current = setTimeout(() => {
      toggleSideEffectTimerRef.current = null;
      const latestHabits = habitsRef.current;
      void AsyncStorage.setItem(STORAGE_KEYS.HABITS, JSON.stringify(latestHabits)).catch(() => { });

      if (shouldReschedulePendingReminder) {
        void schedulePendingHabitsReminderAsync(latestHabits, {
          notificationsEnabled: preferences.notifications.daily,
          soundEnabled: preferences.soundEnabled,
          todayDateStr: todayStr,
          timezone: preferences.timezone,
        });
      }
    }, 260);
  }, [preferences.notifications.daily, preferences.soundEnabled, preferences.timezone, todayStr]);

  const toggleHabit = (id: string, dateStr: string = todayStr) => {
    const target = habitsRef.current.find(habit => habit.id === id);
    if (!target || target.archivedAt || target.habitKind === 'quit' || !canLogHabitOnDate(target, dateStr, todayReferenceDate)) return;
    const completed = target.completedDates.includes(dateStr);
    const logs = (target.logs ?? []).filter(log => log.date !== dateStr);
    const targetVal = target.targetValue && target.targetValue > 0 ? target.targetValue : 1;
    const expandedStart = !completed && (!target.startDate || dateStr < target.startDate) ? dateStr : target.startDate;
    const expandedEffective =
      !completed &&
      !(target.configurationHistory?.length) &&
      target.configurationEffectiveFrom &&
      dateStr < target.configurationEffectiveFrom
        ? dateStr
        : target.configurationEffectiveFrom;
    const updatedHabit: Habit = {
      ...target,
      startDate: expandedStart,
      configurationEffectiveFrom: expandedEffective,
      completedDates: completed ? target.completedDates.filter(date => date !== dateStr) : [...target.completedDates, dateStr].sort(),
      logs: completed ? logs : [...logs, { date: dateStr, outcome: 'completed', value: targetVal, createdAt: new Date().toISOString() }],
    };
    const next = habitsRef.current.map(habit => habit.id === id ? updatedHabit : habit);
    habitsRef.current = next;
    setHabits(next);
    if (dateStr === todayStr && !completed) {
      const scheduledToday = next.filter(habit => !habit.archivedAt && isScheduledOnDate(habit, todayStr));
      if (scheduledToday.length > 0 && scheduledToday.every(habit => getHabitDayStatus(habit, todayStr, todayReferenceDate) === 'completed')) {
        setIsCelebrationVisible(true);
      }
    }
    scheduleDeferredToggleEffects(dateStr === todayStr);
  };

  const addHabit = (newHabit: Omit<Habit, 'id' | 'streak' | 'completedDates'>) => {
    const activeHabitsList = habitsRef.current;
    const activeCount = activeHabitsList.filter(habit => !habit.archivedAt).length;
    if (!canCreateHabit(activeCount, isPro)) return { error: 'Free plans can have up to 5 active habits. Archive one or upgrade to Pro.' };
    const createdAt = todayStr;
    const habitId = `${deviceOwnerIdRef.current}_h_${Date.now()}`;
    const created: Habit = {
      ...newHabit,
      id: habitId,
      description: newHabit.description ?? '',
      habitKind: newHabit.habitKind ?? 'positive',
      trackingMethod: newHabit.trackingMethod ?? 'yes_no',
      targetValue: newHabit.targetValue ?? 1,
      schedule: newHabit.schedule ?? (newHabit.targetFrequency ? normalizeSchedule(newHabit) : { frequency: 'daily' }),
      startDate: newHabit.startDate ?? createdAt,
      endDate: newHabit.endDate ?? null,
      archivedAt: null,
      pausedPeriods: newHabit.pausedPeriods ?? [],
      logs: [],
      reminders: newHabit.reminders ?? [],
      configurationHistory: [],
      configurationEffectiveFrom: createdAt,
      sortOrder: newHabit.sortOrder ?? activeCount,
      streak: 0,
      completedDates: [],
    };
    const updated = [created, ...activeHabitsList];
    saveAndUpdateReminders(updated, created);
    void schedulePendingHabitsReminderAsync(updated, {
      notificationsEnabled: preferences.notifications.daily,
      soundEnabled: preferences.soundEnabled,
      todayDateStr: todayStr,
      timezone: preferences.timezone,
    });
    return {};
  };

  const addMultipleHabits = (newHabits: Omit<Habit, 'id' | 'streak' | 'completedDates'>[]) => {
    const activeHabitsList = habitsRef.current;
    const activeCount = activeHabitsList.filter(habit => !habit.archivedAt).length;
    const allowedCount = isPro ? newHabits.length : Math.max(0, 5 - activeCount);
    const habitsToCreate = newHabits.slice(0, allowedCount);
    if (!habitsToCreate.length) return;
    const prefix = `${deviceOwnerIdRef.current}_onboard_${Date.now()}`;
    const createdList = habitsToCreate.map((habit, index): Habit => ({
      ...habit,
      id: `${prefix}_${index}`,
      description: habit.description ?? '',
      habitKind: habit.habitKind ?? 'positive',
      trackingMethod: habit.trackingMethod ?? 'yes_no',
      targetValue: habit.targetValue ?? 1,
      schedule: habit.schedule ?? (habit.targetFrequency ? normalizeSchedule(habit) : { frequency: 'daily' }),
      startDate: habit.startDate ?? todayStr,
      endDate: habit.endDate ?? null,
      archivedAt: null,
      pausedPeriods: habit.pausedPeriods ?? [],
      logs: [],
      reminders: habit.reminders ?? [],
      configurationHistory: [],
      configurationEffectiveFrom: habit.startDate ?? todayStr,
      sortOrder: activeCount + index,
      streak: 0,
      completedDates: [],
    }));
    const updated = [...createdList, ...activeHabitsList];
    void saveHabits(updated);
    void schedulePendingHabitsReminderAsync(updated, {
      notificationsEnabled: preferences.notifications.daily,
      soundEnabled: preferences.soundEnabled,
      todayDateStr: todayStr,
      timezone: preferences.timezone,
    });
  };

  const snapshot = (habit: Habit, effectiveFrom: string): HabitConfigurationSnapshot => ({
    effectiveFrom,
    name: habit.name,
    description: habit.description ?? '',
    category: habit.category,
    color: habit.color,
    icon: habit.icon,
    habitKind: habit.habitKind ?? 'positive',
    trackingMethod: habit.trackingMethod ?? 'yes_no',
    targetValue: habit.targetValue ?? 1,
    unit: habit.unit ?? '',
    targetFrequency: habit.targetFrequency,
    schedule: habit.schedule ?? { frequency: 'daily' },
    startDate: habit.startDate ?? todayStr,
    endDate: habit.endDate ?? null,
  });

  const updateHabit = (id: string, changes: Partial<Omit<Habit, 'id' | 'completedDates' | 'streak'>>) => {
    const oldHabit = habits.find(habit => habit.id === id);
    if (!oldHabit) return { error: 'Habit not found.' };
    if (changes.name !== undefined && !changes.name.trim()) return { error: 'Habit name cannot be empty.' };
    const scheduleChanged = ['schedule', 'targetFrequency', 'trackingMethod', 'targetValue', 'habitKind', 'startDate', 'endDate']
      .some(key => key in changes);
    const nextHabit: Habit = {
      ...oldHabit,
      ...changes,
      configurationHistory: scheduleChanged
        ? [...(oldHabit.configurationHistory ?? []), snapshot(oldHabit, oldHabit.configurationEffectiveFrom ?? oldHabit.startDate ?? todayStr)]
        : oldHabit.configurationHistory,
      configurationEffectiveFrom: scheduleChanged ? todayStr : oldHabit.configurationEffectiveFrom,
    };
    const updated = habits.map(habit => habit.id === id ? nextHabit : habit);
    saveAndUpdateReminders(updated, nextHabit);
    return {};
  };

  const moveHabit = (id: string, swapWithId: string) => {
    const ordered = habits.filter(habit => !habit.archivedAt).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const index = ordered.findIndex(habit => habit.id === id);
    const nextIndex = ordered.findIndex(habit => habit.id === swapWithId);
    if (index < 0 || nextIndex < 0 || index === nextIndex) return;
    const current = ordered[index];
    const adjacent = ordered[nextIndex];
    const currentOrder = current.sortOrder ?? index;
    const adjacentOrder = adjacent.sortOrder ?? nextIndex;
    const updated = habits.map(habit =>
      habit.id === current.id ? { ...habit, sortOrder: adjacentOrder }
        : habit.id === adjacent.id ? { ...habit, sortOrder: currentOrder }
          : habit,
    );
    void saveHabits(updated);
  };

  const archiveHabit = (id: string) => {
    const habit = habits.find(item => item.id === id);
    if (!habit) return;
    const archived = { ...habit, archivedAt: new Date().toISOString() };
    saveAndUpdateReminders(habits.map(item => item.id === id ? archived : item), archived);
  };

  const restoreHabit = (id: string) => {
    const habit = habits.find(item => item.id === id);
    if (!habit) return;
    const activeCount = habits.filter(item => !item.archivedAt).length;
    if (!canCreateHabit(activeCount, isPro)) return;
    const restored = { ...habit, archivedAt: null };
    saveAndUpdateReminders(habits.map(item => item.id === id ? restored : item), restored);
  };

  const pauseHabit = (id: string, startDate: string, endDate: string | null) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || (endDate && endDate < startDate)) return { error: 'Choose a valid pause date range.' };
    const habit = habits.find(item => item.id === id);
    if (!habit) return { error: 'Habit not found.' };
    const cleanPeriods = (habit.pausedPeriods ?? []).filter(period => {
      if (period.endDate && period.endDate < startDate) return true;
      if (endDate && period.startDate > endDate) return true;
      return false;
    });
    const paused: Habit = { ...habit, pausedPeriods: [...cleanPeriods, { startDate, endDate }] };
    saveAndUpdateReminders(habits.map(item => item.id === id ? paused : item), paused);
    return {};
  };

  const resumeHabit = (id: string, date = todayStr) => {
    const habit = habits.find(item => item.id === id);
    if (!habit) return;
    const paused: Habit = {
      ...habit,
      pausedPeriods: (habit.pausedPeriods ?? []).flatMap(period => {
        if (date < period.startDate || (period.endDate && date > period.endDate)) return [period];
        if (date <= period.startDate) return [];
        return [{ ...period, endDate: addLocalDays(date, -1) }];
      }),
    };
    saveAndUpdateReminders(habits.map(item => item.id === id ? paused : item), paused);
  };

  const recordHabitLog = (id: string, log: HabitLog) => {
    if (!parseLocalDate(log.date) || log.date > todayStr) return { error: 'Select a valid date that is not in the future.' };
    if (log.value !== undefined && (!Number.isFinite(log.value) || log.value < 0)) return { error: 'Enter a valid non-negative value.' };
    const habit = habits.find(item => item.id === id);
    if (!habit || habit.archivedAt) return { error: 'This habit is not active.' };
    if (!canLogHabitOnDate(habit, log.date, todayReferenceDate)) return { error: 'This habit is not scheduled for the selected date, or it is paused.' };
    if (log.outcome === 'lapse' && habit.habitKind !== 'quit') return { error: 'Only quit habits can record a lapse.' };
    const updatedLog: HabitLog = { ...log, updatedAt: new Date().toISOString() };
    const logs = [...(habit.logs ?? []).filter(item => item.date !== log.date), updatedLog].sort((a, b) => a.date.localeCompare(b.date));
    const isSuccessful = habit.habitKind === 'quit'
      ? log.outcome !== 'lapse'
      : habit.trackingMethod === 'count' || habit.trackingMethod === 'measurable'
        ? (log.value ?? 0) >= (habit.targetValue ?? 1)
        : log.outcome !== 'lapse' && log.outcome !== undefined;
    const completedDates = isSuccessful
      ? Array.from(new Set([...habit.completedDates, log.date])).sort()
      : habit.completedDates.filter(value => value !== log.date);
    const expandedStart = !habit.startDate || log.date < habit.startDate ? log.date : habit.startDate;
    const expandedEffective =
      !(habit.configurationHistory?.length) &&
      habit.configurationEffectiveFrom &&
      log.date < habit.configurationEffectiveFrom
        ? log.date
        : habit.configurationEffectiveFrom;
    const changed = { ...habit, startDate: expandedStart, configurationEffectiveFrom: expandedEffective, logs, completedDates };
    const updated = habits.map(item => item.id === id ? changed : item);
    if (log.date === todayStr) {
      const scheduled = updated.filter(item => !item.archivedAt && isScheduledOnDate(item, todayStr));
      if (scheduled.length && scheduled.every(item => getHabitDayStatus(item, todayStr, todayReferenceDate) === 'completed')) setIsCelebrationVisible(true);
    }
    saveAndUpdateReminders(updated, changed);
    return {};
  };

  const deleteHabit = (id: string) => {
    const target = habitsRef.current.find(habit => habit.id === id);
    if (target?.reminders?.length) void refreshReminderSchedule({ ...target, archivedAt: new Date().toISOString() }, habitsRef.current, target);

    const updated = habitsRef.current.filter(habit => habit.id !== id);
    void saveHabits(updated);
    void cleanupDuplicateNotificationsAsync(updated);
    void schedulePendingHabitsReminderAsync(updated, {
      notificationsEnabled: preferences.notifications.daily,
      soundEnabled: preferences.soundEnabled,
      todayDateStr: todayStr,
      timezone: preferences.timezone,
    });
  };

  const completeOnboarding = () => {
    setHasCompletedOnboarding(true);
    AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING, 'true').catch(() => { });
  };

  const restartOnboarding = () => {
    setHasCompletedOnboarding(false);
    AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING, 'false').catch(() => { });
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

  const archivedHabits = useMemo(() => habits.filter(habit => Boolean(habit.archivedAt)), [habits]);
  const activeHabits = useMemo(() => habits.filter(habit => !habit.archivedAt), [habits]);
  const streakStatsMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof calculateStreakStats>>();
    for (const habit of activeHabits) {
      map.set(habit.id, calculateStreakStats(habit, todayReferenceDate));
    }
    return map;
  }, [activeHabits, todayReferenceDate]);
  const sortedActiveHabits = useMemo(() => [...activeHabits].sort((a, b) => {
    if (preferences.dashboardSort === 'alphabetical') return a.name.localeCompare(b.name);
    if (preferences.dashboardSort === 'consistency') {
      return (streakStatsMap.get(b.id)?.currentStreak ?? 0) - (streakStatsMap.get(a.id)?.currentStreak ?? 0);
    }
    if (preferences.dashboardSort === 'completion') {
      return calculateCompletionStats(b, addLocalDays(todayStr, -29), todayStr, todayReferenceDate).percentage
        - calculateCompletionStats(a, addLocalDays(todayStr, -29), todayStr, todayReferenceDate).percentage;
    }
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  }), [activeHabits, preferences.dashboardSort, streakStatsMap, todayStr, todayReferenceDate]);
  const habitsWithCurrentStreak = useMemo(() => sortedActiveHabits.map(habit => ({
    ...habit,
    streak: streakStatsMap.get(habit.id)?.currentStreak ?? 0,
  })), [sortedActiveHabits, streakStatsMap]);
  const scheduledTodayHabits = useMemo(() => sortedActiveHabits.filter(habit => isScheduledOnDate(habit, todayStr)), [sortedActiveHabits, todayStr]);
  const completedToday = scheduledTodayHabits.filter(habit => getHabitDayStatus(habit, todayStr, todayReferenceDate) === 'completed').length;
  const totalToday = scheduledTodayHabits.length;
  const completionRate = totalToday > 0 ? Math.round((completedToday / totalToday) * 100) : 0;
  const bestStreak = useMemo(
    () => (activeHabits.length > 0 ? Math.max(...activeHabits.map(habit => streakStatsMap.get(habit.id)?.bestStreak ?? 0)) : 0),
    [activeHabits, streakStatsMap],
  );
  const totalCompletions = activeHabits.reduce((acc, habit) => acc + habit.completedDates.length, 0);

  useEffect(() => {
    if (isLoadingData) return;
    const timer = setTimeout(() => {
      DaymarkTodayWidget.updateSnapshot({
        completed: completedToday,
        total: totalToday,
        habits: scheduledTodayHabits.slice(0, 3).map(habit => {
          const completed = getHabitDayStatus(habit, todayStr, todayReferenceDate) === 'completed';
          return `${completed ? '✓' : '○'} ${habit.name}`;
        }),
        dateLabel: new Date(`${todayStr}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
      });
    }, 350);
    return () => { clearTimeout(timer); };
  }, [isLoadingData, completedToday, totalToday, scheduledTodayHabits, todayStr, todayReferenceDate]);

  return (
    <HabitContext.Provider
      value={{
        habits: habitsWithCurrentStreak,
        archivedHabits,
        allHabits: habits,
        toggleHabit,
        addHabit,
        addMultipleHabits,
        updateHabit,
        moveHabit,
        archiveHabit,
        restoreHabit,
        pauseHabit,
        resumeHabit,
        recordHabitLog,
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
          remainingToday: Math.max(0, totalToday - completedToday),
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
