import { buildPerformanceReport, getReportPeriod, recentReportStarts } from '../src/domain/reportEngine';
import { Habit } from '../src/services/HabitContext';

const habit: Habit = { id: 'read', name: 'Read', category: 'Learning', color: '#fff', icon: 'book-outline', streak: 0, completedDates: ['2025-01-06', '2025-01-07'], targetFrequency: 'Daily', startDate: '2025-01-06', schedule: { frequency: 'daily' }, trackingMethod: 'yes_no', habitKind: 'positive' };

describe('performance reports', () => {
  it('uses Monday-based weeks and calendar months', () => {
    expect(getReportPeriod('week', '2025-01-08')).toEqual({ start: '2025-01-06', end: '2025-01-12' });
    expect(getReportPeriod('month', '2025-02-11')).toEqual({ start: '2025-02-01', end: '2025-02-28' });
    expect(recentReportStarts('week', '2025-01-08', 2)).toEqual(['2025-01-06', '2024-12-30']);
  });

  it('summarizes schedule-aware completion and previous-period comparison', () => {
    const report = buildPerformanceReport([habit], 'week', '2025-01-06', '2025-01-08', 25);
    expect(report).toMatchObject({ totalScheduled: 3, totalCompleted: 2, percentage: 67, improvementPercentage: 42 });
    expect(report.bestDay).toEqual({ date: '2025-01-06', percentage: 100 });
    expect(report.strongestHabit?.name).toBe('Read');
  });
});
