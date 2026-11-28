jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  setNotificationCategoryAsync: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('test-notification-id'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  SchedulableTriggerInputTypes: {
    DAILY: 'daily',
    WEEKLY: 'weekly',
    TIME_INTERVAL: 'timeInterval',
  },
  AndroidImportance: {
    MAX: 5,
  },
  AndroidNotificationVisibility: {
    PUBLIC: 1,
  },
  IosAuthorizationStatus: {
    PROVISIONAL: 3,
  },
}));

import {
  buildHabitNotificationContent,
  buildRepeatedDailyReminders,
  formatGapLabel,
  formatReminderTime,
  inferRepeatConfigFromReminders,
  parseTimeString,
  cleanupDuplicateNotificationsAsync,
  schedulePendingHabitsReminderAsync,
  getRandomMotivationalQuote,
  MOTIVATIONAL_HABIT_QUOTES,
} from '../src/services/localReminders';
import * as Notifications from 'expo-notifications';

describe('localReminders notification content generator', () => {
  it('formats positive habit with simple title and short body', () => {
    const content = buildHabitNotificationContent({
      id: 'h1',
      name: 'Drink Water',
      category: 'Nutrition & Water',
      color: '#06B6D4',
    });
    expect(content.title).toBe('Drink Water');
    expect(content.subtitle).toBeUndefined();
    expect(content.body).toBe('Time to check in.');
    expect(content.color).toBe('#06B6D4');
  });

  it('formats Quit / Break habit with simple title and short body', () => {
    const content = buildHabitNotificationContent({
      id: 'h5',
      name: 'Quit Smoking',
      habitKind: 'quit',
      color: '#EF4444',
      streak: 7,
    });
    expect(content.title).toBe('Quit Smoking');
    expect(content.body).toBe('Stay strong today.');
    expect(content.color).toBe('#EF4444');
  });

  it('preserves user custom description if provided', () => {
    const content = buildHabitNotificationContent({
      id: 'h7',
      name: 'Read 20 Pages',
      category: 'Learning & Reading',
      description: 'Finish chapter 4 of Atomic Habits.',
    });
    expect(content.title).toBe('Read 20 Pages');
    expect(content.body).toBe('Finish chapter 4 of Atomic Habits.');
  });
});

describe('parseTimeString', () => {
  it('parses standard 12-hour AM/PM formats', () => {
    expect(parseTimeString('08:00 AM')).toEqual({ hour: 8, minute: 0 });
    expect(parseTimeString('8:30pm')).toEqual({ hour: 20, minute: 30 });
    expect(parseTimeString('12:00 am')).toEqual({ hour: 0, minute: 0 });
    expect(parseTimeString('12:15 pm')).toEqual({ hour: 12, minute: 15 });
  });

  it('parses dot notation and compact inputs', () => {
    expect(parseTimeString('9.50pm')).toEqual({ hour: 21, minute: 50 });
    expect(parseTimeString('9.50', 'PM')).toEqual({ hour: 21, minute: 50 });
    expect(parseTimeString('7.30', 'AM')).toEqual({ hour: 7, minute: 30 });
  });

  it('parses standard 24-hour formats', () => {
    expect(parseTimeString('07:00')).toEqual({ hour: 7, minute: 0 });
    expect(parseTimeString('22:30')).toEqual({ hour: 22, minute: 30 });
    expect(parseTimeString('00:00')).toEqual({ hour: 0, minute: 0 });
  });

  it('rejects invalid time strings', () => {
    expect(parseTimeString('25:00')).toBeNull();
    expect(parseTimeString('12:60')).toBeNull();
    expect(parseTimeString('invalid')).toBeNull();
    expect(parseTimeString('')).toBeNull();
  });
});

describe('formatReminderTime', () => {
  it('formats hours and minutes to 12-hour AM/PM strings', () => {
    expect(formatReminderTime(8, 0)).toBe('8:00 AM');
    expect(formatReminderTime(14, 30)).toBe('2:30 PM');
    expect(formatReminderTime(0, 0)).toBe('12:00 AM');
    expect(formatReminderTime(12, 0)).toBe('12:00 PM');
    expect(formatReminderTime(23, 59)).toBe('11:59 PM');
  });
});

describe('cleanupDuplicateNotificationsAsync', () => {
  it('detects and cancels duplicate scheduled alarms for the same slot', async () => {
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValueOnce([
      {
        identifier: 'alarm-1',
        content: { data: { ownerId: 'h_sleep' } },
        trigger: { hour: 20, minute: 16 },
      },
      {
        identifier: 'alarm-2',
        content: { data: { ownerId: 'h_sleep' } },
        trigger: { hour: 20, minute: 16 },
      },
      {
        identifier: 'alarm-3',
        content: { data: { ownerId: 'h_sleep' } },
        trigger: { hour: 20, minute: 16 },
      },
    ]);

    const res = await cleanupDuplicateNotificationsAsync();
    expect(res.cancelledCount).toBe(2);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('alarm-2');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('alarm-3');
    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalledWith('alarm-1');
  });
});

describe('schedulePendingHabitsReminderAsync & motivational engine', () => {
  it('provides inspirational quotes from the motivational pool', () => {
    const quote = getRandomMotivationalQuote(42);
    expect(typeof quote).toBe('string');
    expect(MOTIVATIONAL_HABIT_QUOTES).toContain(quote);
  });

  it('schedules pending habits reminder with incomplete habit names and motivational message', async () => {
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValueOnce([]);
    const scheduledId = await schedulePendingHabitsReminderAsync(
      [
        { id: 'h1', name: 'Drink Water', completedDates: ['2026-11-19'] } as any,
        { id: 'h2', name: 'Exercise', completedDates: [] } as any,
        { id: 'h3', name: 'Read 20 Pages', completedDates: [] } as any,
      ],
      { todayDateStr: '2026-11-19', hour: 19, minute: 0 }
    );

    expect(scheduledId).toBe('test-notification-id');
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          title: expect.stringContaining('2 habits left today'),
          body: expect.stringContaining('Exercise, Read 20 Pages'),
        }),
      })
    );
  });
});

describe('repeated daily habit reminders with custom time gaps', () => {
  it('generates multiple reminders per day at the configured gap', () => {
    const result = buildRepeatedDailyReminders({
      startHour: 8,
      startMinute: 0,
      repeatCount: 4,
      intervalMinutes: 120,
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      enabled: true,
    });

    expect(result.truncatedBeforeMidnight).toBe(false);
    expect(result.reminders).toHaveLength(4);
    expect(result.reminders.map(r => `${r.hour}:${String(r.minute).padStart(2, '0')}`)).toEqual([
      '8:00',
      '10:00',
      '12:00',
      '14:00',
    ]);
    expect(result.reminders[0].repeatCount).toBe(4);
    expect(result.reminders[0].intervalMinutes).toBe(120);
  });

  it('caps reminders before midnight when start time and gap would pass 23:59', () => {
    const result = buildRepeatedDailyReminders({
      startHour: 21,
      startMinute: 0,
      repeatCount: 4,
      intervalMinutes: 120,
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      enabled: true,
    });

    expect(result.truncatedBeforeMidnight).toBe(true);
    expect(result.reminders).toHaveLength(2);
    expect(result.reminders.map(r => r.hour)).toEqual([21, 23]);
  });

  it('infers repeat count and time gap from saved reminder slots', () => {
    expect(inferRepeatConfigFromReminders([
      { id: 'r0', hour: 9, minute: 0, weekdays: [1, 2, 3, 4, 5, 6, 7], enabled: true },
      { id: 'r1', hour: 9, minute: 45, weekdays: [1, 2, 3, 4, 5, 6, 7], enabled: true },
      { id: 'r2', hour: 10, minute: 30, weekdays: [1, 2, 3, 4, 5, 6, 7], enabled: true },
    ])).toEqual({ repeatCount: 3, intervalMinutes: 45 });
  });

  it('formats minute and hour gap labels cleanly', () => {
    expect(formatGapLabel(30)).toBe('30 min');
    expect(formatGapLabel(60)).toBe('1 hr');
    expect(formatGapLabel(90)).toBe('1 hr 30 min');
    expect(formatGapLabel(120)).toBe('2 hr');
  });
});
