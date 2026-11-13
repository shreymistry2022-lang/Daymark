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
 * e.g. "8:00 AM", "8:30pm", "8 PM", "9.50pm", "9.50", "9:50", "14:30", "08:00", "9"
 */
export const parseTimeString = (input: string, fallbackAmPm?: 'AM' | 'PM'): { hour: number; minute: number } | null => {
  if (!input) return null;
  let clean = input.trim().toLowerCase();
  if (!clean) return null;

  // Normalize dots and spaces between hour and minute digits: e.g. "9.50" -> "9:50", "9 50" -> "9:50"
  clean = clean.replace(/(\d{1,2})[.\s](\d{2})/, (_, h, m) => `${h}:${m}`);

  // 1. Check 12-hour AM/PM string explicitly: e.g. "8:30 am", "8:30pm", "8pm", "12:00 am", "9:50pm"
  const match12 = clean.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (match12) {
    let hour = Number(match12[1]);
    const minute = match12[2] ? Number(match12[2]) : 0;
    const ampm = match12[3];
    if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    return { hour, minute };
  }

  // 2. Check 24-hour string or time with optional fallback AM/PM
  const matchDigits = clean.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (matchDigits) {
    let hour = Number(matchDigits[1]);
    const minute = matchDigits[2] ? Number(matchDigits[2]) : 0;
    if (minute < 0 || minute > 59) return null;

    if (fallbackAmPm) {
      if (hour >= 1 && hour <= 12) {
        if (fallbackAmPm.toUpperCase() === 'PM' && hour < 12) hour += 12;
        if (fallbackAmPm.toUpperCase() === 'AM' && hour === 12) hour = 0;
        return { hour, minute };
      }
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

let webAudioCtx: any = null;
const getOrCreateAudioContext = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!webAudioCtx) {
      webAudioCtx = new AudioCtx();
    }
    if (webAudioCtx.state === 'suspended') {
      webAudioCtx.resume().catch(() => {});
    }
    return webAudioCtx;
  } catch {
    return null;
  }
};

// Auto-unlock Web Audio on first user interaction so scheduled chimes play freely
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  const unlockEvents = ['touchstart', 'touchend', 'mousedown', 'keydown', 'click'];
  const unlock = () => {
    getOrCreateAudioContext();
    unlockEvents.forEach(evt => window.removeEventListener(evt, unlock));
  };
  unlockEvents.forEach(evt => window.addEventListener(evt, unlock, { passive: true }));
}

/**
 * Web Audio chime for browsers where native notification sounds or scheduling are unavailable.
 * Plays a pleasant two-tone chime (D5 -> A5).
 */
export const playWebNotificationChime = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    gain1.gain.setValueAtTime(0.35, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.15); // A5
    gain2.gain.setValueAtTime(0.4, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.65);
  } catch (e) {
    console.warn('Could not play web audio reminder chime:', e);
  }
};

export interface ReminderAlertEvent {
  ownerId: string;
  title: string;
  body: string;
}

type ReminderAlertListener = (event: ReminderAlertEvent) => void;
const reminderAlertListeners = new Set<ReminderAlertListener>();

export const subscribeToReminderAlerts = (listener: ReminderAlertListener): (() => void) => {
  reminderAlertListeners.add(listener);
  return () => { reminderAlertListeners.delete(listener); };
};

const dispatchReminderAlert = (event: ReminderAlertEvent) => {
  reminderAlertListeners.forEach(listener => {
    try { listener(event); } catch (e) { console.warn('Reminder listener error:', e); }
  });
};

interface ActiveWebReminder {
  ownerId: string;
  ownerName: string;
  ownerDescription?: string;
  soundEnabled: boolean;
  reminderId: string;
  hour: number;
  minute: number;
  weekdays: number[];
}

const activeWebReminders: Map<string, ActiveWebReminder> = new Map();
let webWatcherTimer: any = null;
let lastTriggeredMinuteKey = '';

const runWebReminderCheck = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const jsDay = now.getDay();
  const isoWeekday = jsDay === 0 ? 7 : jsDay;
  const minuteKey = `${now.toDateString()}_${currentHour}_${currentMinute}`;

  if (lastTriggeredMinuteKey === minuteKey) return;

  const due: ActiveWebReminder[] = [];
  activeWebReminders.forEach(reminder => {
    if (reminder.hour === currentHour && reminder.minute === currentMinute && reminder.weekdays.includes(isoWeekday)) {
      due.push(reminder);
    }
  });

  if (due.length > 0) {
    lastTriggeredMinuteKey = minuteKey;
    for (const reminder of due) {
      if (reminder.soundEnabled) {
        playWebNotificationChime();
      }
      // Vibrate mobile device if supported
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try { navigator.vibrate([400, 200, 400]); } catch { /* Ignore */ }
      }
      // Native web notification
      if ('Notification' in window && window.Notification.permission === 'granted') {
        try {
          new window.Notification(reminder.ownerName, {
            body: reminder.ownerDescription || 'Time for your daily habit routine!',
            icon: '/assets/icon.png',
          });
        } catch {
          // Mobile Chrome blocks `new Notification` without service worker; dispatch in-app alert
        }
      }
      // In-app alert dispatch
      dispatchReminderAlert({
        ownerId: reminder.ownerId,
        title: reminder.ownerName,
        body: reminder.ownerDescription || 'A small step keeps your progress moving.',
      });
    }
  }
};

const ensureWebWatcherStarted = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  if (!webWatcherTimer) {
    webWatcherTimer = setInterval(runWebReminderCheck, 3000);
    // Run an immediate check in case it's on the exact minute
    runWebReminderCheck();
  }
};

export const checkNotificationPermissionStatus = async (): Promise<{
  granted: boolean;
  canAskAgain: boolean;
}> => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return {
        granted: window.Notification.permission === 'granted',
        canAskAgain: window.Notification.permission !== 'denied',
      };
    }
    return { granted: true, canAskAgain: false };
  }
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
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (window.Notification.permission === 'granted') return true;
      if (window.Notification.permission !== 'denied') {
        try {
          const res = await window.Notification.requestPermission();
          return res === 'granted';
        } catch {
          return true;
        }
      }
      return false;
    }
    return true;
  }
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
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (window.Notification.permission !== 'granted' && window.Notification.permission !== 'denied') {
        try { await window.Notification.requestPermission(); } catch { /* Ignore */ }
      }
    }
    setTimeout(() => {
      playWebNotificationChime();
      if (typeof window !== 'undefined' && 'Notification' in window && window.Notification.permission === 'granted') {
        try {
          new window.Notification('Daymark Reminder Test 🔔', {
            body: 'Habit reminders are active and working!',
            icon: '/assets/icon.png',
          });
        } catch { /* Ignore */ }
      }
    }, 2000);
    return true;
  }

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

  // 1. Cancel previous notifications
  if (Platform.OS === 'web') {
    const oldReminderIds = new Set([...reminders, ...previousReminders].map(r => r.id));
    oldReminderIds.forEach(id => activeWebReminders.delete(id));
  } else {
    const oldIds = [...reminders, ...previousReminders].flatMap(reminder => reminder.notificationIds ?? []);
    await Promise.all(oldIds.map(async id => {
      try { await Notifications.cancelScheduledNotificationAsync(id); }
      catch (error) { console.warn('Could not cancel previous habit reminder:', error); }
    }));
  }

  const today = toLocalDateString(new Date());
  if (owner.archivedAt || (owner.startDate && owner.startDate > today) || (owner.endDate && owner.endDate < today)
    || (owner.pausedPeriods ?? []).some(period => period.startDate <= today && (!period.endDate || period.endDate >= today))) {
    return reminders.map(reminder => ({ ...reminder, notificationIds: [] }));
  }
  const enabled = owner.notificationsEnabled === false ? [] : reminders.filter(reminder => reminder.enabled);
  if (enabled.length === 0) return reminders.map(reminder => ({ ...reminder, notificationIds: [] }));

  // Check permission
  const hasPermission = await ensureLocalReminderPermission();
  if (!hasPermission && Platform.OS !== 'web') {
    throw new Error('Notification permission is not enabled. Allow notifications in device settings to schedule reminders.');
  }

  // 2. Schedule for Web
  if (Platform.OS === 'web') {
    const idsByReminder = new Map<string, string[]>();
    for (const reminder of enabled) {
      if (!Number.isInteger(reminder.hour) || reminder.hour < 0 || reminder.hour > 23 || !Number.isInteger(reminder.minute) || reminder.minute < 0 || reminder.minute > 59) {
        continue;
      }
      const weekdays = [...new Set(reminder.weekdays)].filter(day => Number.isInteger(day) && day >= 1 && day <= 7);
      const generatedId = `web_notif_${reminder.id}_${Date.now()}`;
      activeWebReminders.set(reminder.id, {
        ownerId: owner.id,
        ownerName: owner.name,
        ownerDescription: owner.description,
        soundEnabled: owner.soundEnabled !== false,
        reminderId: reminder.id,
        hour: reminder.hour,
        minute: reminder.minute,
        weekdays: weekdays.length ? weekdays : [1, 2, 3, 4, 5, 6, 7],
      });
      idsByReminder.set(reminder.id, [generatedId]);
    }
    ensureWebWatcherStarted();
    return reminders.map(reminder => ({ ...reminder, notificationIds: idsByReminder.get(reminder.id) ?? [] }));
  }

  // 3. Schedule for Native (Android & iOS)
  const idsByReminder = new Map<string, string[]>();
  for (const reminder of enabled) {
    if (!Number.isInteger(reminder.hour) || reminder.hour < 0 || reminder.hour > 23 || !Number.isInteger(reminder.minute) || reminder.minute < 0 || reminder.minute > 59) {
      throw new Error('A reminder time is invalid. Edit the reminder and try again.');
    }
    const weekdays = [...new Set(reminder.weekdays)].filter(day => Number.isInteger(day) && day >= 1 && day <= 7);
    const scheduledIds: string[] = [];
    if (weekdays.length === 7) {
      const triggerInput: any = {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: reminder.hour,
        minute: reminder.minute,
        channelId: 'habit-reminders',
      };
      if (Platform.OS === 'android') {
        triggerInput.delivery = 'alarmClock';
      }
      scheduledIds.push(await Notifications.scheduleNotificationAsync({
        content: {
          title: owner.name,
          body: owner.description || 'A small step keeps your progress moving.',
          data: { ownerId: owner.id },
          sound: owner.soundEnabled !== false,
          color: '#10B981',
        },
        trigger: triggerInput,
      }));
    } else {
      for (const isoWeekday of weekdays) {
        const expoWeekday = (isoWeekday % 7) + 1; // Expo: Sunday=1, ISO: Monday=1.
        const triggerInput: any = {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: expoWeekday,
          hour: reminder.hour,
          minute: reminder.minute,
          channelId: 'habit-reminders',
        };
        if (Platform.OS === 'android') {
          triggerInput.delivery = 'alarmClock';
        }
        scheduledIds.push(await Notifications.scheduleNotificationAsync({
          content: {
            title: owner.name,
            body: owner.description || 'A small step keeps your progress moving.',
            data: { ownerId: owner.id },
            sound: owner.soundEnabled !== false,
            color: '#10B981',
          },
          trigger: triggerInput,
        }));
      }
    }
    idsByReminder.set(reminder.id, scheduledIds);
  }
  return reminders.map(reminder => ({ ...reminder, notificationIds: idsByReminder.get(reminder.id) ?? [] }));
};

export const replaceLocalHabitReminders = async (habit: LocalReminderOwner, previousReminders: HabitReminder[] = []) =>
  replaceLocalReminders(habit, previousReminders);
