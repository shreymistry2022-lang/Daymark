import type { Habit } from '../services/HabitContext';
import { getHabitDayStatus, isTrackableOnDate } from './habitEngine';
import { HabitReminder, HabitSchedule } from './habitTypes';

export interface RoutineLog {
  date: string;
  completedAt: string | null;
  updatedAt: string;
}

export interface Routine {
  id: string;
  name: string;
  description: string;
  schedule: HabitSchedule;
  habitIds: string[];
  logs: RoutineLog[];
  reminders: HabitReminder[];
  sortOrder: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RoutineProgress {
  completedHabits: number;
  scheduledHabits: number;
  percentage: number;
  loggedComplete: boolean;
}

export const getRoutineProgress = (routine: Routine, habits: Habit[], date: string, now = new Date()): RoutineProgress => {
  const linkedHabits = routine.habitIds
    .map(id => habits.find(habit => habit.id === id))
    .filter((habit): habit is Habit => Boolean(habit && !habit.archivedAt && isTrackableOnDate(habit, date, now)));
  const completedHabits = linkedHabits.filter(habit => getHabitDayStatus(habit, date, now) === 'completed').length;
  return {
    completedHabits,
    scheduledHabits: linkedHabits.length,
    percentage: linkedHabits.length ? Math.round(completedHabits / linkedHabits.length * 100) : 0,
    loggedComplete: routine.logs.some(log => log.date === date && Boolean(log.completedAt)),
  };
};
