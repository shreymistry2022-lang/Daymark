import { calculateAchievementProgress } from '../src/domain/achievementEngine';
import { Habit } from '../src/services/HabitContext';

const habit = (id: string, completedDates: string[]): Habit => ({ id, name: id, category: 'Health', color: '#fff', icon: 'heart-outline', streak: 0, completedDates, targetFrequency: 'Daily', startDate: '2025-01-01', schedule: { frequency: 'daily' }, trackingMethod: 'yes_no', habitKind: 'positive' });

describe('achievement progress', () => {
  it('unlocks first step, seven scheduled days and momentum from completed records', () => {
    const dates = Array.from({ length: 7 }, (_, index) => `2025-01-0${index + 1}`);
    const results = calculateAchievementProgress([habit('a', dates), habit('b', ['2025-01-07']), habit('c', ['2025-01-07']), habit('d', ['2025-01-07']), habit('e', ['2025-01-07'])], new Date(2025, 0, 8, 12));
    expect(results.find(item => item.key === 'first_step')?.unlocked).toBe(true);
    expect(results.find(item => item.key === 'seven_days')?.unlocked).toBe(true);
    expect(results.find(item => item.key === 'momentum')?.unlocked).toBe(true);
  });

  it('keeps unlock timestamps separate from derived progress and requires the real century target', () => {
    const results = calculateAchievementProgress([habit('a', ['2025-01-06'])], new Date(2025, 0, 7, 12));
    expect(results.find(item => item.key === 'first_step')?.progress).toBe(1);
    expect(results.find(item => item.key === 'first_step')?.unlockedAt).toBeNull();
    expect(results.find(item => item.key === 'century')?.unlocked).toBe(false);
  });
});
