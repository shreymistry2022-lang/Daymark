// src/services/RoutinesContext.tsx
import React, { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Routine, RoutineLog } from '../domain/routineEngine';
import { isTrackableOnDate, parseLocalDate } from '../domain/habitEngine';
import { dateKeyInTimezone } from '../domain/preferencesEngine';
import { replaceLocalReminders } from './localReminders';
import { useHabits } from './HabitContext';
import { usePreferences } from './PreferencesContext';
import { useDeviceIdentity } from './DeviceIdentityProvider';
import { createUuid } from './localHelpers';

const LEGACY_STORAGE_KEY = '@daymark_routines_v1';
const routinesStorageKey = (uid: string) => `@daymark_routines_v1:${uid}`;

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

const sortRoutines = (values: Routine[]) => [...values].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));

export const useRoutines = () => {
  const value = useContext(RoutineContext);
  if (!value) throw new Error('useRoutines must be used within RoutinesProvider');
  return value;
};

export const RoutinesProvider = ({ children }: { children: ReactNode }) => {
  const { deviceOwnerId, isReady } = useDeviceIdentity();
  const { habits } = useHabits();
  const { preferences } = usePreferences();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [isLoadingRoutines, setIsLoadingRoutines] = useState(true);
  const [routineError, setRoutineError] = useState<string | null>(null);

  const deviceOwnerIdRef = useRef(deviceOwnerId);
  const routinesRef = useRef(routines);
  useEffect(() => {
    deviceOwnerIdRef.current = deviceOwnerId;
    routinesRef.current = routines;
  });

  const saveLocal = useCallback(async (updated: Routine[], uid?: string) => {
    const sorted = sortRoutines(updated);
    setRoutines(sorted);
    routinesRef.current = sorted;
    const targetKey = routinesStorageKey(uid ?? deviceOwnerIdRef.current);
    try { await AsyncStorage.setItem(targetKey, JSON.stringify(sorted)); }
    catch (error) { setRoutineError('Routines could not be saved on this device. Check available storage.'); console.warn(error); }
  }, []);

  const refreshRoutineReminders = async (routine: Routine, previous?: Routine) => {
    try {
      const reminders = await replaceLocalReminders({ ...routine, notificationsEnabled: preferences.notifications.routine, soundEnabled: preferences.soundEnabled }, previous?.reminders);
      const storageKey = routinesStorageKey(deviceOwnerIdRef.current);
      let latest = routinesRef.current;
      try {
        const saved = await AsyncStorage.getItem(storageKey);
        if (saved) latest = JSON.parse(saved) as Routine[];
      } catch { /* Preserve the in-memory routine list. */ }
      const current = latest.find(item => item.id === routine.id);
      if (!current) return;
      const changed = { ...current, reminders };
      await saveLocal(latest.map(item => item.id === routine.id ? changed : item));
    } catch (error) {
      console.warn('Routine reminder could not be scheduled:', error);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferences.notifications.routine, preferences.soundEnabled, isLoadingRoutines]);

  useEffect(() => {
    if (!isReady) return;
    let mounted = true;
    const load = async () => {
      setIsLoadingRoutines(true);
      const storageKey = routinesStorageKey(deviceOwnerId);
      let local: Routine[] = [];
      try {
        let stored = await AsyncStorage.getItem(storageKey);
        if (!stored) {
          // Migrate from legacy guest key
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
      if (mounted) setIsLoadingRoutines(false);
    };
    void load();
    return () => { mounted = false; };
  }, [deviceOwnerId, isReady]);

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
  };

  const reorderRoutine = (id: string, direction: -1 | 1) => {
    const next = sortRoutines(routines);
    const index = next.findIndex(routine => routine.id === id);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= next.length) return;
    [next[index], next[destination]] = [next[destination], next[index]];
    const reordered = next.map((routine, order) => ({ ...routine, sortOrder: order, updatedAt: new Date().toISOString() }));
    void saveLocal(reordered);
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
