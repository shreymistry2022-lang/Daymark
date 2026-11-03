import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from './supabase';
import { useAuth } from './AuthProvider';
import { Routine, RoutineLog } from '../domain/routineEngine';
import { HabitSchedule } from '../domain/habitTypes';
import { isTrackableOnDate, parseLocalDate } from '../domain/habitEngine';
import { dateKeyInTimezone } from '../domain/preferencesEngine';
import { replaceLocalReminders } from './localReminders';
import { useHabits } from './HabitContext';
import { usePreferences } from './PreferencesContext';

const STORAGE_KEY = '@daymark_routines_v1';
const DELETE_QUEUE_KEY = '@daymark_routine_delete_queue_v1';

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
}

const RoutineContext = createContext<RoutineContextValue | null>(null);

const createUuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
  const random = Math.floor(Math.random() * 16);
  return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
});

const sortRoutines = (values: Routine[]) => [...values].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));

export const useRoutines = () => {
  const value = useContext(RoutineContext);
  if (!value) throw new Error('useRoutines must be used within RoutinesProvider');
  return value;
};

export const RoutinesProvider = ({ children }: { children: ReactNode }) => {
  const { user, session } = useAuth();
  const { habits } = useHabits();
  const { preferences } = usePreferences();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [isLoadingRoutines, setIsLoadingRoutines] = useState(true);
  const [routineError, setRoutineError] = useState<string | null>(null);

  const saveLocal = useCallback(async (updated: Routine[]) => {
    setRoutines(sortRoutines(updated));
    try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); }
    catch (error) { setRoutineError('Routines could not be saved on this device. Check available storage.'); console.warn(error); }
  }, []);

  const syncRoutine = useCallback(async (routine: Routine) => {
    if (!session || !user || user.isGuest || !isSupabaseConfigured) return;
    const { error } = await supabase.from('routines').upsert({
      id: routine.id,
      user_id: user.id,
      name: routine.name,
      description: routine.description,
      schedule: routine.schedule,
      reminders: routine.reminders,
      sort_order: routine.sortOrder,
      archived_at: routine.archivedAt,
      updated_at: routine.updatedAt,
    });
    if (error) throw error;
    const { error: clearLinksError } = await supabase.from('routine_habits').delete().eq('routine_id', routine.id);
    if (clearLinksError) throw clearLinksError;
    if (routine.habitIds.length) {
      const links = routine.habitIds.map((habitId, index) => ({ routine_id: routine.id, habit_id: habitId, sort_order: index }));
      const { error: linksError } = await supabase.from('routine_habits').upsert(links, { onConflict: 'routine_id,habit_id' });
      if (linksError) throw linksError;
    }
    const { error: clearLogsError } = await supabase.from('routine_logs').delete().eq('routine_id', routine.id).eq('user_id', user.id);
    if (clearLogsError) throw clearLogsError;
    if (routine.logs.length) {
      const logs = routine.logs.map(log => ({ user_id: user.id, routine_id: routine.id, log_date: log.date, completed_at: log.completedAt, updated_at: log.updatedAt }));
      const { error: logsError } = await supabase.from('routine_logs').upsert(logs, { onConflict: 'routine_id,log_date' });
      if (logsError) throw logsError;
    }
  }, [session, user]);

  const refreshRoutineReminders = async (routine: Routine, previous?: Routine) => {
    try {
      const reminders = await replaceLocalReminders({ ...routine, notificationsEnabled: preferences.notifications.routine, soundEnabled: preferences.soundEnabled }, previous?.reminders);
      let latest = routines;
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) latest = JSON.parse(saved) as Routine[];
      } catch { /* Preserve the in-memory routine list. */ }
      const current = latest.find(item => item.id === routine.id);
      if (!current) return;
      const changed = { ...current, reminders };
      const updated = latest.map(item => item.id === routine.id ? changed : item);
      await saveLocal(updated);
      await syncRoutine(changed);
    } catch (error) {
      console.warn('Routine reminder could not be scheduled:', error);
      try { await syncRoutine(routine); } catch { /* Keep the local copy and show the notification/sync issue below. */ }
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
      let local: Routine[] = [];
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) local = JSON.parse(stored) as Routine[];
        if (mounted) setRoutines(sortRoutines(local));
      } catch (error) {
        console.warn('Could not load local routines:', error);
        if (mounted) setRoutineError('Saved routines could not be read from this device.');
      }

      if (session && user && !user.isGuest && isSupabaseConfigured) {
        try {
          let pendingDeletes: string[] = [];
          try { pendingDeletes = JSON.parse((await AsyncStorage.getItem(DELETE_QUEUE_KEY)) ?? '[]') as string[]; } catch { pendingDeletes = []; }
          const remainingDeletes: string[] = [];
          for (const id of pendingDeletes) {
            const result = await supabase.from('routines').delete().eq('id', id).eq('user_id', user.id);
            if (result.error) remainingDeletes.push(id);
          }
          await AsyncStorage.setItem(DELETE_QUEUE_KEY, JSON.stringify(remainingDeletes));
          const { data, error } = await supabase.from('routines')
            .select('*, routine_habits(habit_id,sort_order), routine_logs(log_date,completed_at,updated_at)')
            .eq('user_id', user.id).order('sort_order', { ascending: true });
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
            const localIsNewer = localRoutine.updatedAt > cloudRoutine.updatedAt;
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
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
          for (const routine of [...localWins, ...localOnly]) await syncRoutine(routine);
          setRoutineError(null);
        } catch (error) {
          console.warn('Cloud routines remain available locally:', error);
          if (mounted) setRoutineError('Cloud sync is unavailable. Routine changes are stored on this device and will retry later.');
        }
      }
      if (mounted) setIsLoadingRoutines(false);
    };
    void load();
    return () => { mounted = false; };
  }, [session, user, syncRoutine]);

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
        void syncRoutine(changed).catch(error => {
          console.warn('Routine saved locally; cloud sync failed:', error);
          setRoutineError('Routine saved on this device, but could not sync to your account. It will retry on your next app session.');
        });
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
    if (session && user && !user.isGuest && isSupabaseConfigured) void (async () => {
      let queue: string[] = [];
      try { queue = JSON.parse((await AsyncStorage.getItem(DELETE_QUEUE_KEY)) ?? '[]') as string[]; } catch { queue = []; }
      if (!queue.includes(id)) queue.push(id);
      await AsyncStorage.setItem(DELETE_QUEUE_KEY, JSON.stringify(queue));
      const { error } = await supabase.from('routines').delete().eq('id', id).eq('user_id', user.id);
      if (!error) await AsyncStorage.setItem(DELETE_QUEUE_KEY, JSON.stringify(queue.filter(queuedId => queuedId !== id)));
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
    if (session && user && !user.isGuest && isSupabaseConfigured) for (const routine of reordered) void syncRoutine(routine).catch(() => setRoutineError('Routine order saved locally, but could not sync.'));
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

  const value: RoutineContextValue = { routines, isLoadingRoutines, routineError, createRoutine, updateRoutine, archiveRoutine, deleteRoutine, reorderRoutine, toggleRoutineLog };
  return <RoutineContext.Provider value={value}>{children}</RoutineContext.Provider>;
};
