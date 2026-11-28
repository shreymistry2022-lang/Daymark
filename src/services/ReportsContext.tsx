import React, { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { useAuth } from './AuthProvider';
import { useHabits } from './HabitContext';
import { buildPerformanceReport, PerformanceReport, recentReportStarts } from '../domain/reportEngine';
import { addLocalDays, parseLocalDate, toLocalDateString } from '../domain/habitEngine';
import { usePreferences } from './PreferencesContext';
import { dateKeyInTimezone } from '../domain/preferencesEngine';
import { isTransientCloudError, resolveCloudAuth } from './cloudSyncHelpers';

interface ReportsValue {
  reports: PerformanceReport[];
  isLoading: boolean;
  error: string | null;
}

const ReportsContext = createContext<ReportsValue | null>(null);
const reportKey = (userId?: string) => `@daymark_reports_v1:${userId ?? 'guest'}`;

export const useReports = () => {
  const value = useContext(ReportsContext);
  if (!value) throw new Error('useReports must be used within ReportsProvider');
  return value;
};

export const ReportsProvider = ({ children }: { children: ReactNode }) => {
  const { user, session } = useAuth();
  const { allHabits } = useHabits();
  const { preferences } = usePreferences();
  const [reports, setReports] = useState<PerformanceReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const owner = user?.id ?? 'guest';
  const key = reportKey(owner);
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
    let mounted = true;
    const run = async () => {
      let local: PerformanceReport[] = [];
      try {
        local = JSON.parse((await AsyncStorage.getItem(key)) ?? '[]') as PerformanceReport[];
        if (mounted) {
          reportsRef.current = local;
          setReports(local);
        }
      } catch {
        if (mounted) setError('Saved report history could not be read.');
      }

      const cloudAuth = await resolveCloudAuth(user, session);
      if (cloudAuth) {
        try {
          const { data, error: queryError } = await supabase
            .from('performance_reports')
            .select('period_type,period_start,report_data')
            .eq('user_id', cloudAuth.userId)
            .order('period_start', { ascending: false });
          if (queryError) throw queryError;
          const byId = new Map(local.map(report => [report.id, report]));
          for (const row of data ?? []) {
            const cloud = row.report_data as PerformanceReport;
            if (cloud?.id) {
              const previous = byId.get(cloud.id);
              if (!previous || previous.generatedAt < cloud.generatedAt) byId.set(cloud.id, cloud);
            }
          }
          if (!mounted) return;
          await persist([...byId.values()]);
          setError(null);
        } catch (syncError) {
          console.warn('Report history cloud sync deferred:', syncError);
          if (mounted && !isTransientCloudError(syncError)) {
            setError('Report sync is unavailable. Saved reports remain available on this device.');
          }
        }
      }
      if (mounted) setIsLoading(false);
    };
    void run();
    return () => {
      mounted = false;
    };
  }, [key, session, user, persist]);

  useEffect(() => {
    if (isLoading) return;
    let cancelled = false;

    const rebuildReports = () => {
      if (cancelled) return;
      const now = parseLocalDate(dateKeyInTimezone(new Date(), preferences.timezone)) ?? new Date();
      const today = dateKeyInTimezone(new Date(), preferences.timezone);

      // Build weeks & months chronologically so each previous period's percentage is computed in a single pass.
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

      void (async () => {
        const cloudAuth = await resolveCloudAuth(user, session);
        if (!cloudAuth || cancelled) return;
        const rows = generated.map(report => ({
          user_id: cloudAuth.userId,
          period_type: report.periodType,
          period_start: report.periodStart,
          period_end: report.periodEnd,
          report_data: report,
          generated_at: report.generatedAt,
        }));
        const { error: syncError } = await supabase
          .from('performance_reports')
          .upsert(rows, { onConflict: 'user_id,period_type,period_start' });
        if (syncError) {
          console.warn('Reports saved locally; cloud sync deferred:', syncError);
          if (!isTransientCloudError(syncError)) {
            setError('Reports are saved locally, but cloud sync failed.');
          }
        }
      })();
    };

    const delayMs = hasGeneratedOnceRef.current ? 1500 : 120;
    hasGeneratedOnceRef.current = true;
    const timer = setTimeout(rebuildReports, delayMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isLoading, allHabits, session, user, persist, preferences.timezone]);

  return <ReportsContext.Provider value={{ reports, isLoading, error }}>{children}</ReportsContext.Provider>;
};
