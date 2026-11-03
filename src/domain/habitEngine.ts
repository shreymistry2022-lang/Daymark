import { HabitKind, HabitLog, HabitPause, HabitSchedule, TrackingMethod } from './habitTypes';

export interface SchedulableHabit {
  targetFrequency?: string;
  schedule?: HabitSchedule;
  startDate?: string;
  endDate?: string | null;
  pausedPeriods?: HabitPause[];
  completedDates?: string[];
  logs?: HabitLog[];
  habitKind?: HabitKind;
  trackingMethod?: TrackingMethod;
  targetValue?: number;
  configurationHistory?: {
    effectiveFrom: string;
    habitKind: HabitKind;
    trackingMethod: TrackingMethod;
    targetValue: number;
    targetFrequency?: string;
    schedule: HabitSchedule;
    startDate?: string;
    endDate?: string | null;
  }[];
  configurationEffectiveFrom?: string;
}

export type HabitDayStatus = 'future' | 'not_started' | 'ended' | 'paused' | 'unscheduled' | 'completed' | 'lapse' | 'missed' | 'pending';

export interface StreakStats {
  currentStreak: number;
  bestStreak: number;
  totalSuccessfulScheduledDays: number;
  streakHistory: number[];
}

export interface HabitCompletionStats {
  completed: number;
  scheduled: number;
  percentage: number;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const toLocalDateString = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const parseLocalDate = (value: string): Date | null => {
  if (!DATE_PATTERN.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
  return parsed;
};

export const addLocalDays = (value: string, offset: number): string => {
  const date = parseLocalDate(value);
  if (!date) return value;
  date.setDate(date.getDate() + offset);
  return toLocalDateString(date);
};

const isoWeekday = (date: Date) => date.getDay() === 0 ? 7 : date.getDay();

const configForDate = <T extends SchedulableHabit>(habit: T, date: string): T => {
  if (!habit.configurationEffectiveFrom || date >= habit.configurationEffectiveFrom) return habit;
  const historical = [...(habit.configurationHistory ?? [])]
    .filter(config => config.effectiveFrom <= date)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  return historical ? { ...habit, ...historical } : habit;
};

export const normalizeSchedule = (habit: Pick<SchedulableHabit, 'schedule' | 'targetFrequency'>): HabitSchedule => {
  if (habit.schedule) return habit.schedule;
  const frequency = (habit.targetFrequency ?? 'Daily').toLowerCase();
  if (frequency === 'weekdays') return { frequency: 'weekdays' };
  if (frequency === 'weekends') return { frequency: 'weekends' };
  const weeklyMatch = frequency.match(/^(\d+)\s*x\s*\/\s*week$/);
  if (weeklyMatch) return { frequency: 'weekly_target', weeklyTarget: Number(weeklyMatch[1]) };
  return { frequency: 'daily' };
};

export const isPausedOnDate = (habit: Pick<SchedulableHabit, 'pausedPeriods'>, date: string): boolean =>
  (habit.pausedPeriods ?? []).some(period => period.startDate <= date && (!period.endDate || period.endDate >= date));

export const isScheduledOnDate = (habit: SchedulableHabit, dateString: string): boolean => {
  const date = parseLocalDate(dateString);
  if (!date) return false;
  const config = configForDate(habit, dateString);
  if ((config.startDate && dateString < config.startDate) || (config.endDate && dateString > config.endDate)) return false;
  if (isPausedOnDate(habit, dateString)) return false;
  const schedule = normalizeSchedule(config);
  const weekday = isoWeekday(date);
  switch (schedule.frequency) {
    case 'weekdays': return weekday >= 1 && weekday <= 5;
    case 'weekends': return weekday >= 6;
    case 'selected_weekdays': return Boolean(schedule.weekdays?.includes(weekday));
    case 'monthly_dates': return Boolean(schedule.monthDays?.includes(date.getDate()));
    // A target without specified weekdays is measured as a weekly period, not as a missed day.
    case 'weekly_target': return Boolean(schedule.weekdays?.includes(weekday));
    case 'daily':
    default: return true;
  }
};

export const isTrackableOnDate = (habit: SchedulableHabit, dateString: string, now = new Date()): boolean => {
  const date = parseLocalDate(dateString);
  if (!date || dateString > toLocalDateString(now)) return false;
  const config = configForDate(habit, dateString);
  if ((config.startDate && dateString < config.startDate) || (config.endDate && dateString > config.endDate) || isPausedOnDate(habit, dateString)) return false;
  const schedule = normalizeSchedule(config);
  return isScheduledOnDate(habit, dateString) || (schedule.frequency === 'weekly_target' && !schedule.weekdays?.length);
};

export const isWeeklyTargetMet = (habit: SchedulableHabit, weekStart: string): boolean => {
  const config = configForDate(habit, weekStart);
  const schedule = normalizeSchedule(config);
  if (schedule.frequency !== 'weekly_target') return false;
  const target = Math.max(1, Math.min(7, schedule.weeklyTarget ?? 1));
  const weekDates = Array.from({ length: 7 }, (_, index) => addLocalDays(weekStart, index));
  const scheduledDates = schedule.weekdays?.length
    ? weekDates.filter(date => isScheduledOnDate(habit, date))
    : weekDates.filter(date => {
        if (habit.startDate && date < habit.startDate) return false;
        if (habit.endDate && date > habit.endDate) return false;
        return !isPausedOnDate(habit, date);
      });
  const successful = scheduledDates.filter(date => logSuccessful(habit, date)).length;
  return successful >= target;
};

const logSuccessful = (habit: SchedulableHabit, date: string): boolean => {
  const config = configForDate(habit, date);
  const log = habit.logs?.find(entry => entry.date === date);
  if (log?.outcome === 'lapse') return false;
  if (config.habitKind === 'quit') return true;
  if (config.trackingMethod !== 'count' && config.trackingMethod !== 'measurable') {
    return log?.outcome === 'completed' || Boolean(habit.completedDates?.includes(date));
  }
  const actual = typeof log?.value === 'number' ? log.value : (habit.completedDates?.includes(date) ? (config.targetValue ?? 1) : 0);
  return actual >= (config.targetValue ?? 1);
};

export const getHabitDayStatus = (habit: SchedulableHabit, date: string, now = new Date()): HabitDayStatus => {
  const parsed = parseLocalDate(date);
  if (!parsed) return 'unscheduled';
  const config = configForDate(habit, date);
  const today = toLocalDateString(now);
  if (date > today) return 'future';
  if (config.startDate && date < config.startDate) return 'not_started';
  if (config.endDate && date > config.endDate) return 'ended';
  if (isPausedOnDate(habit, date)) return 'paused';
  const schedule = normalizeSchedule(config);
  if (schedule.frequency === 'weekly_target' && !schedule.weekdays?.length) {
    const log = habit.logs?.find(entry => entry.date === date);
    if (log?.outcome === 'lapse') return 'lapse';
    if (logSuccessful(habit, date)) return 'completed';
    return date === today ? 'pending' : 'unscheduled';
  }
  if (!isScheduledOnDate(habit, date)) return 'unscheduled';
  const log = habit.logs?.find(entry => entry.date === date);
  if (log?.outcome === 'lapse') return 'lapse';
  if (logSuccessful(habit, date)) return 'completed';
  if (date === today) return 'pending';
  return 'missed';
};

export const calculateStreakStats = (habit: SchedulableHabit, now = new Date()): StreakStats => {
  const today = toLocalDateString(now);
  const start = habit.startDate ?? [...(habit.completedDates ?? []), ...(habit.logs ?? []).map(log => log.date)].sort()[0] ?? today;
  const startDate = parseLocalDate(start);
  if (!startDate || start > today) return { currentStreak: 0, bestStreak: 0, totalSuccessfulScheduledDays: 0, streakHistory: [] };

  const schedule = normalizeSchedule(habit);
  if (schedule.frequency === 'weekly_target' && !schedule.weekdays?.length) {
    return calculateWeeklyTargetStreak(habit, start, today, now);
  }

  const runs: number[] = [];
  let run = 0;
  let total = 0;
  for (let date = start; date <= today; date = addLocalDays(date, 1)) {
    const status = getHabitDayStatus(habit, date, now);
    if (status === 'completed' || (habit.habitKind === 'quit' && status === 'pending')) {
      run += 1;
      total += 1;
    } else if (status === 'missed' || status === 'lapse') {
      if (run > 0) runs.push(run);
      run = 0;
    }
  }
  if (run > 0) runs.push(run);

  // An unfinished current scheduled day does not break an existing streak.
  let currentStreak = runs[runs.length - 1] ?? 0;
  if (getHabitDayStatus(habit, today, now) === 'pending' && habit.habitKind !== 'quit') {
    const yesterday = addLocalDays(today, -1);
    if (isScheduledOnDate(habit, today)) currentStreak = streakEndingOn(habit, yesterday, now);
  }
  return { currentStreak, bestStreak: Math.max(0, ...runs), totalSuccessfulScheduledDays: total, streakHistory: runs };
};

export const calculateCompletionStats = (
  habit: SchedulableHabit,
  fromDate: string,
  throughDate = toLocalDateString(new Date()),
  now = new Date(),
): HabitCompletionStats => {
  const today = toLocalDateString(now);
  const endDate = throughDate > today ? today : throughDate;
  if (!parseLocalDate(fromDate) || !parseLocalDate(endDate) || fromDate > endDate) return { completed: 0, scheduled: 0, percentage: 0 };
  const schedule = normalizeSchedule(habit);
  if (schedule.frequency === 'weekly_target' && !schedule.weekdays?.length) {
    const first = parseLocalDate(fromDate)!;
    first.setDate(first.getDate() - (isoWeekday(first) - 1));
    let completed = 0;
    let scheduled = 0;
    for (let week = toLocalDateString(first); week <= endDate; week = addLocalDays(week, 7)) {
      const weekEnd = addLocalDays(week, 6);
      if (weekEnd < fromDate || (habit.startDate && weekEnd < habit.startDate) || (habit.endDate && week > habit.endDate)) continue;
      scheduled += 1;
      if (isWeeklyTargetMet(habit, week)) completed += 1;
    }
    return { completed, scheduled, percentage: scheduled ? Math.round(completed / scheduled * 100) : 0 };
  }
  let completed = 0;
  let scheduled = 0;
  for (let date = fromDate; date <= endDate; date = addLocalDays(date, 1)) {
    if (!isScheduledOnDate(habit, date)) continue;
    scheduled += 1;
    if (getHabitDayStatus(habit, date, now) === 'completed') completed += 1;
  }
  return { completed, scheduled, percentage: scheduled ? Math.round(completed / scheduled * 100) : 0 };
};

const streakEndingOn = (habit: SchedulableHabit, end: string, now: Date): number => {
  let count = 0;
  for (let date = end; date >= (habit.startDate ?? end); date = addLocalDays(date, -1)) {
    const status = getHabitDayStatus(habit, date, now);
    if (status === 'missed' || status === 'lapse' || status === 'not_started' || status === 'ended' || status === 'future') break;
    if (status === 'completed') count += 1;
  }
  return count;
};

const calculateWeeklyTargetStreak = (habit: SchedulableHabit, start: string, today: string, now: Date): StreakStats => {
  const startDate = parseLocalDate(start)!;
  const firstMonday = addLocalDays(start, -(isoWeekday(startDate) - 1));
  let current = 0;
  let best = 0;
  let total = 0;
  const runs: number[] = [];
  let run = 0;
  for (let monday = firstMonday; monday <= today; monday = addLocalDays(monday, 7)) {
    const sunday = addLocalDays(monday, 6);
    if (sunday < start || monday > today) continue;
    const complete = isWeeklyTargetMet(habit, monday);
    const isCurrentWeek = today >= monday && today <= sunday;
    if (complete || (isCurrentWeek && toLocalDateString(now) === today)) {
      if (complete) total += 1;
      if (complete) run += 1;
      else if (isCurrentWeek) { current = run; continue; }
    } else if (sunday < today) {
      if (run > 0) runs.push(run);
      run = 0;
    }
  }
  if (run > 0) runs.push(run);
  current = run;
  best = Math.max(0, ...runs);
  return { currentStreak: current, bestStreak: best, totalSuccessfulScheduledDays: total, streakHistory: runs };
};
