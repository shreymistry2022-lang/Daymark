import { calculateCompletionStats, calculateStreakStats, getHabitDayStatus, isScheduledOnDate, isTrackableOnDate, isWeeklyTargetMet } from '../src/domain/habitEngine';
import { SchedulableHabit } from '../src/domain/habitEngine';

const today = (year: number, monthIndex: number, day: number) => new Date(year, monthIndex, day, 12, 0, 0, 0);
const dailyHabit = (overrides: Partial<SchedulableHabit> = {}): SchedulableHabit => ({
  startDate: '2025-01-06',
  schedule: { frequency: 'daily' },
  completedDates: [],
  ...overrides,
});

describe('habit scheduling engine', () => {
  it('supports selected ISO weekdays and skips other days', () => {
    const habit = dailyHabit({ schedule: { frequency: 'selected_weekdays', weekdays: [1, 3, 5] } });
    expect(isScheduledOnDate(habit, '2025-01-06')).toBe(true); // Monday
    expect(isScheduledOnDate(habit, '2025-01-07')).toBe(false); // Tuesday
    expect(isScheduledOnDate(habit, '2025-01-08')).toBe(true); // Wednesday
  });

  it('allows tracking only on eligible local dates, including flexible weekly targets', () => {
    const weekdays = dailyHabit({ schedule: { frequency: 'weekdays' } });
    expect(isTrackableOnDate(weekdays, '2025-01-06', today(2025, 0, 6))).toBe(true);
    expect(isTrackableOnDate(weekdays, '2025-01-11', today(2025, 0, 11))).toBe(false);
    const paused = dailyHabit({ pausedPeriods: [{ startDate: '2025-01-06', endDate: '2025-01-07' }] });
    expect(isTrackableOnDate(paused, '2025-01-06', today(2025, 0, 6))).toBe(false);
    const flexible = dailyHabit({ schedule: { frequency: 'weekly_target', weeklyTarget: 3 } });
    expect(isTrackableOnDate(flexible, '2025-01-07', today(2025, 0, 7))).toBe(true);
  });

  it('does not mark future, pre-start, ended, paused, or unscheduled dates as missed', () => {
    const habit = dailyHabit({
      startDate: '2025-01-07',
      endDate: '2025-01-09',
      schedule: { frequency: 'weekdays' },
      pausedPeriods: [{ startDate: '2025-01-08', endDate: '2025-01-08' }],
    });
    const now = today(2025, 0, 11);
    expect(getHabitDayStatus(habit, '2025-01-06', now)).toBe('not_started');
    expect(getHabitDayStatus(habit, '2025-01-08', now)).toBe('paused');
    expect(getHabitDayStatus(habit, '2025-01-12', now)).toBe('future');
    expect(getHabitDayStatus(habit, '2025-01-10', now)).toBe('ended');
    expect(getHabitDayStatus(habit, '2025-01-07', now)).toBe('missed');
  });

  it('keeps the streak across unscheduled and paused dates', () => {
    const habit = dailyHabit({
      schedule: { frequency: 'selected_weekdays', weekdays: [1, 3, 5] },
      pausedPeriods: [{ startDate: '2025-01-08', endDate: '2025-01-08' }],
      completedDates: ['2025-01-06', '2025-01-10'],
    });
    const stats = calculateStreakStats(habit, today(2025, 0, 10));
    expect(stats.currentStreak).toBe(2);
    expect(stats.totalSuccessfulScheduledDays).toBe(2);
  });

  it('does not break the current streak before today has ended', () => {
    const habit = dailyHabit({ completedDates: ['2025-01-06', '2025-01-07'] });
    const stats = calculateStreakStats(habit, today(2025, 0, 8));
    expect(stats.currentStreak).toBe(2);
    expect(getHabitDayStatus(habit, '2025-01-08', today(2025, 0, 8))).toBe('pending');
  });

  it('requires the configured count or measurable target before marking a day complete', () => {
    const habit = dailyHabit({
      trackingMethod: 'count',
      targetValue: 8,
      logs: [{ date: '2025-01-06', value: 7 }],
    });
    expect(getHabitDayStatus(habit, '2025-01-06', today(2025, 0, 7))).toBe('missed');
    const reached = { ...habit, logs: [{ date: '2025-01-06', value: 8 }] };
    expect(getHabitDayStatus(reached, '2025-01-06', today(2025, 0, 7))).toBe('completed');
  });

  it('evaluates flexible weekly targets as weeks, not seven daily misses', () => {
    const habit = dailyHabit({
      schedule: { frequency: 'weekly_target', weeklyTarget: 3 },
      completedDates: ['2025-01-06', '2025-01-08', '2025-01-10'],
    });
    expect(isScheduledOnDate(habit, '2025-01-07')).toBe(false);
    expect(isWeeklyTargetMet(habit, '2025-01-06')).toBe(true);
    const stats = calculateStreakStats(habit, today(2025, 0, 12));
    expect(stats.currentStreak).toBe(1);
    expect(stats.totalSuccessfulScheduledDays).toBe(1);
  });

  it('breaks quit-habit streaks at a recorded lapse without deleting past success', () => {
    const habit = dailyHabit({
      habitKind: 'quit',
      logs: [{ date: '2025-01-09', outcome: 'lapse' }],
    });
    const stats = calculateStreakStats(habit, today(2025, 0, 10));
    expect(getHabitDayStatus(habit, '2025-01-09', today(2025, 0, 10))).toBe('lapse');
    expect(stats.currentStreak).toBe(1);
    expect(stats.bestStreak).toBe(3);
  });

  it('respects legacy targetFrequency values during migration', () => {
    const habit = { startDate: '2025-01-06', targetFrequency: 'Weekends' };
    expect(isScheduledOnDate(habit, '2025-01-06')).toBe(false);
    expect(isScheduledOnDate(habit, '2025-01-11')).toBe(true);
  });

  it('calculates completion rates using only scheduled days', () => {
    const habit = dailyHabit({
      schedule: { frequency: 'selected_weekdays', weekdays: [1, 3, 5] },
      completedDates: ['2025-01-06', '2025-01-10'],
    });
    expect(calculateCompletionStats(habit, '2025-01-06', '2025-01-10', today(2025, 0, 10))).toEqual({ completed: 2, scheduled: 3, percentage: 67 });
  });

  it('treats a flexible weekly target as one weekly success opportunity', () => {
    const habit = dailyHabit({
      schedule: { frequency: 'weekly_target', weeklyTarget: 3 },
      completedDates: ['2025-01-06', '2025-01-08', '2025-01-10'],
    });
    expect(calculateCompletionStats(habit, '2025-01-06', '2025-01-12', today(2025, 0, 12))).toEqual({ completed: 1, scheduled: 1, percentage: 100 });
    expect(getHabitDayStatus(habit, '2025-01-08', today(2025, 0, 12))).toBe('completed');
  });
});
