import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from './supabase';
import { useAuth } from './AuthProvider';
import { useHabits } from './HabitContext';
import { validateJournalEntry } from '../domain/journalEngine';

export interface JournalEntry { id: string; habitId: string | null; date: string; text: string; createdAt: string; updatedAt: string }
interface JournalValue { entries: JournalEntry[]; isLoading: boolean; error: string | null; saveEntry: (value: Pick<JournalEntry, 'id' | 'habitId' | 'date' | 'text'>) => { error?: string }; deleteEntry: (id: string) => void }
const JournalContext = createContext<JournalValue | null>(null);
const STORAGE_KEY = '@daymark_journal_v1';
const DELETE_KEY = '@daymark_journal_delete_queue_v1';

export const useJournal = () => { const value = useContext(JournalContext); if (!value) throw new Error('useJournal must be used within JournalProvider'); return value; };

export const JournalProvider = ({ children }: { children: ReactNode }) => {
  const { user, session } = useAuth();
  const { allHabits } = useHabits();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const persist = useCallback(async (next: JournalEntry[]) => {
    setEntries(next.sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt)));
    try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
    catch { setError('Journal could not be saved on this device.'); }
  }, []);
  const syncEntry = useCallback(async (entry: JournalEntry) => {
    if (!session || !user || user.isGuest || !isSupabaseConfigured) return;
    const { error: syncError } = await supabase.from('journal_entries').upsert({ id: entry.id, user_id: user.id, habit_id: entry.habitId, entry_date: entry.date, text: entry.text, created_at: entry.createdAt, updated_at: entry.updatedAt });
    if (syncError) throw syncError;
  }, [session, user]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setIsLoading(true);
      let local: JournalEntry[] = [];
      try { const saved = await AsyncStorage.getItem(STORAGE_KEY); if (saved) local = JSON.parse(saved) as JournalEntry[]; if (mounted) setEntries(local); }
      catch { if (mounted) setError('Saved journal entries could not be read.'); }
      if (session && user && !user.isGuest && isSupabaseConfigured) {
        try {
          let pending: string[] = [];
          try { pending = JSON.parse((await AsyncStorage.getItem(DELETE_KEY)) ?? '[]') as string[]; } catch { pending = []; }
          const retry: string[] = [];
          for (const id of pending) { const result = await supabase.from('journal_entries').delete().eq('id', id).eq('user_id', user.id); if (result.error) retry.push(id); }
          await AsyncStorage.setItem(DELETE_KEY, JSON.stringify(retry));
          const { data, error: queryError } = await supabase.from('journal_entries').select('id,habit_id,entry_date,text,created_at,updated_at').eq('user_id', user.id).order('entry_date', { ascending: false });
          if (queryError) throw queryError;
          const cloud: JournalEntry[] = (data ?? []).filter(row => !retry.includes(row.id)).map(row => ({ id: row.id, habitId: row.habit_id, date: row.entry_date, text: row.text, createdAt: row.created_at, updatedAt: row.updated_at }));
          const map = new Map(cloud.map(entry => [entry.id, entry]));
          const localWins: JournalEntry[] = [];
          for (const item of local) { const remote = map.get(item.id); if (!remote || item.updatedAt > remote.updatedAt) { map.set(item.id, item); localWins.push(item); } }
          const merged = [...map.values()].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
          if (!mounted) return;
          await persist(merged);
          for (const item of localWins) await syncEntry(item);
          setError(null);
        } catch (syncError) { console.warn('Journal cloud sync failed:', syncError); if (mounted) setError('Cloud sync is unavailable. Entries remain saved locally and will retry next session.'); }
      }
      if (mounted) setIsLoading(false);
    };
    void load(); return () => { mounted = false; };
  }, [session, user, persist, syncEntry]);

  const saveEntry = (value: Pick<JournalEntry, 'id' | 'habitId' | 'date' | 'text'>) => {
    const text = value.text.trim();
    const validationError = validateJournalEntry({ date: value.date, text, habitId: value.habitId }, allHabits.map(habit => habit.id));
    if (validationError) return { error: validationError };
    const previous = entries.find(item => item.id === value.id);
    const now = new Date().toISOString();
    const entry: JournalEntry = { ...value, text, createdAt: previous?.createdAt ?? now, updatedAt: now };
    const next = [entry, ...entries.filter(item => item.id !== entry.id)];
    setError(null); void persist(next);
    void syncEntry(entry).catch(syncError => { console.warn('Journal entry saved locally; cloud sync failed:', syncError); setError('Entry saved locally, but cloud sync failed. It will retry next session.'); });
    return {};
  };
  const deleteEntry = (id: string) => {
    void persist(entries.filter(entry => entry.id !== id));
    void (async () => {
      if (!session || !user || user.isGuest || !isSupabaseConfigured) return;
      try { const result = await supabase.from('journal_entries').delete().eq('id', id).eq('user_id', user.id); if (result.error) throw result.error; }
      catch (syncError) { let queue: string[] = []; try { queue = JSON.parse((await AsyncStorage.getItem(DELETE_KEY)) ?? '[]') as string[]; } catch { /* recover with a fresh queue */ } await AsyncStorage.setItem(DELETE_KEY, JSON.stringify([...new Set([...queue, id])])); setError('Entry was removed locally; its cloud deletion will retry next session.'); console.warn(syncError); }
    })();
  };
  return <JournalContext.Provider value={{ entries, isLoading, error, saveEntry, deleteEntry }}>{children}</JournalContext.Provider>;
};
