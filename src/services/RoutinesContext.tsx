import React, { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { useAuth } from './AuthProvider';
import { Routine, RoutineLog } from '../domain/routineEngine';
import { HabitSchedule } from '../domain/habitTypes';
import { isTrackableOnDate, parseLocalDate } from '../domain/habitEngine';
import { dateKeyInTimezone } from '../domain/preferencesEngine';
import { replaceLocalReminders } from './localReminders';
import { useHabits } from './HabitContext';
import { usePreferences } from './PreferencesContext';
import {
  createUuid,
  isOwnershipOrConflictError,
  isTransientCloudError,
  isValidUuid,
  readStorageJson,
  resolveCloudAuth,
  writeStorageJson,
} from './cloudSyncHelpers';

const LEGACY_STORAGE_KEY = '@daymark_routines_v1';
const LEGACY_DELETE_KEY = '@daymark_routine_delete_queue_v1';
const routinesStorageKey = (uid?: string) => uid ? `@daymark_routines_v1:${uid}` : LEGACY_STORAGE_KEY;
const routineDeleteQueueKey = (uid?: string) => uid ? `@daymark_routine_delete_queue_v1:${uid}` : LEGACY_DELETE_KEY;
const routinePendingSyncKey = (uid?: string) => `@daymark_routine_pending_sync_v1:${uid ?? 'guest'}`;

interface RoutineContextValue {
  routines: Routine[];
  isLoadingRoutines: boolean;
  routineError: string | null;
  createRoutine: (value: Pick<Routine, 'name' | 'description' | 'schedule' | 'habitIds' | 'reminders'>) => { error?: string };
  updateRoutine: (id: string, changes: Partial<Pick<Routine, 'name' | 'description' | 'schedule' | 'habitIds' | 'reminders'>>) => { error?: string };
  archiveRoutine: (id: string) => void;
  deleteRoutine: (id: string) => void;
  reorderRoutine: (id: string, direction: -1 | 1) => void;
  toggleRoutineLog: (id: string, date?: string) => { error?: string };
  retryRoutineSync: () => Promise<void>;
}

const RoutineContext = createContext<RoutineContextValue | null>(null);

const sortRoutines = (values: Routine[]) => [...values].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));

export const useRoutines = () => {
  const value = useContext(RoutineContext);
  if (!value) throw new Error('useRoutines must be used within RoutinesProvider');
  return value;
};

export const RoutinesProvider = ({ children }: { children: ReactNode }) => {
  const { user, session } = useAuth();
  const { habits, allHabits, isLoadingData: isLoadingHabits, ensureHabitsSynced } = useHabits();
  const { preferences } = usePreferences();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [isLoadingRoutines, setIsLoadingRoutines] = useState(true);
  const [routineError, setRoutineError] = useState<string | null>(null);

  const userRef = useRef(user);
  const sessionRef = useRef(session);
  const routinesRef = useRef(routines);
  const allHabitsRef = useRef(allHabits);
  useEffect(() => {
    userRef.current = user;
    sessionRef.current = session;
    routinesRef.current = routines;
    allHabitsRef.current = allHabits;
  });

  const activeUid = user?.id && !user.isGuest ? user.id : undefined;

  const saveLocal = useCallback(async (updated: Routine[], uid?: string) => {
    const sorted = sortRoutines(updated);
    setRoutines(sorted);
    routinesRef.current = sorted;
    const targetKey = routinesStorageKey(uid ?? (userRef.current?.id && !userRef.current.isGuest ? userRef.current.id : undefined));
    try { await AsyncStorage.setItem(targetKey, JSON.stringify(sorted)); }
    catch (error) { setRoutineError('Routines could not be saved on this device. Check available storage.'); console.warn(error); }
  }, []);

  const markRoutinePending = useCallback(async (uid: string, routineId: string) => {
    const pending = await readStorageJson<string[]>(routinePendingSyncKey(uid), []);
    if (!pending.includes(routineId)) {
      await writeStorageJson(routinePendingSyncKey(uid), [...pending, routineId]).catch(() => { });
    }
  }, []);

  const clearRoutinePending = useCallback(async (uid: string, routineId: string) => {
    const pending = await readStorageJson<string[]>(routinePendingSyncKey(uid), []);
    if (pending.includes(routineId)) {
      await writeStorageJson(routinePendingSyncKey(uid), pending.filter(id => id !== routineId)).catch(() => { });
    }
  }, []);

  const syncRoutine = useCallback(async (routine: Routine) => {
    const cloudAuth = await resolveCloudAuth(userRef.current, sessionRef.current);
    if (!cloudAuth) return;

    let activeRoutine = routine;
    if (!isValidUuid(activeRoutine.id)) {
      const healedId = createUuid();
      const updated = routinesRef.current.map(r => (r.id === activeRoutine.id ? { ...activeRoutine, id: healedId } : r));
      activeRoutine = { ...activeRoutine, id: healedId };
      await saveLocal(updated, cloudAuth.userId);
    }

    const validHabitIds = activeRoutine.habitIds.filter(id => allHabitsRef.current.some(h => h.id === id));
    const syncedHabitIds = validHabitIds.length > 0 ? await ensureHabitsSynced(validHabitIds) : [];

    const buildRow = (target: Routine) => ({
      id: target.id,
      user_id: cloudAuth.userId,
      name: target.name,
      description: target.description,
      schedule: target.schedule,
      reminders: target.reminders,
      sort_order: target.sortOrder,
      archived_at: target.archivedAt,
      created_at: target.createdAt,
      updated_at: target.updatedAt,
    });

    const { error } = await supabase.from('routines').upsert(buildRow(activeRoutine), { onConflict: 'id' });
    if (error) {
      if (isOwnershipOrConflictError(error)) {
        const oldId = activeRoutine.id;
        const healedId = createUuid();
        const cloned = { ...activeRoutine, id: healedId };
        const updated = routinesRef.current.map(r => (r.id === oldId ? cloned : r));
        await saveLocal(updated, cloudAuth.userId);
        await clearRoutinePending(cloudAuth.userId, oldId);
        activeRoutine = cloned;
        const retryResult = await supabase.from('routines').upsert(buildRow(activeRoutine), { onConflict: 'id' });
        if (retryResult.error) throw retryResult.error;
      } else {
        throw error;
      }
    }

    const { error: clearLinksError } = await supabase.from('routine_habits').delete().eq('routine_id', activeRoutine.id);
    if (clearLinksError) throw clearLinksError;
    if (syncedHabitIds.length) {
      const links = syncedHabitIds.map((habitId, index) => ({ routine_id: activeRoutine.id, habit_id: habitId, sort_order: index }));
      const { error: linksError } = await supabase.from('routine_habits').insert(links);
      if (linksError) throw linksError;
    }

    const { error: clearLogsError } = await supabase.from('routine_logs').delete().eq('routine_id', activeRoutine.id).eq('user_id', cloudAuth.userId);
    if (clearLogsError) throw clearLogsError;
    if (activeRoutine.logs.length) {
      const logs = activeRoutine.logs.map(log => ({ user_id: cloudAuth.userId, routine_id: activeRoutine.id, log_date: log.date, completed_at: log.completedAt, updated_at: log.updatedAt }));
      const { error: logsError } = await supabase.from('routine_logs').upsert(logs, { onConflict: 'routine_id,log_date' });
      if (logsError) throw logsError;
    }

    if (syncedHabitIds.length < validHabitIds.length) {
      await markRoutinePending(cloudAuth.userId, activeRoutine.id);
    } else {
      await clearRoutinePending(cloudAuth.userId, activeRoutine.id);
    }
  }, [clearRoutinePending, ensureHabitsSynced, markRoutinePending, saveLocal]);

  const retryRoutineSync = useCallback(async () => {
    const cloudAuth = await resolveCloudAuth(userRef.current, sessionRef.current);
    if (!cloudAuth) return;
    const pendingIds = await readStorageJson<string[]>(routinePendingSyncKey(cloudAuth.userId), []);
    const targets = pendingIds.length
      ? pendingIds.map(id => routinesRef.current.find(r => r.id === id)).filter((r): r is Routine => Boolean(r))
      : routinesRef.current;
    try {
      for (const target of targets) {
        await syncRoutine(target);
      }
      for (const id of pendingIds) {
        if (!routinesRef.current.some(r => r.id === id)) {
          await clearRoutinePending(cloudAuth.userId, id);
        }
      }
      setRoutineError(null);
    } catch (error) {
      console.warn('Pending routine cloud sync retry failed:', error);
    }
  }, [clearRoutinePending, syncRoutine]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        void retryRoutineSync();
      }
    });
    return () => sub.remove();
  }, [retryRoutineSync]);

  useEffect(() => {
    if (!routineError || isLoadingHabits) return;
    const timer = setInterval(() => {
      void retryRoutineSync();
    }, 15000);
    return () => clearInterval(timer);
  }, [routineError, isLoadingHabits, retryRoutineSync]);

  const refreshRoutineReminders = async (routine: Routine, previous?: Routine) => {
    try {
      const reminders = await replaceLocalReminders({ ...routine, notificationsEnabled: preferences.notifications.routine, soundEnabled: preferences.soundEnabled }, previous?.reminders);
      const storageKey = routinesStorageKey(userRef.current?.id && !userRef.current.isGuest ? userRef.current.id : undefined);
      let latest = routinesRef.current;
      try {
        const saved = await AsyncStorage.getItem(storageKey);
        if (saved) latest = JSON.parse(saved) as Routine[];
      } catch { /* Preserve the in-memory routine list. */ }
      const current = latest.find(item => item.id === routine.id);
      if (!current) return;
      const changed = { ...current, reminders };
      const updated = latest.map(item => item.id === routine.id ? changed : item);
      await saveLocal(updated);
      const cloudAuth = await resolveCloudAuth(userRef.current, sessionRef.current);
      if (cloudAuth) {
        try {
          await syncRoutine(changed);
          setRoutineError(null);
        } catch (syncErr) {
          await markRoutinePending(cloudAuth.userId, changed.id);
          console.warn('Routine saved locally; cloud sync deferred:', syncErr);
          if (!isTransientCloudError(syncErr)) {
            setRoutineError('Routine saved on this device, but cloud sync failed. Tap to retry.');
          }
        }
      }
    } catch (error) {
      console.warn('Routine reminder could not be scheduled:', error);
      const cloudAuth = await resolveCloudAuth(userRef.current, sessionRef.current);
      if (cloudAuth) {
        try { await syncRoutine(routine); } catch { await markRoutinePending(cloudAuth.userId, routine.id); }
      }
      setRoutineError(error instanceof Error ? error.message : 'Routine reminder could not be scheduled.');
    }
  };

  const lastReminderSettingsRef = React.useRef({ enabled: preferences.notifications.routine, sound: preferences.soundEnabled });
  useEffect(() => {
    if (isLoadingRoutines) return;
    const previous = lastReminderSettingsRef.current;
    if (previous.enabled === preferences.notifications.routine && previous.sound === preferences.soundEnabled) return;
    lastReminderSettingsRef.current = { enabled: preferences.notifications.routine, sound: preferences.soundEnabled };
    routines.filter(routine => !routine.archivedAt && routine.reminders.length).forEach(routine => { void refreshRoutineReminders(routine, routine); });
    // refreshRoutineReminders uses current preferences and routine snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferences.notifications.routine, preferences.soundEnabled, isLoadingRoutines]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setIsLoadingRoutines(true);
      const storageKey = routinesStorageKey(activeUid);
      const deleteKey = routineDeleteQueueKey(activeUid);

      let local: Routine[] = [];
      try {
        let stored = await AsyncStorage.getItem(storageKey);
        if (!stored && activeUid) {
          const legacyStored = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
          if (legacyStored) {
            stored = legacyStored;
            await AsyncStorage.setItem(storageKey, legacyStored).catch(() => { });
          }
        }
        if (stored) local = JSON.parse(stored) as Routine[];
        if (mounted) {
          const sorted = sortRoutines(local);
          setRoutines(sorted);
          routinesRef.current = sorted;
        }
      } catch (error) {
        console.warn('Could not load local routines:', error);
        if (mounted) setRoutineError('Saved routines could not be read from this device.');
      }

      if (isLoadingHabits) return;

      const cloudAuth = await resolveCloudAuth(user, session);
      if (cloudAuth) {
        try {
          const pendingDeletes = await readStorageJson<string[]>(deleteKey, []);
          const legacyDeletes = deleteKey !== LEGACY_DELETE_KEY ? await readStorageJson<string[]>(LEGACY_DELETE_KEY, []) : [];
          const combinedDeletes = Array.from(new Set([...pendingDeletes, ...legacyDeletes]));
          const remainingDeletes: string[] = [];
          for (const id of combinedDeletes) {
            const result = await supabase.from('routines').delete().eq('id', id).eq('user_id', cloudAuth.userId);
            if (result.error) remainingDeletes.push(id);
          }
          await writeStorageJson(deleteKey, remainingDeletes).catch(() => { });
          if (deleteKey !== LEGACY_DELETE_KEY) {
            await AsyncStorage.removeItem(LEGACY_DELETE_KEY).catch(() => { });
          }

          const pendingSyncIds = await readStorageJson<string[]>(routinePendingSyncKey(cloudAuth.userId), []);

          const { data, error } = await supabase.from('routines')
            .select('*, routine_habits(habit_id,sort_order), routine_logs(log_date,completed_at,updated_at)')
            .eq('user_id', cloudAuth.userId).order('sort_order', { ascending: true });
          if (error) throw error;

          const cloud: Routine[] = (data ?? []).filter((row: any) => !remainingDeletes.includes(row.id)).map((row: any) => ({
            id: row.id,
            name: row.name,
            description: row.description ?? '',
            schedule: (row.schedule ?? { frequency: 'daily' }) as HabitSchedule,
            reminders: Array.isArray(row.reminders) ? row.reminders : [],
            habitIds: Array.isArray(row.routine_habits) ? row.routine_habits.sort((a: any, b: any) => a.sort_order - b.sort_order).map((link: any) => link.habit_id) : [],
            logs: Array.isArray(row.routine_logs) ? row.routine_logs.map((log: any): RoutineLog => ({ date: log.log_date, completedAt: log.completed_at ?? null, updatedAt: log.updated_at ?? log.completed_at ?? row.updated_at })) : [],
            sortOrder: Number(row.sort_order ?? 0),
            archivedAt: row.archived_at ?? null,
            createdAt: row.created_at ?? new Date().toISOString(),
            updatedAt: row.updated_at ?? new Date().toISOString(),
          }));
          if (!mounted) return;
          const cloudIds = new Set(cloud.map(routine => routine.id));
          const localById = new Map(local.map(routine => [routine.id, routine]));
          const localWins: Routine[] = [];
          const mergedCloud = cloud.map(cloudRoutine => {
            const localRoutine = localById.get(cloudRoutine.id);
            if (!localRoutine) return cloudRoutine;
            const hasMissingCloudLinks = localRoutine.updatedAt === cloudRoutine.updatedAt && localRoutine.habitIds.length > cloudRoutine.habitIds.length;
            const localIsNewer = localRoutine.updatedAt > cloudRoutine.updatedAt || pendingSyncIds.includes(localRoutine.id) || hasMissingCloudLinks;
            if (localIsNewer) localWins.push(localRoutine);
            const selected = localIsNewer ? localRoutine : cloudRoutine;
            const logsByDate = new Map<string, RoutineLog>();
            for (const log of [...cloudRoutine.logs, ...localRoutine.logs]) {
              const existing = logsByDate.get(log.date);
              if (!existing || log.updatedAt > existing.updatedAt) logsByDate.set(log.date, log);
            }
            return { ...selected, logs: [...logsByDate.values()] };
          });
          const localOnly = local.filter(routine => !cloudIds.has(routine.id));
          const merged = sortRoutines([...mergedCloud, ...localOnly]);
          setRoutines(merged);
          routinesRef.current = merged;
          await AsyncStorage.setItem(storageKey, JSON.stringify(merged));
          for (const routine of [...localWins, ...localOnly]) {
            try {
              await syncRoutine(routine);
            } catch (syncErr) {
              await markRoutinePending(cloudAuth.userId, routine.id);
              throw syncErr;
            }
          }
          setRoutineError(null);
        } catch (error) {
          console.warn('Cloud routines remain available locally:', error);
          if (mounted && !isTransientCloudError(error)) {
            setRoutineError('Cloud sync could not complete. Routine changes are stored on this device.');
          }
        }
      }
      if (mounted) setIsLoadingRoutines(false);
    };
    void load();
    return () => { mounted = false; };
  }, [activeUid, isLoadingHabits, markRoutinePending, session, syncRoutine, user]);

  const persistAndSync = (updated: Routine[], changed?: Routine) => {
    setRoutineError(null);
    const savedLocally = saveLocal(updated);
    if (changed) {
      const previous = routines.find(item => item.id === changed.id);
      if (!previous || JSON.stringify(previous.reminders) !== JSON.stringify(changed.reminders)
        || JSON.stringify(previous.schedule) !== JSON.stringify(changed.schedule)
        || previous.name !== changed.name || previous.description !== changed.description
        || Boolean(previous.archivedAt) !== Boolean(changed.archivedAt)) {
        void savedLocally.then(() => refreshRoutineReminders(changed, previous));
      } else {
        void (async () => {
          const cloudAuth = await resolveCloudAuth(userRef.current, sessionRef.current);
          if (!cloudAuth) return;
          try {
            await syncRoutine(changed);
            setRoutineError(null);
          } catch (error) {
            console.warn('Routine saved locally; cloud sync deferred:', error);
            await markRoutinePending(cloudAuth.userId, changed.id);
            if (!isTransientCloudError(error)) {
              setRoutineError('Routine saved on this device, but could not sync to your account. Tap to retry.');
            }
          }
        })();
      }
    }
  };

  const createRoutine = (value: Pick<Routine, 'name' | 'description' | 'schedule' | 'habitIds' | 'reminders'>) => {
    const name = value.name.trim();
    if (!name) return { error: 'Enter a routine name.' };
    if (name.length > 70) return { error: 'Keep the name under 70 characters.' };
    if (!value.habitIds.length) return { error: 'Add at least one active habit to the routine.' };
    if (value.habitIds.some(id => !habits.some(habit => habit.id === id && !habit.archivedAt))) return { error: 'Remove unavailable habits and choose from your active habits.' };
    const now = new Date().toISOString();
    const routine: Routine = {
      id: createUuid(), name, description: value.description.trim().slice(0, 500), schedule: value.schedule,
      habitIds: [...new Set(value.habitIds)], reminders: value.reminders ?? [], logs: [], sortOrder: routines.length,
      archivedAt: null, createdAt: now, updatedAt: now,
    };
    persistAndSync([routine, ...routines].map((item, index) => ({ ...item, sortOrder: index })), routine);
    return {};
  };

  const updateRoutine = (id: string, changes: Partial<Pick<Routine, 'name' | 'description' | 'schedule' | 'habitIds' | 'reminders'>>) => {
    const old = routines.find(routine => routine.id === id);
    if (!old) return { error: 'Routine not found.' };
    if (changes.name !== undefined && !changes.name.trim()) return { error: 'Enter a routine name.' };
    if (changes.name && changes.name.trim().length > 70) return { error: 'Keep the name under 70 characters.' };
    if (changes.habitIds && !changes.habitIds.length) return { error: 'Keep at least one active habit in the routine.' };
    if (changes.habitIds?.some(id => !habits.some(habit => habit.id === id && !habit.archivedAt))) return { error: 'Choose only active habits.' };
    const updatedRoutine: Routine = { ...old, ...changes, name: changes.name?.trim() ?? old.name, description: changes.description?.trim().slice(0, 500) ?? old.description, habitIds: changes.habitIds ? [...new Set(changes.habitIds)] : old.habitIds, updatedAt: new Date().toISOString() };
    persistAndSync(routines.map(routine => routine.id === id ? updatedRoutine : routine), updatedRoutine);
    return {};
  };

  const archiveRoutine = (id: string) => {
    const routine = routines.find(item => item.id === id);
    if (!routine) return;
    const archived = { ...routine, archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    persistAndSync(routines.map(item => item.id === id ? archived : item), archived);
  };

  const deleteRoutine = (id: string) => {
    const existing = routines.find(routine => routine.id === id);
    if (existing?.reminders.length) void replaceLocalReminders({ ...existing, archivedAt: new Date().toISOString() }, existing.reminders);
    const next = routines.filter(routine => routine.id !== id).map((routine, index) => ({ ...routine, sortOrder: index }));
    persistAndSync(next);
    void (async () => {
      const cloudAuth = await resolveCloudAuth(userRef.current, sessionRef.current);
      if (!cloudAuth) return;
      await clearRoutinePending(cloudAuth.userId, id);
      const deleteKey = routineDeleteQueueKey(cloudAuth.userId);
      const queue = await readStorageJson<string[]>(deleteKey, []);
      if (!queue.includes(id)) queue.push(id);
      await writeStorageJson(deleteKey, queue).catch(() => { });
      const { error } = await supabase.from('routines').delete().eq('id', id).eq('user_id', cloudAuth.userId);
      if (!error) await writeStorageJson(deleteKey, queue.filter(queuedId => queuedId !== id)).catch(() => { });
      else setRoutineError('Routine deleted on this device; cloud deletion will retry next session.');
    })();
  };

  const reorderRoutine = (id: string, direction: -1 | 1) => {
    const next = sortRoutines(routines);
    const index = next.findIndex(routine => routine.id === id);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= next.length) return;
    [next[index], next[destination]] = [next[destination], next[index]];
    const reordered = next.map((routine, order) => ({ ...routine, sortOrder: order, updatedAt: new Date().toISOString() }));
    void saveLocal(reordered);
    void (async () => {
      const cloudAuth = await resolveCloudAuth(userRef.current, sessionRef.current);
      if (!cloudAuth) return;
      for (const routine of reordered) {
        try { await syncRoutine(routine); } catch {
          await markRoutinePending(cloudAuth.userId, routine.id);
          setRoutineError('Routine order saved locally, but could not sync.');
        }
      }
    })();
  };

  const toggleRoutineLog = (id: string, date = dateKeyInTimezone(new Date(), preferences.timezone)) => {
    if (!parseLocalDate(date) || date > dateKeyInTimezone(new Date(), preferences.timezone)) return { error: 'Choose a valid date that is not in the future.' };
    const routine = routines.find(item => item.id === id && !item.archivedAt);
    if (!routine) return { error: 'Routine is not active.' };
    if (!isTrackableOnDate(routine, date)) return { error: 'This routine is not scheduled for the selected date.' };
    const existingLog = routine.logs.find(log => log.date === date);
    const now = new Date().toISOString();
    const log: RoutineLog = { date, completedAt: existingLog?.completedAt ? null : now, updatedAt: now };
    const logs = [...routine.logs.filter(item => item.date !== date), log];
    const changed = { ...routine, logs, updatedAt: new Date().toISOString() };
    persistAndSync(routines.map(item => item.id === id ? changed : item), changed);
    return {};
  };

  const value: RoutineContextValue = { routines, isLoadingRoutines, routineError, createRoutine, updateRoutine, archiveRoutine, deleteRoutine, reorderRoutine, toggleRoutineLog, retryRoutineSync };
  return <RoutineContext.Provider value={value}>{children}</RoutineContext.Provider>;
};
