import React, { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { useAuth } from './AuthProvider';
import { useHabits } from './HabitContext';
import { validateJournalEntry } from '../domain/journalEngine';
import {
  createUuid,
  isOwnershipOrConflictError,
  isTransientCloudError,
  isValidUuid,
  readStorageJson,
  resolveCloudAuth,
  writeStorageJson,
} from './cloudSyncHelpers';

export interface JournalEntry { id: string; habitId: string | null; date: string; text: string; createdAt: string; updatedAt: string }
interface JournalValue { entries: JournalEntry[]; isLoading: boolean; error: string | null; saveEntry: (value: Pick<JournalEntry, 'id' | 'habitId' | 'date' | 'text'>) => { error?: string }; deleteEntry: (id: string) => void; retryJournalSync: () => Promise<void> }
const JournalContext = createContext<JournalValue | null>(null);
const LEGACY_STORAGE_KEY = '@daymark_journal_v1';
const LEGACY_DELETE_KEY = '@daymark_journal_delete_queue_v1';
const journalStorageKey = (uid?: string) => uid ? `@daymark_journal_v1:${uid}` : LEGACY_STORAGE_KEY;
const journalDeleteKey = (uid?: string) => uid ? `@daymark_journal_delete_queue_v1:${uid}` : LEGACY_DELETE_KEY;
const journalPendingKey = (uid?: string) => `@daymark_journal_pending_sync_v1:${uid ?? 'guest'}`;

export const useJournal = () => { const value = useContext(JournalContext); if (!value) throw new Error('useJournal must be used within JournalProvider'); return value; };

export const JournalProvider = ({ children }: { children: ReactNode }) => {
  const { user, session } = useAuth();
  const { allHabits, isLoadingData: isLoadingHabits, ensureHabitsSynced } = useHabits();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const userRef = useRef(user);
  const sessionRef = useRef(session);
  const entriesRef = useRef(entries);
  const allHabitsRef = useRef(allHabits);
  useEffect(() => {
    userRef.current = user;
    sessionRef.current = session;
    entriesRef.current = entries;
    allHabitsRef.current = allHabits;
  });

  const activeUid = user?.id && !user.isGuest ? user.id : undefined;

  const persist = useCallback(async (next: JournalEntry[], uid?: string) => {
    const sorted = [...next].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
    setEntries(sorted);
    entriesRef.current = sorted;
    const targetKey = journalStorageKey(uid ?? (userRef.current?.id && !userRef.current.isGuest ? userRef.current.id : undefined));
    try { await AsyncStorage.setItem(targetKey, JSON.stringify(sorted)); }
    catch { setError('Journal could not be saved on this device.'); }
  }, []);

  const markPending = useCallback(async (uid: string, entryId: string) => {
    const pending = await readStorageJson<string[]>(journalPendingKey(uid), []);
    if (!pending.includes(entryId)) {
      await writeStorageJson(journalPendingKey(uid), [...pending, entryId]).catch(() => { });
    }
  }, []);

  const clearPending = useCallback(async (uid: string, entryId: string) => {
    const pending = await readStorageJson<string[]>(journalPendingKey(uid), []);
    if (pending.includes(entryId)) {
      await writeStorageJson(journalPendingKey(uid), pending.filter(id => id !== entryId)).catch(() => { });
    }
  }, []);

  const syncEntry = useCallback(async (entry: JournalEntry) => {
    const cloudAuth = await resolveCloudAuth(userRef.current, sessionRef.current);
    if (!cloudAuth) return;

    let activeEntry = entry;
    if (!isValidUuid(activeEntry.id)) {
      const healedId = createUuid();
      const updated = entriesRef.current.map(e => (e.id === activeEntry.id ? { ...activeEntry, id: healedId } : e));
      activeEntry = { ...activeEntry, id: healedId };
      await persist(updated, cloudAuth.userId);
    }

    let safeHabitId = activeEntry.habitId;
    let habitStillPending = false;
    if (safeHabitId) {
      if (allHabitsRef.current.some(h => h.id === safeHabitId)) {
        const synced = await ensureHabitsSynced([safeHabitId]);
        if (!synced.includes(safeHabitId)) {
          safeHabitId = null;
          habitStillPending = true;
        }
      } else {
        safeHabitId = null;
      }
    }

    const buildRow = (target: JournalEntry) => ({
      id: target.id, user_id: cloudAuth.userId, habit_id: safeHabitId,
      entry_date: target.date, text: target.text, created_at: target.createdAt, updated_at: target.updatedAt,
    });

    const { error: syncError } = await supabase.from('journal_entries').upsert(buildRow(activeEntry));
    if (syncError) {
      if (isOwnershipOrConflictError(syncError)) {
        const oldId = activeEntry.id;
        const healedId = createUuid();
        const cloned = { ...activeEntry, id: healedId };
        const updated = entriesRef.current.map(e => (e.id === oldId ? cloned : e));
        await persist(updated, cloudAuth.userId);
        await clearPending(cloudAuth.userId, oldId);
        activeEntry = cloned;
        const retryResult = await supabase.from('journal_entries').upsert(buildRow(activeEntry));
        if (retryResult.error) throw retryResult.error;
      } else {
        throw syncError;
      }
    }
    if (habitStillPending) {
      await markPending(cloudAuth.userId, activeEntry.id);
    } else {
      await clearPending(cloudAuth.userId, activeEntry.id);
    }
  }, [clearPending, ensureHabitsSynced, markPending, persist]);

  const retryJournalSync = useCallback(async () => {
    const cloudAuth = await resolveCloudAuth(userRef.current, sessionRef.current);
    if (!cloudAuth) return;
    const pendingIds = await readStorageJson<string[]>(journalPendingKey(cloudAuth.userId), []);
    const targets = pendingIds.length
      ? pendingIds.map(id => entriesRef.current.find(e => e.id === id)).filter((e): e is JournalEntry => Boolean(e))
      : entriesRef.current;
    try {
      for (const target of targets) await syncEntry(target);
      for (const id of pendingIds) {
        if (!entriesRef.current.some(e => e.id === id)) await clearPending(cloudAuth.userId, id);
      }
      setError(null);
    } catch (syncErr) {
      console.warn('Pending journal cloud sync retry failed:', syncErr);
    }
  }, [clearPending, syncEntry]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') void retryJournalSync();
    });
    return () => sub.remove();
  }, [retryJournalSync]);

  useEffect(() => {
    if (!error || isLoadingHabits) return;
    const timer = setInterval(() => {
      void retryJournalSync();
    }, 15000);
    return () => clearInterval(timer);
  }, [error, isLoadingHabits, retryJournalSync]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setIsLoading(true);
      const storageKey = journalStorageKey(activeUid);
      const deleteKey = journalDeleteKey(activeUid);

      let local: JournalEntry[] = [];
      try {
        let saved = await AsyncStorage.getItem(storageKey);
        if (!saved && activeUid) {
          const legacySaved = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
          if (legacySaved) {
            saved = legacySaved;
            await AsyncStorage.setItem(storageKey, legacySaved).catch(() => { });
          }
        }
        if (saved) local = JSON.parse(saved) as JournalEntry[];
        if (mounted) {
          setEntries(local);
          entriesRef.current = local;
        }
      } catch { if (mounted) setError('Saved journal entries could not be read.'); }

      if (isLoadingHabits) return;

      const cloudAuth = await resolveCloudAuth(user, session);
      if (cloudAuth) {
        try {
          const pending = await readStorageJson<string[]>(deleteKey, []);
          const legacyPending = deleteKey !== LEGACY_DELETE_KEY ? await readStorageJson<string[]>(LEGACY_DELETE_KEY, []) : [];
          const combinedPending = Array.from(new Set([...pending, ...legacyPending]));
          const retry: string[] = [];
          for (const id of combinedPending) {
            const result = await supabase.from('journal_entries').delete().eq('id', id).eq('user_id', cloudAuth.userId);
            if (result.error) retry.push(id);
          }
          await writeStorageJson(deleteKey, retry).catch(() => { });
          if (deleteKey !== LEGACY_DELETE_KEY) {
            await AsyncStorage.removeItem(LEGACY_DELETE_KEY).catch(() => { });
          }

          const pendingSyncIds = await readStorageJson<string[]>(journalPendingKey(cloudAuth.userId), []);
          const { data, error: queryError } = await supabase.from('journal_entries').select('id,habit_id,entry_date,text,created_at,updated_at').eq('user_id', cloudAuth.userId).order('entry_date', { ascending: false });
          if (queryError) throw queryError;
          const cloud: JournalEntry[] = (data ?? []).filter(row => !retry.includes(row.id)).map(row => ({ id: row.id, habitId: row.habit_id, date: row.entry_date, text: row.text, createdAt: row.created_at, updatedAt: row.updated_at }));
          const map = new Map(cloud.map(entry => [entry.id, entry]));
          const localWins: JournalEntry[] = [];
          for (const item of local) {
            const remote = map.get(item.id);
            if (!remote || item.updatedAt > remote.updatedAt || pendingSyncIds.includes(item.id)) {
              map.set(item.id, item);
              localWins.push(item);
            }
          }
          const merged = [...map.values()].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
          if (!mounted) return;
          await persist(merged, cloudAuth.userId);
          for (const item of localWins) {
            try {
              await syncEntry(item);
            } catch (syncErr) {
              await markPending(cloudAuth.userId, item.id);
              throw syncErr;
            }
          }
          setError(null);
        } catch (syncError) {
          console.warn('Journal cloud sync deferred:', syncError);
          if (mounted && !isTransientCloudError(syncError)) {
            setError('Journal entries remain saved locally and will retry syncing.');
          }
        }
      }
      if (mounted) setIsLoading(false);
    };
    void load(); return () => { mounted = false; };
  }, [activeUid, isLoadingHabits, markPending, persist, session, syncEntry, user]);

  const saveEntry = (value: Pick<JournalEntry, 'id' | 'habitId' | 'date' | 'text'>) => {
    const text = value.text.trim();
    const validationError = validateJournalEntry({ date: value.date, text, habitId: value.habitId }, allHabits.map(habit => habit.id));
    if (validationError) return { error: validationError };
    const previous = entries.find(item => item.id === value.id);
    const now = new Date().toISOString();
    const entry: JournalEntry = { ...value, text, createdAt: previous?.createdAt ?? now, updatedAt: now };
    const next = [entry, ...entries.filter(item => item.id !== entry.id)];
    setError(null);
    void persist(next);
    void (async () => {
      const cloudAuth = await resolveCloudAuth(userRef.current, sessionRef.current);
      if (!cloudAuth) return;
      try {
        await syncEntry(entry);
        setError(null);
      } catch (syncError) {
        console.warn('Journal entry saved locally; cloud sync deferred:', syncError);
        await markPending(cloudAuth.userId, entry.id);
        if (!isTransientCloudError(syncError)) {
          setError('Entry saved locally, but cloud sync failed. It will retry automatically.');
        }
      }
    })();
    return {};
  };

  const deleteEntry = (id: string) => {
    void persist(entries.filter(entry => entry.id !== id));
    void (async () => {
      const cloudAuth = await resolveCloudAuth(userRef.current, sessionRef.current);
      if (!cloudAuth) return;
      await clearPending(cloudAuth.userId, id);
      try {
        const result = await supabase.from('journal_entries').delete().eq('id', id).eq('user_id', cloudAuth.userId);
        if (result.error) throw result.error;
      } catch (syncError) {
        const deleteKey = journalDeleteKey(cloudAuth.userId);
        const queue = await readStorageJson<string[]>(deleteKey, []);
        await writeStorageJson(deleteKey, [...new Set([...queue, id])]).catch(() => { });
        setError('Entry was removed locally; its cloud deletion will retry next session.');
        console.warn(syncError);
      }
    })();
  };

  return <JournalContext.Provider value={{ entries, isLoading, error, saveEntry, deleteEntry, retryJournalSync }}>{children}</JournalContext.Provider>;
};
