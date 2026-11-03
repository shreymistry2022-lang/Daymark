import { Habit } from '../services/HabitContext';
import { calculateCompletionStats, calculateStreakStats, getHabitDayStatus, toLocalDateString } from './habitEngine';

export type AchievementKey = 'first_step' | 'seven_days' | 'thirty_days' | 'century' | 'momentum' | 'consistency';
export interface AchievementDefinition { key: AchievementKey; title: string; description: string; target: number }
export interface AchievementProgress extends AchievementDefinition { progress: number; unlocked: boolean; unlockedAt: string | null }
export const ACHIEVEMENTS: AchievementDefinition[] = [
  { key: 'first_step', title: 'First Step', description: 'Complete your first habit.', target: 1 },
  { key: 'seven_days', title: 'Seven Days', description: 'Complete one habit on seven scheduled days in a row.', target: 7 },
  { key: 'thirty_days', title: 'Thirty Days', description: 'Reach 30 successful scheduled habit days.', target: 30 },
  { key: 'century', title: 'Century', description: 'Reach 100 successful habit completions.', target: 100 },
  { key: 'momentum', title: 'Momentum', description: 'Complete five distinct habits in a single day.', target: 5 },
  { key: 'consistency', title: 'Consistency', description: 'Complete at least 80% of scheduled habits in a week.', target: 80 },
];

export const calculateAchievementProgress = (habits: Habit[], now = new Date(), unlockedAtByKey: Record<string, string> = {}): AchievementProgress[] => {
  const today = toLocalDateString(now);
  const throughDate = habits.reduce((latest, habit) => {
    const dates = [...(habit.completedDates ?? []), ...(habit.logs ?? []).map(log => log.date)].filter(date => date <= today).sort();
    return dates.length ? (dates[dates.length - 1] > latest ? dates[dates.length - 1] : latest) : latest;
  }, '0000-00-00');
  let successfulDays = 0;
  let peakHabitStreak = 0;
  const dayCounts = new Map<string, number>();
  for (const habit of habits) {
    if (habit.archivedAt && habit.archivedAt > now.toISOString()) continue;
    const stats = calculateStreakStats(habit, now);
    successfulDays += stats.totalSuccessfulScheduledDays;
    peakHabitStreak = Math.max(peakHabitStreak, stats.bestStreak);
    for (const date of new Set([...(habit.completedDates ?? []), ...(habit.logs ?? []).map(log => log.date)])) {
      if (date <= today && getHabitDayStatus(habit, date, now) === 'completed') dayCounts.set(date, (dayCounts.get(date) ?? 0) + 1);
    }
  }
  const maxDay = Math.max(0, ...dayCounts.values());
  let bestWeekPercent = 0;
  if (throughDate !== '0000-00-00') {
    const end = new Date(`${throughDate}T12:00:00`);
    const monday = new Date(end); monday.setDate(end.getDate() - ((end.getDay() + 6) % 7));
    for (let offset = 0; offset < 12; offset += 1) {
      const weekStart = new Date(monday); weekStart.setDate(monday.getDate() - offset * 7);
      const start = toLocalDateString(weekStart);
      const weekEnd = toLocalDateString(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6, 12));
      let completed = 0; let scheduled = 0;
      for (const habit of habits) { const stats = calculateCompletionStats(habit, start, weekEnd, now); completed += stats.completed; scheduled += stats.scheduled; }
      if (scheduled) bestWeekPercent = Math.max(bestWeekPercent, Math.round(completed / scheduled * 100));
    }
  }
  const values: Record<AchievementKey, number> = { first_step: successfulDays > 0 ? 1 : 0, seven_days: peakHabitStreak, thirty_days: successfulDays, century: successfulDays, momentum: maxDay, consistency: bestWeekPercent };
  return ACHIEVEMENTS.map(item => { const unlockedAt = unlockedAtByKey[item.key] ?? null; const progress = Math.min(item.target, values[item.key]); return { ...item, progress, unlocked: Boolean(unlockedAt) || progress >= item.target, unlockedAt }; });
};
