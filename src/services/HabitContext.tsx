// src/services/HabitContext.tsx
import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { supabase, isSupabaseConfigured } from './supabase';
import { useAuth } from './AuthProvider';
import { canCreateHabit } from './subscriptionEntitlements';
import { useSubscription } from './SubscriptionProvider';
import { addLocalDays, calculateCompletionStats, calculateStreakStats, canLogHabitOnDate, getHabitDayStatus, isScheduledOnDate, normalizeSchedule, parseLocalDate } from '../domain/habitEngine';
import { HabitConfigurationSnapshot, HabitKind, HabitLog, HabitPause, HabitReminder, HabitSchedule, TrackingMethod } from '../domain/habitTypes';
import { replaceLocalHabitReminders, cleanupDuplicateNotificationsAsync, schedulePendingHabitsReminderAsync } from './localReminders';
import { usePreferences } from './PreferencesContext';
import { dateKeyInTimezone } from '../domain/preferencesEngine';
import DaymarkTodayWidget from '../widgets/DaymarkTodayWidget';
import { readStorageJson, resolveCloudAuth, writeStorageJson } from './cloudSyncHelpers';

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
  ensureHabitsSynced: (habitIds: string[]) => Promise<void>;
  syncAllHabitsNow: () => Promise<void>;
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
  DELETED_HABITS: '@daymark_deleted_habits_v1',
};
const pendingHabitsKey = (userId: string) => `@daymark_pending_habits_v1_${userId}`;
const deletedHabitsKey = (userId?: string) => userId ? `@daymark_deleted_habits_v2_${userId}` : STORAGE_KEYS.DELETED_HABITS;
const userHabitsStorageKey = (userId: string) => `@daymark_habits_user_${userId}`;

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
  const { user, session } = useAuth();
  const { isPro } = useSubscription();
  const { preferences } = usePreferences();
  const [habits, setHabits] = useState<Habit[]>(INITIAL_HABITS);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean>(false);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
  const [isCelebrationVisible, setIsCelebrationVisible] = useState<boolean>(false);
  const isLoadedRef = useRef(false);
  const deletedHabitIdsRef = useRef<string[]>([]);
  const userRef = useRef(user);
  const sessionRef = useRef(session);
  const habitsRef = useRef(habits);
  const syncedHabitIdsRef = useRef<Set<string>>(new Set());
  const [hasPendingSync, setHasPendingSync] = useState(false);
  useEffect(() => {
    userRef.current = user;
    sessionRef.current = session;
    habitsRef.current = habits;
  });
  const syncHabitToCloudRef = useRef<(habit: Habit) => Promise<boolean>>(async () => false);

  const todayStr = dateKeyInTimezone(new Date(), preferences.timezone);
  const todayReferenceDate = useMemo(() => parseLocalDate(todayStr) ?? new Date(), [todayStr]);

  const triggerCelebration = () => setIsCelebrationVisible(true);
  const dismissCelebration = () => setIsCelebrationVisible(false);

  // Load recorded data from persistent storage (and Supabase if configured)
  useEffect(() => {
    let isMounted = true;
    syncedHabitIdsRef.current.clear();

    const loadData = async () => {
      try {
        // 1. Load cached habits, onboarding state, and tombstones for deleted habits
        const activeUid = user?.id && !user.isGuest ? user.id : undefined;
        const userHabitsKey = activeUid ? userHabitsStorageKey(activeUid) : null;
        const userOnboardingKey = activeUid ? `@daymark_onboarding_v2_${activeUid}` : null;
        const delKey = deletedHabitsKey(activeUid);
        const [savedHabitsJson, savedUserHabitsJson, savedOnboarding, savedUserOnboarding, savedDeletedUserJson, savedDeletedLegacyJson] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.HABITS),
          userHabitsKey ? AsyncStorage.getItem(userHabitsKey) : Promise.resolve(null),
          AsyncStorage.getItem(STORAGE_KEYS.ONBOARDING),
          userOnboardingKey ? AsyncStorage.getItem(userOnboardingKey) : Promise.resolve(null),
          AsyncStorage.getItem(delKey),
          delKey !== STORAGE_KEYS.DELETED_HABITS ? AsyncStorage.getItem(STORAGE_KEYS.DELETED_HABITS) : Promise.resolve(null),
        ]);

        let deletedHabitIds: string[] = [];
        const rawDeleted = savedDeletedUserJson ?? savedDeletedLegacyJson;
        if (rawDeleted) {
          try {
            const parsed = JSON.parse(rawDeleted);
            if (Array.isArray(parsed)) {
              deletedHabitIds = parsed;
              deletedHabitIdsRef.current = parsed;
            }
          } catch (delErr) {
            console.warn('Failed to parse deleted habit IDs:', delErr);
          }
        }

        let localHabits: Habit[] = [];
        const hasUserScopedHabits = Boolean(savedUserHabitsJson);
        const rawJsonToParse = (user && !user.isGuest && savedUserHabitsJson) ? savedUserHabitsJson : savedHabitsJson;
        if (rawJsonToParse) {
          try {
            const parsed = JSON.parse(rawJsonToParse);
            if (Array.isArray(parsed) && parsed.length > 0) {
              localHabits = parsed
                .filter((item: Habit) => !deletedHabitIds.includes(item.id))
                .map((item: Habit) => (item.habitKind !== 'quit' && (item.trackingMethod === 'count' || item.trackingMethod === 'measurable'))
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

        // New installs start empty. Onboarding only adds habits the user explicitly selected.
        if (localHabits.length === 0 && (!user || user.isGuest)) {
          localHabits = INITIAL_HABITS;
          if (isMounted) {
            setHabits(INITIAL_HABITS);
            habitsRef.current = INITIAL_HABITS;
          }
          await AsyncStorage.setItem(STORAGE_KEYS.HABITS, JSON.stringify(INITIAL_HABITS)).catch(() => { });
        }

        const isFreshInstall = savedHabitsJson === null && savedOnboarding === null && savedUserOnboarding === null;

        if (savedUserOnboarding === 'true' && isMounted) {
          setHasCompletedOnboarding(true);
        } else if (savedOnboarding !== null && isMounted) {
          setHasCompletedOnboarding(savedOnboarding === 'true');
        } else if (!isFreshInstall && localHabits.length > 0 && isMounted) {
          // Existing installs predate the persisted onboarding flag; do not restart onboarding on upgrade.
          setHasCompletedOnboarding(true);
        } else if (isMounted) {
          setHasCompletedOnboarding(false);
        }

        // 2. If user is logged in with Supabase, merge with cloud and preserve all completed dates & streaks!
        const cloudAuth = await resolveCloudAuth(user, session);

        if (cloudAuth) {
          if (cloudAuth.session.user?.user_metadata?.onboarding_completed) {
            if (isMounted) setHasCompletedOnboarding(true);
            await AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING, 'true').catch(() => { });
            await AsyncStorage.setItem(`@daymark_onboarding_v2_${cloudAuth.userId}`, 'true').catch(() => { });
          }

          if (deletedHabitIds.length > 0) {
            const { error: delCloudErr } = await supabase
              .from('habits')
              .delete()
              .eq('user_id', cloudAuth.userId)
              .in('id', deletedHabitIds);
            if (!delCloudErr) {
              deletedHabitIdsRef.current = [];
              deletedHabitIds = [];
              await AsyncStorage.setItem(delKey, '[]').catch(() => { });
            }
          }

          const pendingIds = await readStorageJson<string[]>(pendingHabitsKey(cloudAuth.userId), []);

          let { data: cloudRows, error } = await supabase
            .from('habits')
            .select('*, habit_logs(*), habit_reminders(*)')
            .eq('user_id', cloudAuth.userId)
            .order('created_at', { ascending: false });
          if (error) {
            // Older deployments may have only the original habits table; preserve access to that data.
            const fallback = await supabase.from('habits').select('*').eq('user_id', cloudAuth.userId).order('created_at', { ascending: false });
            cloudRows = fallback.data;
            error = fallback.error;
          }

          if (!error && Array.isArray(cloudRows) && cloudRows.length > 0 && isMounted) {
            const habitsNeedingCloudPush: Habit[] = [];
            const cloudHabits: Habit[] = cloudRows.map(row => {
              const cloudDates: string[] = Array.isArray(row.completed_dates) ? row.completed_dates : [];
              const localMatch = localHabits.find(lh => lh.id === row.id);
              const localDates = localMatch ? localMatch.completedDates : [];
              const mergedDates = Array.from(new Set([...cloudDates, ...localDates])).sort();
              const localLogs = localMatch?.logs ?? [];
              const cloudLogs: HabitLog[] = Array.isArray(row.habit_logs) ? row.habit_logs.map((log: any) => ({
                date: log.log_date,
                value: typeof log.value === 'number' ? log.value : undefined,
                outcome: log.outcome === 'lapse' ? 'lapse' : 'completed',
                note: log.note || '',
                createdAt: log.created_at,
                updatedAt: log.updated_at,
              })) : [];
              const mergedLogs = Array.from(new Map([...cloudLogs, ...localLogs].map(log => [log.date, log])).values());
              const cloudReminders: HabitReminder[] = Array.isArray(row.habit_reminders) ? row.habit_reminders.map((reminder: any) => ({
                id: reminder.id,
                hour: Number(reminder.hour),
                minute: Number(reminder.minute),
                weekdays: Array.isArray(reminder.weekdays) ? reminder.weekdays.map(Number) : [1, 2, 3, 4, 5, 6, 7],
                enabled: Boolean(reminder.enabled),
                notificationIds: Array.isArray(reminder.notification_ids) ? reminder.notification_ids : [],
              })) : [];

              const habitSchedule = row.schedule && typeof row.schedule === 'object' ? row.schedule : undefined;
              const habitPaused = Array.isArray(row.paused_periods) && row.paused_periods.length > 0 ? row.paused_periods : localMatch?.pausedPeriods ?? [];
              const habitStart = row.start_date || localMatch?.startDate || todayStr;

              const streakStats = calculateStreakStats({
                completedDates: mergedDates,
                targetFrequency: row.target_frequency || 'Daily',
                schedule: habitSchedule,
                startDate: habitStart,
                pausedPeriods: habitPaused,
              }, todayReferenceDate);

              const mergedHabit: Habit = {
                id: row.id,
                name: row.name,
                category: row.category,
                color: row.color,
                icon: row.icon as keyof typeof Ionicons.glyphMap,
                streak: streakStats.currentStreak,
                completedDates: mergedDates,
                targetFrequency: row.target_frequency || 'Daily',
                description: row.description || '',
                habitKind: row.habit_kind === 'quit' ? 'quit' : 'positive',
                trackingMethod: row.habit_kind === 'quit' ? 'yes_no' : 'yes_no',
                targetValue: Number(row.target_value) > 0 ? Number(row.target_value) : 1,
                unit: row.unit || '',
                schedule: habitSchedule,
                startDate: habitStart,
                endDate: row.end_date || null,
                archivedAt: row.archived_at || null,
                pausedPeriods: habitPaused,
                logs: mergedLogs,
                reminders: Array.isArray(row.reminders) && row.reminders.length > 0
                  ? row.reminders
                  : (cloudReminders.length ? cloudReminders : localMatch?.reminders ?? []),
                configurationHistory: Array.isArray(row.configuration_history) ? row.configuration_history : localMatch?.configurationHistory ?? [],
                configurationEffectiveFrom: row.configuration_effective_from || localMatch?.configurationEffectiveFrom || row.start_date || todayStr,
                sortOrder: Number(row.sort_order ?? localMatch?.sortOrder ?? 0),
              };

              const needsPush = pendingIds.includes(row.id)
                || mergedDates.length > cloudDates.length
                || mergedLogs.length > cloudLogs.length;
              if (needsPush) {
                habitsNeedingCloudPush.push(mergedHabit);
              } else {
                syncedHabitIdsRef.current.add(row.id);
              }
              return mergedHabit;
            });

            // Keep authentic offline/pending habits for this user, but avoid injecting unowned guest starter habits.
            const cloudIds = new Set(cloudHabits.map(habit => habit.id));
            const offlineHabitsToKeep = localHabits.filter(local =>
              !cloudIds.has(local.id) && (
                hasUserScopedHabits ||
                pendingIds.includes(local.id) ||
                (!local.id.startsWith('local_') && !local.id.includes('onboard_'))
              )
            );
            const mergedCloudHabits = [...cloudHabits, ...offlineHabitsToKeep];

            setHabits(mergedCloudHabits);
            habitsRef.current = mergedCloudHabits;
            await AsyncStorage.setItem(STORAGE_KEYS.HABITS, JSON.stringify(mergedCloudHabits));
            await AsyncStorage.setItem(userHabitsStorageKey(cloudAuth.userId), JSON.stringify(mergedCloudHabits));
            await AsyncStorage.setItem(`@daymark_onboarding_v2_${cloudAuth.userId}`, 'true').catch(() => { });
            setHasCompletedOnboarding(true);
            await AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING, 'true').catch(() => { });

            for (const ch of [...habitsNeedingCloudPush, ...offlineHabitsToKeep]) {
              await syncHabitToCloudRef.current(ch);
            }
          } else if (!error && Array.isArray(cloudRows) && cloudRows.length === 0) {
            try {
              const { data: prefRow } = await supabase
                .from('user_preferences')
                .select('user_id')
                .eq('user_id', cloudAuth.userId)
                .maybeSingle();
              if (prefRow && isMounted) {
                setHasCompletedOnboarding(true);
                await AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING, 'true').catch(() => { });
                await AsyncStorage.setItem(`@daymark_onboarding_v2_${cloudAuth.userId}`, 'true').catch(() => { });
              }
            } catch {
              // ignore
            }

            if (localHabits.length > 0) {
              // Preserve existing timestamped IDs so any local Goals/Routines linking to them stay valid!
              const migratedHabits: Habit[] = localHabits.map(h => {
                const hasUniqueId = h.id.startsWith(cloudAuth.userId) || /_\d{10,}/.test(h.id);
                return {
                  ...h,
                  id: hasUniqueId ? h.id : `${cloudAuth.userId}_${h.id}`,
                };
              });
              if (isMounted) {
                setHabits(migratedHabits);
                habitsRef.current = migratedHabits;
              }
              await AsyncStorage.setItem(STORAGE_KEYS.HABITS, JSON.stringify(migratedHabits)).catch(() => { });
              await AsyncStorage.setItem(userHabitsStorageKey(cloudAuth.userId), JSON.stringify(migratedHabits)).catch(() => { });
              for (const mh of migratedHabits) {
                await syncHabitToCloudRef.current(mh);
              }
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

    void loadData();

    return () => {
      isMounted = false;
    };
  }, [user, session, todayStr, todayReferenceDate]);

  const saveHabits = async (updated: Habit[]) => {
    setHabits(updated);
    habitsRef.current = updated;
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.HABITS, JSON.stringify(updated));
      const activeUid = userRef.current?.id && !userRef.current.isGuest
        ? userRef.current.id
        : sessionRef.current?.user?.id;
      if (activeUid) {
        await AsyncStorage.setItem(userHabitsStorageKey(activeUid), JSON.stringify(updated));
      }
    } catch (err) {
      console.error('Failed to save recorded habits locally:', err);
    }
  };

  const markHabitPending = useCallback(async (userId: string, habitId: string) => {
    setHasPendingSync(true);
    const existing = await readStorageJson<string[]>(pendingHabitsKey(userId), []);
    if (!existing.includes(habitId)) {
      await writeStorageJson(pendingHabitsKey(userId), [...existing, habitId]).catch(() => { });
    }
  }, []);

  const clearHabitPending = useCallback(async (userId: string, habitId: string) => {
    const existing = await readStorageJson<string[]>(pendingHabitsKey(userId), []);
    if (existing.includes(habitId)) {
      const next = existing.filter(id => id !== habitId);
      await writeStorageJson(pendingHabitsKey(userId), next).catch(() => { });
      setHasPendingSync(next.length > 0);
    } else {
      setHasPendingSync(false);
    }
  }, []);

  const syncHabitToCloud = useCallback(async (habit: Habit): Promise<boolean> => {
    const cloudAuth = await resolveCloudAuth(userRef.current, sessionRef.current);
    if (!cloudAuth) {
      if (userRef.current?.id && !userRef.current.isGuest) {
        await markHabitPending(userRef.current.id, habit.id);
      }
      return false;
    }

    const activeUserId = cloudAuth.userId;
    const updatedAt = new Date().toISOString();
    const extendedRow = {
      id: habit.id,
      user_id: activeUserId,
      name: habit.name,
      description: habit.description ?? '',
      category: habit.category,
      color: habit.color,
      icon: habit.icon,
      habit_kind: habit.habitKind ?? 'positive',
      tracking_method: habit.trackingMethod ?? 'yes_no',
      target_value: habit.targetValue ?? 1,
      unit: habit.unit ?? null,
      schedule: habit.schedule ?? { frequency: 'daily' },
      target_frequency: habit.targetFrequency,
      start_date: habit.startDate ?? todayStr,
      end_date: habit.endDate ?? null,
      archived_at: habit.archivedAt ?? null,
      paused_periods: habit.pausedPeriods ?? [],
      configuration_history: habit.configurationHistory ?? [],
      reminders: habit.reminders ?? [],
      configuration_effective_from: habit.configurationEffectiveFrom ?? habit.startDate ?? todayStr,
      sort_order: habit.sortOrder ?? 0,
      streak: calculateStreakStats(habit, todayReferenceDate).currentStreak,
      completed_dates: habit.completedDates,
      updated_at: updatedAt,
    };
    let { error } = await supabase.from('habits').upsert(extendedRow);
    if (error) {
      const isMissingCol = error.code === '42703' || error.code === 'PGRST204' || String(error.message).includes('column');
      if (isMissingCol) {
        // Keep existing cloud deployments usable until the additive schema migration is applied.
        const legacyResult = await supabase.from('habits').upsert({
          id: habit.id,
          user_id: activeUserId,
          name: habit.name,
          category: habit.category,
          color: habit.color,
          icon: habit.icon,
          streak: calculateStreakStats(habit, todayReferenceDate).currentStreak,
          completed_dates: habit.completedDates,
          target_frequency: habit.targetFrequency,
          updated_at: updatedAt,
        });
        error = legacyResult.error;
      }
      if (error) {
        console.warn('Habit saved locally; cloud sync queued for retry:', error.message);
        syncedHabitIdsRef.current.delete(habit.id);
        await markHabitPending(activeUserId, habit.id);
        return false;
      }
    }

    const { error: clearLogsError } = await supabase.from('habit_logs').delete().eq('habit_id', habit.id).eq('user_id', activeUserId);
    if (clearLogsError) console.warn('Could not replace habit log history in cloud:', clearLogsError.message);
    if (habit.logs?.length) {
      const logRows = habit.logs.map(log => ({
        user_id: activeUserId,
        habit_id: habit.id,
        log_date: log.date,
        value: log.value ?? null,
        outcome: log.outcome ?? 'completed',
        note: log.note ?? '',
        updated_at: log.updatedAt ?? updatedAt,
      }));
      const { error: logError } = await supabase.from('habit_logs').upsert(logRows, { onConflict: 'habit_id,log_date' });
      if (logError) console.warn('Habit logs remain on device; apply the habit log migration to sync them:', logError.message);
    }
    if (habit.configurationHistory?.length) {
      const historyRows = habit.configurationHistory.map(configuration => ({
        user_id: activeUserId,
        habit_id: habit.id,
        effective_from: configuration.effectiveFrom,
        configuration,
      }));
      const { error: historyError } = await supabase.from('habit_configuration_history').upsert(historyRows, { onConflict: 'habit_id,effective_from' });
      if (historyError) console.warn('Habit configuration history is saved in the habit row; apply the history migration to normalize it:', historyError.message);
    }
    const { error: clearRemindersError } = await supabase.from('habit_reminders').delete().eq('habit_id', habit.id).eq('user_id', activeUserId);
    if (clearRemindersError) console.warn('Could not replace cloud reminder rows:', clearRemindersError.message);
    if (habit.reminders?.length) {
      const reminderRows = habit.reminders.map(reminder => ({
        id: reminder.id,
        user_id: activeUserId,
        habit_id: habit.id,
        hour: reminder.hour,
        minute: reminder.minute,
        weekdays: reminder.weekdays,
        enabled: reminder.enabled,
        notification_ids: reminder.notificationIds ?? [],
      }));
      const { error: remindersError } = await supabase.from('habit_reminders').upsert(reminderRows, { onConflict: 'id' });
      if (remindersError) console.warn('Habit reminders are saved on the habit row; apply the reminders migration to sync them separately:', remindersError.message);
    }

    syncedHabitIdsRef.current.add(habit.id);
    await clearHabitPending(activeUserId, habit.id);
    return true;
  }, [clearHabitPending, markHabitPending, todayReferenceDate, todayStr]);

  useEffect(() => {
    syncHabitToCloudRef.current = syncHabitToCloud;
  }, [syncHabitToCloud]);

  const ensureHabitsSynced = useCallback(async (habitIds: string[]) => {
    const cloudAuth = await resolveCloudAuth(userRef.current, sessionRef.current);
    if (!cloudAuth || !habitIds.length) return;
    for (const id of habitIds) {
      if (syncedHabitIdsRef.current.has(id)) continue;
      const target = habitsRef.current.find(h => h.id === id);
      if (target) {
        await syncHabitToCloudRef.current(target);
      }
    }
  }, []);

  const syncAllHabitsNow = useCallback(async () => {
    const cloudAuth = await resolveCloudAuth(userRef.current, sessionRef.current);
    if (!cloudAuth) return;
    const pendingIds = await readStorageJson<string[]>(pendingHabitsKey(cloudAuth.userId), []);
    for (const habit of habitsRef.current) {
      if (pendingIds.includes(habit.id) || !syncedHabitIdsRef.current.has(habit.id)) {
        await syncHabitToCloudRef.current(habit);
      }
    }
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        void syncAllHabitsNow();
      }
    });
    return () => sub.remove();
  }, [syncAllHabitsNow]);

  useEffect(() => {
    if (!hasPendingSync) return;
    const timer = setInterval(() => {
      void syncAllHabitsNow();
    }, 15000);
    return () => clearInterval(timer);
  }, [hasPendingSync, syncAllHabitsNow]);

  const refreshReminderSchedule = async (habit: Habit, fallbackHabits: Habit[], previous?: Habit) => {
    try {
      const reminders = await replaceLocalHabitReminders({ ...habit, notificationsEnabled: preferences.notifications.daily, soundEnabled: preferences.soundEnabled }, previous?.reminders);
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
      await syncHabitToCloud(changed);
    } catch (error) {
      console.warn('Habit reminders remain saved but could not be scheduled:', error);
    }
  };

  const saveAndSync = (updated: Habit[], changed: Habit) => {
    const previous = habits.find(item => item.id === changed.id);
    void saveHabits(updated);
    void syncHabitToCloud(changed);
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
    // refreshReminderSchedule uses the current preference values and latest habit snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferences.notifications.daily, preferences.soundEnabled, isLoadingData]);

  const toggleHabit = (id: string, dateStr: string = todayStr) => {
    const target = habits.find(habit => habit.id === id);
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
    const next = habits.map(habit => habit.id === id ? updatedHabit : habit);
    const scheduledToday = next.filter(habit => !habit.archivedAt && isScheduledOnDate(habit, todayStr));
    const wasAllComplete = habits.filter(habit => !habit.archivedAt && isScheduledOnDate(habit, todayStr)).every(habit => getHabitDayStatus(habit, todayStr, todayReferenceDate) === 'completed');
    const isAllComplete = scheduledToday.length > 0 && scheduledToday.every(habit => getHabitDayStatus(habit, todayStr, todayReferenceDate) === 'completed');
    if (dateStr === todayStr && !wasAllComplete && isAllComplete) setIsCelebrationVisible(true);
    saveAndSync(next, updatedHabit);
    void schedulePendingHabitsReminderAsync(next, {
      notificationsEnabled: preferences.notifications.daily,
      soundEnabled: preferences.soundEnabled,
      todayDateStr: todayStr,
      timezone: preferences.timezone,
    });
  };

  const addHabit = (newHabit: Omit<Habit, 'id' | 'streak' | 'completedDates'>) => {
    const activeHabitsList = habitsRef.current;
    const activeCount = activeHabitsList.filter(habit => !habit.archivedAt).length;
    if (!canCreateHabit(activeCount, isPro)) return { error: 'Free accounts can have up to 5 active habits. Archive one or upgrade to Pro.' };
    const createdAt = todayStr;
    const activeUid = (userRef.current && !userRef.current.isGuest ? userRef.current.id : sessionRef.current?.user?.id) ?? 'local';
    const habitId = `${activeUid}_h_${Date.now()}`;
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
    saveAndSync(updated, created);
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
    const activeUid = (userRef.current && !userRef.current.isGuest ? userRef.current.id : sessionRef.current?.user?.id) ?? 'local';
    const prefix = `${activeUid}_onboard_${Date.now()}`;
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
    createdList.forEach(habit => void syncHabitToCloud(habit));
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
    saveAndSync(updated, nextHabit);
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
    void syncHabitToCloud({ ...current, sortOrder: adjacentOrder });
    void syncHabitToCloud({ ...adjacent, sortOrder: currentOrder });
  };

  const archiveHabit = (id: string) => {
    const habit = habits.find(item => item.id === id);
    if (!habit) return;
    const archived = { ...habit, archivedAt: new Date().toISOString() };
    saveAndSync(habits.map(item => item.id === id ? archived : item), archived);
  };

  const restoreHabit = (id: string) => {
    const habit = habits.find(item => item.id === id);
    if (!habit) return;
    const activeCount = habits.filter(item => !item.archivedAt).length;
    if (!canCreateHabit(activeCount, isPro)) return;
    const restored = { ...habit, archivedAt: null };
    saveAndSync(habits.map(item => item.id === id ? restored : item), restored);
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
    saveAndSync(habits.map(item => item.id === id ? paused : item), paused);
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
    saveAndSync(habits.map(item => item.id === id ? paused : item), paused);
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
    saveAndSync(updated, changed);
    return {};
  };

  const deleteHabit = (id: string) => {
    const target = habitsRef.current.find(habit => habit.id === id);
    if (target?.reminders?.length) void refreshReminderSchedule({ ...target, archivedAt: new Date().toISOString() }, habitsRef.current, target);

    const activeUid = userRef.current?.id && !userRef.current.isGuest ? userRef.current.id : undefined;
    const userPrefix = activeUid ? `${activeUid}_` : '';
    const idVariants = [id, `${userPrefix}${id}`.replace(`${userPrefix}${userPrefix}`, userPrefix)];
    const updatedDeleted = Array.from(new Set([...deletedHabitIdsRef.current, ...idVariants]));
    deletedHabitIdsRef.current = updatedDeleted;
    syncedHabitIdsRef.current.delete(id);
    void AsyncStorage.setItem(deletedHabitsKey(activeUid), JSON.stringify(updatedDeleted)).catch(() => { });

    const updated = habitsRef.current.filter(habit => !idVariants.includes(habit.id));
    void saveHabits(updated);
    void cleanupDuplicateNotificationsAsync(updated);
    void schedulePendingHabitsReminderAsync(updated, {
      notificationsEnabled: preferences.notifications.daily,
      soundEnabled: preferences.soundEnabled,
      todayDateStr: todayStr,
      timezone: preferences.timezone,
    });
    void (async () => {
      const cloudAuth = await resolveCloudAuth(userRef.current, sessionRef.current);
      if (!cloudAuth) return;
      const { error } = await supabase.from('habits').delete()
        .in('id', idVariants)
        .eq('user_id', cloudAuth.userId);
      if (!error) {
        const remaining = deletedHabitIdsRef.current.filter(val => !idVariants.includes(val));
        deletedHabitIdsRef.current = remaining;
        await AsyncStorage.setItem(deletedHabitsKey(cloudAuth.userId), JSON.stringify(remaining)).catch(() => { });
      } else {
        console.warn('Supabase deleteHabit sync warning:', error.message);
      }
    })();
  };

  const completeOnboarding = () => {
    setHasCompletedOnboarding(true);
    AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING, 'true').catch(() => { });
    if (user?.id) {
      AsyncStorage.setItem(`@daymark_onboarding_v2_${user.id}`, 'true').catch(() => { });
      if (isSupabaseConfigured && !user.isGuest) {
        supabase.auth
          .updateUser({
            data: { onboarding_completed: true },
          })
          .catch(() => { });
      }
    }
  };

  const restartOnboarding = () => {
    setHasCompletedOnboarding(false);
    AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING, 'false').catch(() => { });
    if (user?.id) {
      AsyncStorage.setItem(`@daymark_onboarding_v2_${user.id}`, 'false').catch(() => { });
    }
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
  const sortedActiveHabits = useMemo(() => [...activeHabits].sort((a, b) => {
    if (preferences.dashboardSort === 'alphabetical') return a.name.localeCompare(b.name);
    if (preferences.dashboardSort === 'consistency') return calculateStreakStats(b, todayReferenceDate).currentStreak - calculateStreakStats(a, todayReferenceDate).currentStreak;
    if (preferences.dashboardSort === 'completion') return calculateCompletionStats(b, addLocalDays(todayStr, -29), todayStr, todayReferenceDate).percentage - calculateCompletionStats(a, addLocalDays(todayStr, -29), todayStr, todayReferenceDate).percentage;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  }), [activeHabits, preferences.dashboardSort, todayStr, todayReferenceDate]);
  const habitsWithCurrentStreak = useMemo(() => sortedActiveHabits.map(habit => ({
    ...habit,
    streak: calculateStreakStats(habit, todayReferenceDate).currentStreak,
  })), [sortedActiveHabits, todayReferenceDate]);
  const scheduledTodayHabits = useMemo(() => sortedActiveHabits.filter(habit => isScheduledOnDate(habit, todayStr)), [sortedActiveHabits, todayStr]);
  const completedToday = scheduledTodayHabits.filter(habit => getHabitDayStatus(habit, todayStr, todayReferenceDate) === 'completed').length;
  const totalToday = scheduledTodayHabits.length;
  const completionRate = totalToday > 0 ? Math.round((completedToday / totalToday) * 100) : 0;
  const bestStreak = activeHabits.length > 0 ? Math.max(...activeHabits.map(habit => calculateStreakStats(habit, todayReferenceDate).bestStreak)) : 0;
  const totalCompletions = activeHabits.reduce((acc, habit) => acc + habit.completedDates.length, 0);

  useEffect(() => {
    if (isLoadingData) return;
    DaymarkTodayWidget.updateSnapshot({
      completed: completedToday,
      total: totalToday,
      habits: scheduledTodayHabits.slice(0, 3).map(habit => {
        const completed = getHabitDayStatus(habit, todayStr, todayReferenceDate) === 'completed';
        return `${completed ? '✓' : '○'} ${habit.name}`;
      }),
      dateLabel: new Date(`${todayStr}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
    });
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
        ensureHabitsSynced,
        syncAllHabitsNow,
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
