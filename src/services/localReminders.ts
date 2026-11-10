// src/services/localReminders.ts
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, AndroidNotificationVisibility, IosAuthorizationStatus } from 'expo-notifications';
import { HabitReminder } from '../domain/habitTypes';
import { toLocalDateString } from '../domain/habitEngine';

export interface LocalReminderOwner {
  id: string;
  name: string;
  description?: string;
  reminders?: HabitReminder[];
  archivedAt?: string | null;
  startDate?: string;
  endDate?: string | null;
  pausedPeriods?: { startDate: string; endDate: string | null }[];
  notificationsEnabled?: boolean;
  soundEnabled?: boolean;
}

/**
 * Format a 24-hour hour & minute into standard 12-hour AM/PM format
 * e.g. (8, 0) -> "8:00 AM", (14, 30) -> "2:30 PM", (0, 15) -> "12:15 AM", (12, 0) -> "12:00 PM"
 */
export const formatReminderTime = (hour: number, minute: number): string => {
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  const displayMin = String(minute).padStart(2, '0');
  return `${displayHour}:${displayMin} ${ampm}`;
};

/**
 * Parse an entered time string (supports 12-hour AM/PM and 24-hour format)
 * e.g. "8:00 AM", "8:30pm", "8 PM", "14:30", "08:00"
 */
export const parseTimeString = (input: string, fallbackAmPm?: 'AM' | 'PM'): { hour: number; minute: number } | null => {
  const clean = input.trim();
  if (!clean) return null;

  // 1. Check 12-hour AM/PM string explicitly: e.g. "8:30 AM", "8:30PM", "8pm", "12:00 am"
  const match12 = clean.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (match12) {
    let hour = Number(match12[1]);
    const minute = match12[2] ? Number(match12[2]) : 0;
    const ampm = match12[3].toUpperCase();
    if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
    if (ampm === 'PM' && hour < 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    return { hour, minute };
  }

  // 2. Check 24-hour string or time with optional fallback AM/PM
  const matchDigits = clean.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (matchDigits) {
    let hour = Number(matchDigits[1]);
    const minute = matchDigits[2] ? Number(matchDigits[2]) : 0;
    if (minute < 0 || minute > 59) return null;

    if (fallbackAmPm) {
      if (hour < 1 || hour > 12) return null;
      if (fallbackAmPm === 'PM' && hour < 12) hour += 12;
      if (fallbackAmPm === 'AM' && hour === 12) hour = 0;
      return { hour, minute };
    }

    if (hour >= 0 && hour <= 23) {
      return { hour, minute };
    }
  }

  return null;
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export const checkNotificationPermissionStatus = async (): Promise<{
  granted: boolean;
  canAskAgain: boolean;
}> => {
  try {
    const permission = await Notifications.getPermissionsAsync();
    const granted = permission.granted || permission.ios?.status === IosAuthorizationStatus.PROVISIONAL;
    return {
      granted,
      canAskAgain: permission.canAskAgain,
    };
  } catch (error) {
    console.warn('Could not check notification permission status:', error);
    return {
      granted: false,
      canAskAgain: true,
    };
  }
};

export const ensureLocalReminderPermission = async (): Promise<boolean> => {
  try {
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && permission.ios?.status !== IosAuthorizationStatus.PROVISIONAL) {
      permission = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
    }
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('habit-reminders', {
        name: 'Habit reminders',
        importance: AndroidImportance.MAX,
        vibrationPattern: [0, 250, 200, 250],
        enableVibrate: true,
        sound: 'default',
        showBadge: true,
        lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
      });
    }
    return permission.granted || permission.ios?.status === IosAuthorizationStatus.PROVISIONAL;
  } catch (error) {
    console.warn('Could not request habit reminder permission:', error);
    return false;
  }
};

export const sendTestNotificationAsync = async (): Promise<boolean> => {
  const granted = await ensureLocalReminderPermission();
  if (!granted) return false;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Daymark Reminder Test 🔔',
        body: 'Habit reminders are active and working on your phone!',
        sound: true,
        color: '#10B981',
        data: { test: true },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 2,
        repeats: false,
        channelId: 'habit-reminders',
      },
    });
    return true;
  } catch (err) {
    console.warn('Failed to schedule test notification:', err);
    return false;
  }
};

export const replaceLocalReminders = async (owner: LocalReminderOwner, previousReminders: HabitReminder[] = []): Promise<HabitReminder[]> => {
  const reminders = owner.reminders ?? [];
  const oldIds = [...reminders, ...previousReminders].flatMap(reminder => reminder.notificationIds ?? []);
  await Promise.all(oldIds.map(async id => {
    try { await Notifications.cancelScheduledNotificationAsync(id); }
    catch (error) { console.warn('Could not cancel previous habit reminder:', error); }
  }));

  const today = toLocalDateString(new Date());
  if (owner.archivedAt || (owner.startDate && owner.startDate > today) || (owner.endDate && owner.endDate < today)
    || (owner.pausedPeriods ?? []).some(period => period.startDate <= today && (!period.endDate || period.endDate >= today))) {
    return reminders.map(reminder => ({ ...reminder, notificationIds: [] }));
  }
  const enabled = owner.notificationsEnabled === false ? [] : reminders.filter(reminder => reminder.enabled);
  if (enabled.length === 0) return reminders.map(reminder => ({ ...reminder, notificationIds: [] }));
  if (!(await ensureLocalReminderPermission())) throw new Error('Notification permission is not enabled. Allow notifications in device settings to schedule reminders.');

  const idsByReminder = new Map<string, string[]>();
  for (const reminder of enabled) {
    if (!Number.isInteger(reminder.hour) || reminder.hour < 0 || reminder.hour > 23 || !Number.isInteger(reminder.minute) || reminder.minute < 0 || reminder.minute > 59) {
      throw new Error('A reminder time is invalid. Edit the reminder and try again.');
    }
    const weekdays = [...new Set(reminder.weekdays)].filter(day => Number.isInteger(day) && day >= 1 && day <= 7);
    const scheduledIds: string[] = [];
    if (weekdays.length === 7) {
      scheduledIds.push(await Notifications.scheduleNotificationAsync({
        content: {
          title: owner.name,
          body: owner.description || 'A small step keeps your progress moving.',
          data: { ownerId: owner.id },
          sound: owner.soundEnabled !== false,
          color: '#10B981',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: reminder.hour,
          minute: reminder.minute,
          channelId: 'habit-reminders',
        },
      }));
    } else {
      for (const isoWeekday of weekdays) {
        const expoWeekday = (isoWeekday % 7) + 1; // Expo: Sunday=1, ISO: Monday=1.
        scheduledIds.push(await Notifications.scheduleNotificationAsync({
          content: {
            title: owner.name,
            body: owner.description || 'A small step keeps your progress moving.',
            data: { ownerId: owner.id },
            sound: owner.soundEnabled !== false,
            color: '#10B981',
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: expoWeekday,
            hour: reminder.hour,
            minute: reminder.minute,
            channelId: 'habit-reminders',
          },
        }));
      }
    }
    idsByReminder.set(reminder.id, scheduledIds);
  }
  return reminders.map(reminder => ({ ...reminder, notificationIds: idsByReminder.get(reminder.id) ?? [] }));
};

export const replaceLocalHabitReminders = async (habit: LocalReminderOwner, previousReminders: HabitReminder[] = []) =>
  replaceLocalReminders(habit, previousReminders);
