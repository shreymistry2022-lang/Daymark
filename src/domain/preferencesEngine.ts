import type { DateFormat } from '../services/PreferencesContext';
import { addLocalDays, parseLocalDate } from './habitEngine';

export const getWeekDates = (date: string, weekStart: number): string[] => {
  const parsed = parseLocalDate(date);
  if (!parsed) return [];
  const offset = (parsed.getDay() - weekStart + 7) % 7;
  const start = addLocalDays(date, -offset);
  return Array.from({ length: 7 }, (_, index) => addLocalDays(start, index));
};

export const dateKeyInTimezone = (date: Date, timezone: string): string => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

export const formatAppDate = (date: Date, format: DateFormat, timezone: string): string => {
  if (format === 'iso') return dateKeyInTimezone(date, timezone);
  const locale = format === 'us' ? 'en-US' : format === 'uk' ? 'en-GB' : undefined;
  return new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: timezone }).format(date);
};
