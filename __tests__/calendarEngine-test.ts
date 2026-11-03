import { calculateCalendarDayActivity } from '../src/domain/calendarEngine';
import { SchedulableHabit } from '../src/domain/habitEngine';

const day = (year: number, month: number, date: number) => new Date(year, month, date, 12);
const baseHabit = (overrides: Partial<SchedulableHabit> = {}): SchedulableHabit => ({
  startDate: '2025-01-06', schedule: { frequency: 'daily' }, completedDates: [], ...overrides,
});

describe('calendar activity calculations', () => {
  it('includes only eligible scheduled habits and counts successful days', () => {
    const activity = calculateCalendarDayActivity([
      baseHabit({ completedDates: ['2025-01-06'] }),
      baseHabit({ schedule: { frequency: 'selected_weekdays', weekdays: [2] } }),
    ], '2025-01-06', day(2025, 0, 7));
    expect(activity).toMatchObject({ completed: 1, intensity: 3 });
    expect(activity.eligible).toHaveLength(1);
  });

  it('shows partial measurable progress as heatmap intensity without calling it complete', () => {
    const habit = baseHabit({ trackingMethod: 'measurable', targetValue: 10, logs: [{ date: '2025-01-06', value: 4 }] });
    expect(calculateCalendarDayActivity([habit], '2025-01-06', day(2025, 0, 6))).toMatchObject({ completed: 0, partialProgress: 0.4, intensity: 2 });
  });

  it('excludes unscheduled days from the contribution calculation', () => {
    const habit = baseHabit({ schedule: { frequency: 'weekdays' } });
    expect(calculateCalendarDayActivity([habit], '2025-01-11', day(2025, 0, 12))).toMatchObject({ eligible: [], completed: 0, lapses: 0, intensity: 0 });
  });

  it('reports quit-habit lapses distinctly on scheduled days', () => {
    const quit = baseHabit({ habitKind: 'quit', logs: [{ date: '2025-01-06', outcome: 'lapse' }] });
    expect(calculateCalendarDayActivity([quit], '2025-01-06', day(2025, 0, 7))).toMatchObject({ completed: 0, lapses: 1 });
  });
});
