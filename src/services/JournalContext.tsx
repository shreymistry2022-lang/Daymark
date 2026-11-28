// src/services/JournalContext.tsx
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useHabits } from './HabitContext';
import { validateJournalEntry } from '../domain/journalEngine';
import { useDeviceIdentity } from './DeviceIdentityProvider';

export interface JournalEntry { id: string; habitId: string | null; date: string; text: string; createdAt: string; updatedAt: string }
interface JournalValue { entries: JournalEntry[]; isLoading: boolean; error: string | null; saveEntry: (value: Pick<JournalEntry, 'id' | 'habitId' | 'date' | 'text'>) => { error?: string }; deleteEntry: (id: string) => void }
const JournalContext = createContext<JournalValue | null>(null);
const LEGACY_STORAGE_KEY = '@daymark_journal_v1';
const journalStorageKey = (uid: string) => `@daymark_journal_v1:${uid}`;

export const useJournal = () => { const value = useContext(JournalContext); if (!value) throw new Error('useJournal must be used within JournalProvider'); return value; };

export const JournalProvider = ({ children }: { children: ReactNode }) => {
  const { deviceOwnerId, isReady } = useDeviceIdentity();
  const { allHabits } = useHabits();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const deviceOwnerIdRef = useRef(deviceOwnerId);
  const entriesRef = useRef(entries);
  const allHabitsRef = useRef(allHabits);
  useEffect(() => {
    deviceOwnerIdRef.current = deviceOwnerId;
    entriesRef.current = entries;
    allHabitsRef.current = allHabits;
  });

  const persist = useCallback(async (next: JournalEntry[], uid?: string) => {
    const sorted = [...next].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
    setEntries(sorted);
    entriesRef.current = sorted;
    const targetKey = journalStorageKey(uid ?? deviceOwnerIdRef.current);
    try { await AsyncStorage.setItem(targetKey, JSON.stringify(sorted)); }
    catch { setError('Journal could not be saved on this device.'); }
  }, []);

  useEffect(() => {
    if (!isReady) return;
    let mounted = true;
    const load = async () => {
      setIsLoading(true);
      const storageKey = journalStorageKey(deviceOwnerId);
      let local: JournalEntry[] = [];
      try {
        let saved = await AsyncStorage.getItem(storageKey);
        if (!saved) {
          // Migrate from legacy guest key
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
      if (mounted) setIsLoading(false);
    };
    void load();
    return () => { mounted = false; };
  }, [deviceOwnerId, isReady]);

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
    return {};
  };

  const deleteEntry = (id: string) => {
    void persist(entries.filter(entry => entry.id !== id));
  };

  return <JournalContext.Provider value={{ entries, isLoading, error, saveEntry, deleteEntry }}>{children}</JournalContext.Provider>;
};
