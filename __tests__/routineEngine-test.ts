import { getRoutineProgress, Routine } from '../src/domain/routineEngine';
import { Habit } from '../src/services/HabitContext';

const routine: Routine = {
  id: 'r1', name: 'Morning', description: '', schedule: { frequency: 'daily' }, habitIds: ['h1', 'h2', 'h3'],
  logs: [], reminders: [], sortOrder: 0, archivedAt: null,
  createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
};

const habit = (id: string, completedDates: string[], archivedAt: string | null = null): Habit => ({
  id, name: id, category: 'Health', color: '#123456', icon: 'heart-outline', streak: 0,
  completedDates, targetFrequency: 'Daily', startDate: '2025-01-01', archivedAt,
  schedule: { frequency: 'daily' }, habitKind: 'positive', trackingMethod: 'yes_no',
} as Habit);

describe('routine progress', () => {
  it('tracks linked habit progress without creating habit logs', () => {
    const initial = getRoutineProgress(routine, [habit('h1', ['2025-01-06']), habit('h2', []), habit('h3', [], '2025-01-05T00:00:00Z')], '2025-01-06');
    expect(initial).toEqual({ completedHabits: 1, scheduledHabits: 2, percentage: 50, loggedComplete: false });
    const separatelyLogged = { ...routine, logs: [{ date: '2025-01-06', completedAt: '2025-01-06T10:00:00Z', updatedAt: '2025-01-06T10:00:00Z' }] };
    expect(getRoutineProgress(separatelyLogged, [habit('h1', ['2025-01-06']), habit('h2', [])], '2025-01-06'))
      .toEqual({ completedHabits: 1, scheduledHabits: 2, percentage: 50, loggedComplete: true });
  });
});
