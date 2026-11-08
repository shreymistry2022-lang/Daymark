import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, IosAuthorizationStatus } from 'expo-notifications';
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

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export const ensureLocalReminderPermission = async (): Promise<boolean> => {
  try {
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && permission.ios?.status !== IosAuthorizationStatus.PROVISIONAL) {
      permission = await Notifications.requestPermissionsAsync();
    }
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('habit-reminders', {
        name: 'Habit reminders',
        importance: AndroidImportance.MAX,
        vibrationPattern: [0, 250, 200, 250],
        enableVibrate: true,
      });
    }
    return permission.granted || permission.ios?.status === IosAuthorizationStatus.PROVISIONAL;
  } catch (error) {
    console.warn('Could not request habit reminder permission:', error);
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
        content: { title: owner.name, body: owner.description || 'A small step keeps your progress moving.', data: { ownerId: owner.id }, sound: owner.soundEnabled !== false },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: reminder.hour, minute: reminder.minute, channelId: 'habit-reminders' },
      }));
    } else {
      for (const isoWeekday of weekdays) {
        const expoWeekday = (isoWeekday % 7) + 1; // Expo: Sunday=1, ISO: Monday=1.
        scheduledIds.push(await Notifications.scheduleNotificationAsync({
          content: { title: owner.name, body: owner.description || 'A small step keeps your progress moving.', data: { ownerId: owner.id }, sound: owner.soundEnabled !== false },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: expoWeekday, hour: reminder.hour, minute: reminder.minute, channelId: 'habit-reminders' },
        }));
      }
    }
    idsByReminder.set(reminder.id, scheduledIds);
  }
  return reminders.map(reminder => ({ ...reminder, notificationIds: idsByReminder.get(reminder.id) ?? [] }));
};

export const replaceLocalHabitReminders = async (habit: LocalReminderOwner, previousReminders: HabitReminder[] = []) =>
  replaceLocalReminders(habit, previousReminders);
