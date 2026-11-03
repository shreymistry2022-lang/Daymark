import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from './supabase';
import { useAuth } from './AuthProvider';
import { useHabits } from './HabitContext';
import { buildPerformanceReport, PerformanceReport, recentReportStarts } from '../domain/reportEngine';
import { addLocalDays, parseLocalDate, toLocalDateString } from '../domain/habitEngine';
import { usePreferences } from './PreferencesContext';
import { dateKeyInTimezone } from '../domain/preferencesEngine';

interface ReportsValue { reports: PerformanceReport[]; isLoading: boolean; error: string | null }
const ReportsContext = createContext<ReportsValue | null>(null);
const reportKey = (userId?: string) => `@daymark_reports_v1:${userId ?? 'guest'}`;
export const useReports = () => { const value = useContext(ReportsContext); if (!value) throw new Error('useReports must be used within ReportsProvider'); return value; };

export const ReportsProvider = ({ children }: { children: ReactNode }) => {
  const { user, session } = useAuth();
  const { allHabits } = useHabits();
  const { preferences } = usePreferences();
  const [reports, setReports] = useState<PerformanceReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const owner = user?.id ?? 'guest';
  const key = reportKey(owner);
  const persist = useCallback(async (next: PerformanceReport[]) => {
    setReports(next.sort((a, b) => b.periodStart.localeCompare(a.periodStart) || a.periodType.localeCompare(b.periodType)));
    try { await AsyncStorage.setItem(key, JSON.stringify(next)); } catch { setError('Reports could not be saved on this device.'); }
  }, [key]);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      let local: PerformanceReport[] = [];
      try { local = JSON.parse((await AsyncStorage.getItem(key)) ?? '[]') as PerformanceReport[]; if (mounted) setReports(local); }
      catch { if (mounted) setError('Saved report history could not be read.'); }
      if (session && user && !user.isGuest && isSupabaseConfigured) {
        try {
          const { data, error: queryError } = await supabase.from('performance_reports').select('period_type,period_start,report_data').eq('user_id', user.id).order('period_start', { ascending: false });
          if (queryError) throw queryError;
          const byId = new Map(local.map(report => [report.id, report]));
          for (const row of data ?? []) {
            const cloud = row.report_data as PerformanceReport;
            if (cloud?.id) { const previous = byId.get(cloud.id); if (!previous || previous.generatedAt < cloud.generatedAt) byId.set(cloud.id, cloud); }
          }
          if (!mounted) return;
          await persist([...byId.values()]); setError(null);
        } catch (syncError) { console.warn('Report history cloud sync failed:', syncError); if (mounted) setError('Report sync is unavailable. Saved reports remain available on this device.'); }
      }
      if (mounted) setIsLoading(false);
    };
    void run(); return () => { mounted = false; };
  }, [key, session, user, persist]);

  useEffect(() => {
    if (isLoading) return;
    const now = parseLocalDate(dateKeyInTimezone(new Date(), preferences.timezone)) ?? new Date();
    const today = dateKeyInTimezone(new Date(), preferences.timezone);
    const starts = [...recentReportStarts('week', today, 53).map(start => ({ type: 'week' as const, start })), ...recentReportStarts('month', today, 25).map(start => ({ type: 'month' as const, start }))];
    const generated = starts.map(({ type, start }) => {
      const priorStart = type === 'week' ? addLocalDays(start, -7) : (() => { const date = new Date(`${start}T12:00:00`); date.setMonth(date.getMonth() - 1); return toLocalDateString(date); })();
      const previous = buildPerformanceReport(allHabits, type, priorStart, today, null, now).percentage;
      return buildPerformanceReport(allHabits, type, start, today, previous, now);
    });
    const generatedIds = new Set(generated.map(report => report.id));
    const history = reports.filter(report => !generatedIds.has(report.id));
    const combined = [...generated, ...history];
    setTimeout(() => { void persist(combined); }, 0);
    if (session && user && !user.isGuest && isSupabaseConfigured) {
      const rows = generated.map(report => ({ user_id: user.id, period_type: report.periodType, period_start: report.periodStart, period_end: report.periodEnd, report_data: report, generated_at: report.generatedAt }));
      void supabase.from('performance_reports').upsert(rows, { onConflict: 'user_id,period_type,period_start' }).then(({ error: syncError }) => {
        if (syncError) { console.warn('Reports saved locally; cloud sync failed:', syncError); setError('Reports are saved locally, but cloud sync failed.'); }
      });
    }
  // allHabits is the single source for report refreshes; reports is intentionally omitted to avoid a save loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, allHabits, session, user, persist, preferences.timezone]);

  return <ReportsContext.Provider value={{ reports, isLoading, error }}>{children}</ReportsContext.Provider>;
};
