// src/services/ReportsContext.tsx
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useHabits } from './HabitContext';
import { buildPerformanceReport, PerformanceReport, recentReportStarts } from '../domain/reportEngine';
import { addLocalDays, parseLocalDate, toLocalDateString } from '../domain/habitEngine';
import { usePreferences } from './PreferencesContext';
import { dateKeyInTimezone } from '../domain/preferencesEngine';
import { useDeviceIdentity } from './DeviceIdentityProvider';

interface ReportsValue {
  reports: PerformanceReport[];
  isLoading: boolean;
  error: string | null;
}

const ReportsContext = createContext<ReportsValue | null>(null);
const reportKey = (userId: string) => `@daymark_reports_v1:${userId}`;

export const useReports = () => {
  const value = useContext(ReportsContext);
  if (!value) throw new Error('useReports must be used within ReportsProvider');
  return value;
};

export const ReportsProvider = ({ children }: { children: ReactNode }) => {
  const { deviceOwnerId, isReady } = useDeviceIdentity();
  const { allHabits } = useHabits();
  const { preferences } = usePreferences();
  const [reports, setReports] = useState<PerformanceReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const key = reportKey(deviceOwnerId);
  const reportsRef = useRef<PerformanceReport[]>(reports);
  const hasGeneratedOnceRef = useRef(false);

  const persist = useCallback(async (next: PerformanceReport[]) => {
    const sorted = [...next].sort((a, b) => b.periodStart.localeCompare(a.periodStart) || a.periodType.localeCompare(b.periodType));
    reportsRef.current = sorted;
    setReports(sorted);
    try {
      await AsyncStorage.setItem(key, JSON.stringify(sorted));
    } catch {
      setError('Reports could not be saved on this device.');
    }
  }, [key]);

  useEffect(() => {
    if (!isReady) return;
    let mounted = true;
    const run = async () => {
      try {
        const local = JSON.parse((await AsyncStorage.getItem(key)) ?? '[]') as PerformanceReport[];
        if (mounted) {
          reportsRef.current = local;
          setReports(local);
        }
      } catch {
        if (mounted) setError('Saved report history could not be read.');
      }
      if (mounted) setIsLoading(false);
    };
    void run();
    return () => { mounted = false; };
  }, [key, isReady]);

  useEffect(() => {
    if (isLoading) return;
    let cancelled = false;

    const rebuildReports = () => {
      if (cancelled) return;
      const now = parseLocalDate(dateKeyInTimezone(new Date(), preferences.timezone)) ?? new Date();
      const today = dateKeyInTimezone(new Date(), preferences.timezone);

      const weekStarts = [...recentReportStarts('week', today, 53)].reverse();
      const monthStarts = [...recentReportStarts('month', today, 25)].reverse();

      const generated: PerformanceReport[] = [];
      let prevWeekPct: number | null = null;
      for (const start of weekStarts) {
        const priorStart = addLocalDays(start, -7);
        if (prevWeekPct === null) {
          prevWeekPct = buildPerformanceReport(allHabits, 'week', priorStart, today, null, now).percentage;
        }
        const rep = buildPerformanceReport(allHabits, 'week', start, today, prevWeekPct, now);
        prevWeekPct = rep.percentage;
        generated.push(rep);
      }

      let prevMonthPct: number | null = null;
      for (const start of monthStarts) {
        if (prevMonthPct === null) {
          const d = new Date(`${start}T12:00:00`);
          d.setMonth(d.getMonth() - 1);
          const priorStart = toLocalDateString(d);
          prevMonthPct = buildPerformanceReport(allHabits, 'month', priorStart, today, null, now).percentage;
        }
        const rep = buildPerformanceReport(allHabits, 'month', start, today, prevMonthPct, now);
        prevMonthPct = rep.percentage;
        generated.push(rep);
      }

      const generatedIds = new Set(generated.map(report => report.id));
      const history = reportsRef.current.filter(report => !generatedIds.has(report.id));
      const combined = [...generated, ...history];
      void persist(combined);
    };

    const delayMs = hasGeneratedOnceRef.current ? 1500 : 120;
    hasGeneratedOnceRef.current = true;
    const timer = setTimeout(rebuildReports, delayMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isLoading, allHabits, persist, preferences.timezone]);

  return <ReportsContext.Provider value={{ reports, isLoading, error }}>{children}</ReportsContext.Provider>;
};
