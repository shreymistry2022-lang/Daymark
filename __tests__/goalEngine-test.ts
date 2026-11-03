import { calculateGoalProgress, Goal } from '../src/domain/goalEngine';
import { Habit } from '../src/services/HabitContext';

const goal: Goal = {
  id: 'goal-1', name: 'Run 10 km', description: '', category: 'Health', startDate: '2025-01-06', targetDate: null,
  targetValue: 10, unit: 'km', habitIds: ['run'], milestones: [], archivedAt: null, completedAt: null,
  createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
};
const runHabit = (logs: Habit['logs'], completedDates: string[] = ['2025-01-06', '2025-01-07']) => ({
  id: 'run', name: 'Running', category: 'Fitness', color: '#fff', icon: 'walk-outline', streak: 0,
  completedDates, targetFrequency: 'Daily', startDate: '2025-01-06', unit: 'km', targetValue: 4,
  schedule: { frequency: 'daily' }, trackingMethod: 'measurable', habitKind: 'positive', logs,
} as Habit);

describe('goal progress', () => {
  it('sums matching measurable habit values and only completes at the configured target', () => {
    const habit = runHabit([{ date: '2025-01-06', value: 4 }, { date: '2025-01-07', value: 6 }]);
    expect(calculateGoalProgress(goal, [habit], '2025-01-07', new Date(2025, 0, 7, 12))).toMatchObject({ currentValue: 10, percentage: 100, canComplete: true });
    expect(calculateGoalProgress({ ...goal, targetValue: 11 }, [habit], '2025-01-07', new Date(2025, 0, 7, 12)).canComplete).toBe(false);
  });

  it('ignores archived, unlinked, and unit-incompatible habits', () => {
    const habit = runHabit([{ date: '2025-01-06', value: 8 }], ['2025-01-06']);
    const incompatible = { ...habit, unit: 'minutes' };
    expect(calculateGoalProgress(goal, [incompatible], '2025-01-06', new Date(2025, 0, 6, 12)).currentValue).toBe(0);
    expect(calculateGoalProgress({ ...goal, habitIds: ['none'] }, [habit], '2025-01-06', new Date(2025, 0, 6, 12)).linkedHabits).toBe(0);
  });
});

