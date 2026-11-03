import { Habit } from '../services/HabitContext';
import { addLocalDays, calculateCompletionStats, parseLocalDate, toLocalDateString } from './habitEngine';

export type ReportPeriod = 'week' | 'month';
export interface HabitReportStats { habitId: string; name: string; completed: number; scheduled: number; percentage: number }
export interface PerformanceReport {
  id: string; periodType: ReportPeriod; periodStart: string; periodEnd: string; generatedAt: string;
  totalScheduled: number; totalCompleted: number; percentage: number;
  strongestHabit: HabitReportStats | null; weakestHabit: HabitReportStats | null; bestDay: { date: string; percentage: number } | null;
  previousPercentage: number | null; improvementPercentage: number | null; trend: number[]; habits: HabitReportStats[];
}
const isoWeekday = (date: Date) => (date.getDay() + 6) % 7;
export const getReportPeriod = (periodType: ReportPeriod, date: string) => {
  const parsed = parseLocalDate(date);
  if (!parsed) return null;
  const start = new Date(parsed);
  if (periodType === 'week') start.setDate(start.getDate() - isoWeekday(start));
  else start.setDate(1);
  const end = periodType === 'week' ? new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 12) : new Date(start.getFullYear(), start.getMonth() + 1, 0, 12);
  return { start: toLocalDateString(start), end: toLocalDateString(end) };
};

export const buildPerformanceReport = (habits: Habit[], periodType: ReportPeriod, periodStart: string, asOf = toLocalDateString(new Date()), previousPercentage: number | null = null, now = new Date()): PerformanceReport => {
  const period = getReportPeriod(periodType, periodStart);
  if (!period) throw new Error('A valid report period start date is required.');
  const end = period.end > asOf ? asOf : period.end;
  const habitStats = habits.map(habit => {
    const stats = calculateCompletionStats(habit, period.start, end, now);
    return { habitId: habit.id, name: habit.name, completed: stats.completed, scheduled: stats.scheduled, percentage: stats.percentage };
  }).filter(item => item.scheduled > 0);
  const totalCompleted = habitStats.reduce((sum, item) => sum + item.completed, 0);
  const totalScheduled = habitStats.reduce((sum, item) => sum + item.scheduled, 0);
  const byPercentage = [...habitStats].sort((a, b) => b.percentage - a.percentage || b.completed - a.completed);
  let bestDay: PerformanceReport['bestDay'] = null;
  for (let date = period.start; date <= end; date = addLocalDays(date, 1)) {
    const dayStats = habits.reduce((sum, habit) => { const result = calculateCompletionStats(habit, date, date, now); return { completed: sum.completed + result.completed, scheduled: sum.scheduled + result.scheduled }; }, { completed: 0, scheduled: 0 });
    const percentage = dayStats.scheduled ? Math.round(dayStats.completed / dayStats.scheduled * 100) : -1;
    if (percentage >= 0 && (!bestDay || percentage > bestDay.percentage)) bestDay = { date, percentage };
  }
  const trend: number[] = [];
  if (periodType === 'month') {
    for (let start = period.start; start <= end; start = addLocalDays(start, 7)) {
      const weekEnd = addLocalDays(start, 6) > end ? end : addLocalDays(start, 6);
      const stats = habits.reduce((sum, habit) => { const result = calculateCompletionStats(habit, start, weekEnd, now); return { completed: sum.completed + result.completed, scheduled: sum.scheduled + result.scheduled }; }, { completed: 0, scheduled: 0 });
      trend.push(stats.scheduled ? Math.round(stats.completed / stats.scheduled * 100) : 0);
    }
  }
  const percentage = totalScheduled ? Math.round(totalCompleted / totalScheduled * 100) : 0;
  return {
    id: `${periodType}:${period.start}`, periodType, periodStart: period.start, periodEnd: end, generatedAt: new Date().toISOString(),
    totalScheduled, totalCompleted, percentage, strongestHabit: byPercentage[0] ?? null,
    weakestHabit: byPercentage.length ? byPercentage[byPercentage.length - 1] : null, bestDay,
    previousPercentage, improvementPercentage: previousPercentage == null ? null : percentage - previousPercentage,
    trend, habits: habitStats,
  };
};

export const recentReportStarts = (periodType: ReportPeriod, asOf: string, count: number) => {
  const current = getReportPeriod(periodType, asOf);
  if (!current) return [];
  return Array.from({ length: count }, (_, index) => {
    const date = parseLocalDate(current.start)!;
    if (periodType === 'week') date.setDate(date.getDate() - index * 7);
    else date.setMonth(date.getMonth() - index);
    return toLocalDateString(date);
  });
};
