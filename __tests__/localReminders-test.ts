jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('test-notification-id'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
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
  formatReminderTime,
  parseTimeString,
} from '../src/services/localReminders';

describe('localReminders notification content generator', () => {
  it('formats Sleep habit with bedtime emoji, title, and restorative copy', () => {
    const content = buildHabitNotificationContent({
      id: 'h1',
      name: 'Sleep',
      category: 'Sleep & Recovery',
      color: '#6366F1',
    });
    expect(content.title).toBe('🌙 Bedtime & Rest · Sleep');
    expect(content.subtitle).toBe('Sleep & Recovery');
    expect(content.body).toContain('recharge for tomorrow');
    expect(content.color).toBe('#6366F1');
  });

  it('formats Hydration habit with water droplet emoji and hydration prompt', () => {
    const content = buildHabitNotificationContent({
      id: 'h2',
      name: 'Drink Water',
      category: 'Nutrition & Water',
      color: '#06B6D4',
    });
    expect(content.title).toBe('💧 Hydration Check · Drink Water');
    expect(content.subtitle).toBe('Nutrition & Water');
    expect(content.body).toContain('fresh glass of water');
    expect(content.color).toBe('#06B6D4');
  });

  it('formats Exercise / Fitness habit with vitality emoji and movement copy', () => {
    const content = buildHabitNotificationContent({
      id: 'h3',
      name: 'Exercise',
      category: 'Fitness & Movement',
      color: '#10B981',
    });
    expect(content.title).toBe('⚡ Movement & Vitality · Exercise');
    expect(content.subtitle).toBe('Fitness & Movement');
    expect(content.body).toContain('workout');
    expect(content.color).toBe('#10B981');
  });

  it('formats Deep Work / Career habit with focus emoji and productivity copy', () => {
    const content = buildHabitNotificationContent({
      id: 'h4',
      name: 'Deep Work',
      category: 'Focus & Career',
      color: '#3B82F6',
    });
    expect(content.title).toBe('🎯 Deep Focus · Deep Work');
    expect(content.subtitle).toBe('Focus & Career');
    expect(content.body).toContain('distractions');
  });

  it('formats Quit / Break habit with protective shield emoji and commitment copy', () => {
    const content = buildHabitNotificationContent({
      id: 'h5',
      name: 'Quit Smoking',
      habitKind: 'quit',
      color: '#EF4444',
      streak: 7,
    });
    expect(content.title).toBe('🛡️ Stay Strong · Quit Smoking');
    expect(content.subtitle).toBe('Commitment Guard');
    expect(content.body).toContain('Day 7 clean');
    expect(content.color).toBe('#EF4444');
  });

  it('incorporates active streak when streak >= 2', () => {
    const content = buildHabitNotificationContent({
      id: 'h6',
      name: 'Meditation',
      category: 'Mindfulness',
      streak: 5,
    });
    expect(content.title).toBe('🧘 Mindful Pause · Meditation');
    expect(content.body).toContain('🔥 5-day streak!');
  });

  it('preserves user custom description if provided', () => {
    const content = buildHabitNotificationContent({
      id: 'h7',
      name: 'Read 20 Pages',
      category: 'Learning & Reading',
      description: 'Finish chapter 4 of Atomic Habits.',
    });
    expect(content.title).toBe('📖 Expand Your Mind · Read 20 Pages');
    expect(content.body).toContain('Finish chapter 4 of Atomic Habits.');
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
