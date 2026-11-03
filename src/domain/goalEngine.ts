import { Habit } from '../services/HabitContext';
import { addLocalDays, getHabitDayStatus, parseLocalDate, toLocalDateString } from './habitEngine';

export interface GoalMilestone {
  id: string;
  title: string;
  targetValue: number | null;
  reachedAt: string | null;
}

export interface Goal {
  id: string;
  name: string;
  description: string;
  category: string;
  startDate: string;
  targetDate: string | null;
  targetValue: number | null;
  unit: string;
  habitIds: string[];
  milestones: GoalMilestone[];
  archivedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GoalProgress {
  currentValue: number;
  targetValue: number | null;
  percentage: number | null;
  canComplete: boolean;
  linkedHabits: number;
}

export const calculateGoalProgress = (
  goal: Goal,
  habits: Habit[],
  throughDate = toLocalDateString(new Date()),
  now = new Date(),
): GoalProgress => {
  const endDate = goal.targetDate && goal.targetDate < throughDate ? goal.targetDate : throughDate;
  const start = parseLocalDate(goal.startDate);
  const end = parseLocalDate(endDate);
  if (!start || !end || goal.startDate > endDate) {
    return { currentValue: 0, targetValue: goal.targetValue, percentage: goal.targetValue ? 0 : null, canComplete: false, linkedHabits: 0 };
  }
  const linked = goal.habitIds.map(id => habits.find(habit => habit.id === id)).filter((habit): habit is Habit => Boolean(habit && !habit.archivedAt));
  let currentValue = 0;
  for (const habit of linked) {
    for (let date = goal.startDate; date <= endDate; date = addLocalDays(date, 1)) {
      if (getHabitDayStatus(habit, date, now) !== 'completed') continue;
      const log = habit.logs?.find(entry => entry.date === date);
      if (!goal.unit) {
        currentValue += 1;
      } else if (habit.unit?.trim().toLowerCase() === goal.unit.trim().toLowerCase()) {
        currentValue += typeof log?.value === 'number' ? log.value : 1;
      } else if (!habit.unit && (habit.trackingMethod === 'yes_no' || habit.habitKind === 'quit')) {
        currentValue += 1;
      }
    }
  }
  const targetValue = goal.targetValue;
  return {
    currentValue,
    targetValue,
    percentage: targetValue && targetValue > 0 ? Math.min(100, Math.round(currentValue / targetValue * 100)) : null,
    canComplete: Boolean(targetValue && targetValue > 0 && currentValue >= targetValue),
    linkedHabits: linked.length,
  };
};
