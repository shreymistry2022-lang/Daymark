import { dateKeyInTimezone, formatAppDate, getWeekDates } from '../src/domain/preferencesEngine';

describe('preference date formatting', () => {
  const date = new Date('2025-01-01T01:00:00.000Z');
  it('uses the selected timezone when deriving the displayed day', () => {
    expect(dateKeyInTimezone(date, 'Asia/Kolkata')).toBe('2025-01-01');
    expect(dateKeyInTimezone(date, 'America/Los_Angeles')).toBe('2024-12-31');
  });
  it('supports ISO and locale based display formats', () => {
    expect(formatAppDate(date, 'iso', 'UTC')).toBe('2025-01-01');
    expect(formatAppDate(date, 'us', 'UTC')).toContain('Jan');
    expect(formatAppDate(date, 'uk', 'UTC')).toContain('Jan');
  });
  it('builds the visible week using the selected week start', () => {
    expect(getWeekDates('2025-01-01', 1)).toEqual(['2024-12-30', '2024-12-31', '2025-01-01', '2025-01-02', '2025-01-03', '2025-01-04', '2025-01-05']);
    expect(getWeekDates('2025-01-01', 0)).toEqual(['2024-12-29', '2024-12-30', '2024-12-31', '2025-01-01', '2025-01-02', '2025-01-03', '2025-01-04']);
  });
});
