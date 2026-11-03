import { parseLocalDate } from './habitEngine';

export interface JournalEntryInput { date: string; text: string; habitId: string | null }

export const validateJournalEntry = (value: JournalEntryInput, habitIds: string[]): string | null => {
  const text = value.text.trim();
  if (!text || text.length > 10000) return 'Write a journal entry between 1 and 10,000 characters.';
  if (!parseLocalDate(value.date)) return 'Choose a valid entry date.';
  if (value.habitId && !habitIds.includes(value.habitId)) return 'Choose a valid habit or no habit.';
  return null;
};

export const searchJournalEntries = <T extends JournalEntryInput>(entries: T[], query: string, habitNameById: Record<string, string>): T[] => {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return entries;
  return entries.filter(entry => `${entry.text} ${entry.date} ${entry.habitId ? habitNameById[entry.habitId] ?? '' : ''}`.toLocaleLowerCase().includes(normalized));
};
