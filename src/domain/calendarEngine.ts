import { getHabitDayStatus, isScheduledOnDate, isTrackableOnDate, SchedulableHabit } from './habitEngine';

export interface CalendarDayActivity {
  eligible: SchedulableHabit[];
  completed: number;
  lapses: number;
  intensity: number;
  partialProgress: number;
}

export const calculateCalendarDayActivity = (habits: SchedulableHabit[], date: string, now: Date = new Date()): CalendarDayActivity => {
  const eligible = habits.filter(habit => isScheduledOnDate(habit, date)
    || (habit.schedule?.frequency === 'weekly_target' && !habit.schedule.weekdays?.length && isTrackableOnDate(habit, date, now)));
  const activities = eligible.map(habit => ({ habit, status: getHabitDayStatus(habit, date, now) }));
  const completed = activities.filter(item => item.status === 'completed').length;
  const lapses = activities.filter(item => item.status === 'lapse').length;
  const partialProgress = activities.reduce((sum, item) => {
    const { habit, status } = item;
    if ((status !== 'missed' && status !== 'pending') || (habit.trackingMethod !== 'count' && habit.trackingMethod !== 'measurable')) return sum;
    const value = habit.logs?.find(log => log.date === date)?.value ?? 0;
    return sum + Math.min(1, value / Math.max(1, habit.targetValue ?? 1));
  }, 0);
  const intensity = eligible.length ? Math.min(3, Math.ceil(((completed + partialProgress) / eligible.length) * 3)) : 0;
  return { eligible, completed, lapses, intensity, partialProgress };
};
