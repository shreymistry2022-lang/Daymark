// src/services/localReminders.ts
import { Platform, Share } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, AndroidNotificationVisibility, IosAuthorizationStatus } from 'expo-notifications';
import { HabitReminder } from '../domain/habitTypes';
import { toLocalDateString } from '../domain/habitEngine';

export interface LocalReminderOwner {
  id: string;
  name: string;
  description?: string;
  category?: string;
  color?: string;
  icon?: string;
  streak?: number;
  habitKind?: 'positive' | 'quit';
  targetValue?: number;
  unit?: string;
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

export const formatGapLabel = (minutes: number): string => {
  const safe = Math.max(1, Math.round(minutes));
  const hrs = Math.floor(safe / 60);
  const mins = safe % 60;
  if (hrs === 0) return `${mins} min`;
  if (mins === 0) return `${hrs} hr`;
  return `${hrs} hr ${mins} min`;
};

export interface RepeatedReminderOptions {
  startHour: number;
  startMinute: number;
  repeatCount: number;
  intervalMinutes: number;
  weekdays: number[];
  enabled: boolean;
  baseId?: string;
}

/**
 * Expands a single start time + daily repeat count + time gap (minutes) into
 * distinct HabitReminder slots within the same day (00:00–23:59).
 */
export const buildRepeatedDailyReminders = ({
  startHour,
  startMinute,
  repeatCount,
  intervalMinutes,
  weekdays,
  enabled,
  baseId,
}: RepeatedReminderOptions): { reminders: HabitReminder[]; truncatedBeforeMidnight: boolean } => {
  const safeCount = Math.max(1, Math.min(24, Math.floor(repeatCount || 1)));
  const safeGap = Math.max(5, Math.min(720, Math.floor(intervalMinutes || 60)));
  const startTotal = startHour * 60 + startMinute;
  const reminders: HabitReminder[] = [];
  let truncatedBeforeMidnight = false;

  for (let i = 0; i < safeCount; i++) {
    const totalMinutes = startTotal + i * safeGap;
    if (totalMinutes >= 24 * 60) {
      truncatedBeforeMidnight = true;
      break;
    }
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    reminders.push({
      id: i === 0 ? (baseId || `reminder_${hour}_${minute}`) : `reminder_${i}_${hour}_${minute}`,
      hour,
      minute,
      weekdays,
      enabled,
      ...(i === 0 ? { repeatCount: safeCount, intervalMinutes: safeGap } : {}),
    });
  }

  return { reminders, truncatedBeforeMidnight };
};

/**
 * Restores repeatCount & intervalMinutes from saved HabitReminder slots when editing.
 */
export const inferRepeatConfigFromReminders = (
  reminders?: HabitReminder[],
): { repeatCount: number; intervalMinutes: number } => {
  if (!reminders?.length) return { repeatCount: 1, intervalMinutes: 120 };
  const first = reminders[0];
  if (first.repeatCount && first.repeatCount >= 1 && first.intervalMinutes && first.intervalMinutes >= 5) {
    return { repeatCount: first.repeatCount, intervalMinutes: first.intervalMinutes };
  }
  if (reminders.length > 1) {
    const second = reminders[1];
    const diff = (second.hour * 60 + second.minute) - (first.hour * 60 + first.minute);
    if (diff >= 5) {
      return { repeatCount: reminders.length, intervalMinutes: diff };
    }
  }
  return { repeatCount: 1, intervalMinutes: 120 };
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

export const MOTIVATIONAL_HABIT_QUOTES = [
  'Small daily improvements over time lead to stunning results.',
  'Every action you take is a vote for the person you wish to become.',
  'Consistency is the DNA of mastery. Keep your chain unbroken today!',
  'Focus on the process, not just the outcome. You have got this!',
  'One small win today creates unstoppable momentum tomorrow.',
  'Discipline is choosing between what you want now and what you want most.',
  'Your future self will thank you for the habits you build today.',
  'Progress over perfection. Show up today!',
  'The secret of getting ahead is getting started.',
  'Energy flows where attention goes. Fuel your highest self today!',
  'You do not have to be extreme, just consistent.',
  'Focus on the step in front of you, not the whole staircase.',
];

export const getRandomMotivationalQuote = (seed?: string | number): string => {
  if (seed !== undefined) {
    const num = typeof seed === 'number' ? seed : String(seed).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return MOTIVATIONAL_HABIT_QUOTES[Math.abs(num) % MOTIVATIONAL_HABIT_QUOTES.length];
  }
  return MOTIVATIONAL_HABIT_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_HABIT_QUOTES.length)];
};

export interface HabitNotificationContent {
  title: string;
  subtitle: string;
  body: string;
  color: string;
}

/**
 * Builds rich, personalized, category-aware, streak-aware and motivation-enhanced notification content
 * so every habit reminder inspires and motivates the user.
 */
export const buildHabitNotificationContent = (owner: LocalReminderOwner): HabitNotificationContent => {
  const color = owner.color || '#10B981';
  const name = owner.name.trim();

  // 1. Quit / Break habit
  if (owner.habitKind === 'quit') {
    let body = owner.description?.trim() || 'Protect your streak. You have the strength and resolve to choose differently today.';
    if (owner.streak && owner.streak >= 2) {
      body += `\n🔥 Day ${owner.streak} clean! Keep the chain unbroken.`;
    }
    return {
      title: `🛡️ Stay Strong · ${name}`,
      subtitle: 'Commitment Guard',
      body,
      color: owner.color || '#EF4444',
    };
  }

  // 2. Category & keyword detection for positive habits
  const text = `${owner.category || ''} ${owner.name || ''}`.toLowerCase();
  let titlePrefix = '✨ Habit Reminder';
  let subtitle = 'Daily Routine';
  let defaultBody = 'A small step today keeps your momentum and progress moving forward.';

  if (text.includes('water') || text.includes('hydrat') || text.includes('drink')) {
    titlePrefix = '💧 Hydration Check';
    subtitle = 'Nutrition & Water';
    defaultBody = 'Drink a fresh glass of water to keep your body energized and mind clear.';
  } else if (text.includes('sleep') || text.includes('rest') || text.includes('bed') || text.includes('wind down')) {
    titlePrefix = '🌙 Bedtime & Rest';
    subtitle = 'Sleep & Recovery';
    defaultBody = 'Time to power down and let your mind and body recharge for tomorrow.';
  } else if (
    text.includes('fit') ||
    text.includes('exercis') ||
    text.includes('workout') ||
    text.includes('gym') ||
    text.includes('run') ||
    text.includes('walk') ||
    text.includes('step')
  ) {
    titlePrefix = '⚡ Movement & Vitality';
    subtitle = 'Fitness & Movement';
    defaultBody = 'Time for your workout! Movement fuels energy, clarity, and strength.';
  } else if (
    text.includes('mind') ||
    text.includes('meditat') ||
    text.includes('calm') ||
    text.includes('journal') ||
    text.includes('gratitude') ||
    text.includes('breath')
  ) {
    titlePrefix = '🧘 Mindful Pause';
    subtitle = 'Mindfulness & Peace';
    defaultBody = 'Take a deep breath and center your focus. A moment of calm creates daily peace.';
  } else if (
    text.includes('focus') ||
    text.includes('work') ||
    text.includes('career') ||
    text.includes('deep') ||
    text.includes('study') ||
    text.includes('code')
  ) {
    titlePrefix = '🎯 Deep Focus';
    subtitle = 'Focus & Career';
    defaultBody = 'Silence distractions and step into flow. Big achievements start with focused blocks.';
  } else if (
    text.includes('read') ||
    text.includes('book') ||
    text.includes('learn') ||
    text.includes('skill') ||
    text.includes('language')
  ) {
    titlePrefix = '📖 Expand Your Mind';
    subtitle = 'Learning & Reading';
    defaultBody = 'Open your book or lesson. A few minutes of daily growth compounds tremendously.';
  } else if (
    text.includes('financ') ||
    text.includes('wealth') ||
    text.includes('money') ||
    text.includes('budget')
  ) {
    titlePrefix = '💰 Financial Freedom';
    subtitle = 'Financial Discipline';
    defaultBody = 'Stay intentional with your resources and keep your financial goals in sight.';
  } else if (
    text.includes('detox') ||
    text.includes('screen') ||
    text.includes('phone') ||
    text.includes('scroll')
  ) {
    titlePrefix = '📵 Screen Reset';
    subtitle = 'Digital Detox';
    defaultBody = 'Step away from screens and connect with the real world around you.';
  } else if (
    text.includes('outdoor') ||
    text.includes('nature') ||
    text.includes('sun') ||
    text.includes('park')
  ) {
    titlePrefix = '🌿 Fresh Air & Nature';
    subtitle = 'Outdoor & Nature';
    defaultBody = 'Step outside, catch the sunlight, and refresh your mind and spirit.';
  } else if (
    text.includes('clean') ||
    text.includes('home') ||
    text.includes('organ') ||
    text.includes('tidy')
  ) {
    titlePrefix = '✨ Space & Clarity';
    subtitle = 'Home & Organization';
    defaultBody = 'A clean, tidy space brings peace of mind and effortless clarity.';
  } else if (
    text.includes('social') ||
    text.includes('relation') ||
    text.includes('friend') ||
    text.includes('family')
  ) {
    titlePrefix = '🤝 Connect & Care';
    subtitle = 'Relationships & Social';
    defaultBody = 'Reach out to someone you care about or share a moment of kindness.';
  }

  let body = owner.description?.trim() || defaultBody;
  if (owner.streak && owner.streak >= 2) {
    body += `\n🔥 ${owner.streak}-day streak! Keep the chain unbroken.`;
  }
  const quote = getRandomMotivationalQuote(owner.id);
  body += `\n✨ "${quote}"`;

  return {
    title: `${titlePrefix} · ${name}`,
    subtitle,
    body,
    color,
  };
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

export const setupNotificationChannelsAsync = async (): Promise<void> => {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('habit-reminders', {
      name: 'Habit reminders',
      importance: AndroidImportance.MAX,
      vibrationPattern: [0, 250, 200, 250],
      enableVibrate: true,
      sound: 'default',
      showBadge: true,
      lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
    });
    await Notifications.setNotificationChannelAsync('rhythm-reminders', {
      name: 'Daily rhythm (Wake & Sleep)',
      importance: AndroidImportance.MAX,
      vibrationPattern: [0, 300, 200, 300],
      enableVibrate: true,
      sound: 'default',
      showBadge: true,
      lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
    });
    await Notifications.setNotificationChannelAsync('default', {
      name: 'General notifications',
      importance: AndroidImportance.MAX,
      vibrationPattern: [0, 250, 200, 250],
      enableVibrate: true,
      sound: 'default',
      showBadge: true,
      lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
    });
  } catch (err) {
    console.warn('Could not setup Android notification channels:', err);
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
    await setupNotificationChannelsAsync();
    const permission = await Notifications.getPermissionsAsync();
    let granted = Boolean(
      permission.granted ||
      permission.status === 'granted' ||
      (permission.android && permission.android.importance > 0) ||
      permission.ios?.status === IosAuthorizationStatus.PROVISIONAL ||
      permission.ios?.status === IosAuthorizationStatus.AUTHORIZED
    );

    // On Android, also check if our primary notification channel exists and is enabled
    if (!granted && Platform.OS === 'android') {
      try {
        const channel = await Notifications.getNotificationChannelAsync('habit-reminders');
        if (channel && channel.importance >= AndroidImportance.DEFAULT) {
          granted = true;
        }
      } catch {
        // Ignore channel query error
      }
    }

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
    await setupNotificationChannelsAsync();

    let permission = await Notifications.getPermissionsAsync();
    let isGranted = Boolean(
      permission.granted ||
      permission.status === 'granted' ||
      (permission.android && permission.android.importance > 0) ||
      permission.ios?.status === IosAuthorizationStatus.PROVISIONAL ||
      permission.ios?.status === IosAuthorizationStatus.AUTHORIZED
    );

    if (!isGranted) {
      const requested = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      isGranted = Boolean(
        requested.granted ||
        requested.status === 'granted' ||
        (requested.android && requested.android.importance > 0) ||
        requested.ios?.status === IosAuthorizationStatus.PROVISIONAL ||
        requested.ios?.status === IosAuthorizationStatus.AUTHORIZED
      );
    }

    // On Android, if device channel importance is valid, treat as granted
    if (!isGranted && Platform.OS === 'android') {
      try {
        const channel = await Notifications.getNotificationChannelAsync('habit-reminders');
        if (channel && channel.importance >= AndroidImportance.DEFAULT) {
          isGranted = true;
        }
      } catch {
        // Ignore
      }
    }

    return isGranted;
  } catch (error) {
    console.warn('Could not request habit reminder permission:', error);
    if (Platform.OS === 'android') return true;
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

  await setupNotificationChannelsAsync();
  await ensureLocalReminderPermission();

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

  // 1. Cancel previous notifications (both known IDs and querying OS to prevent duplicates)
  if (Platform.OS === 'web') {
    const oldReminderIds = new Set([...reminders, ...previousReminders].map(r => r.id));
    oldReminderIds.forEach(id => activeWebReminders.delete(id));
  } else {
    const oldIds = new Set([...reminders, ...previousReminders].flatMap(reminder => reminder.notificationIds ?? []));

    // Cancel all scheduled notifications in the OS that belong to this owner
    try {
      const allScheduled = await Notifications.getAllScheduledNotificationsAsync();
      for (const item of allScheduled) {
        const itemData = (item.content?.data ?? {}) as Record<string, any>;
        const itemOwnerId = itemData.ownerId;
        const itemReminderId = itemData.reminderId;
        if (
          itemOwnerId === owner.id ||
          (itemReminderId && reminders.some(r => r.id === itemReminderId)) ||
          oldIds.has(item.identifier)
        ) {
          await Notifications.cancelScheduledNotificationAsync(item.identifier).catch(() => {});
        }
      }
    } catch (error) {
      console.warn('Could not inspect OS scheduled notifications for cleanup:', error);
    }

    // Fallback cancellation for known old IDs
    await Promise.all(Array.from(oldIds).map(async id => {
      try { await Notifications.cancelScheduledNotificationAsync(id); }
      catch { /* ignore */ }
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

  const content = buildHabitNotificationContent(owner);

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
        ownerName: content.title,
        ownerDescription: content.body,
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
          title: content.title,
          subtitle: content.subtitle,
          body: content.body,
          data: {
            ownerId: owner.id,
            reminderId: reminder.id,
            type: 'habit_reminder',
            time: `${reminder.hour}:${reminder.minute}`,
          },
          sound: owner.soundEnabled !== false,
          color: content.color,
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
            title: content.title,
            subtitle: content.subtitle,
            body: content.body,
            data: {
              ownerId: owner.id,
              reminderId: reminder.id,
              type: 'habit_reminder',
              time: `${reminder.hour}:${reminder.minute}`,
            },
            sound: owner.soundEnabled !== false,
            color: content.color,
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

/**
 * Scans the OS AlarmManager queue and purges all duplicate notifications,
 * leaving at most one active alarm per reminder slot.
 * Also removes orphaned notifications for habits that are deleted or have reminders disabled.
 */
export const cleanupDuplicateNotificationsAsync = async (
  activeHabits?: LocalReminderOwner[]
): Promise<{ cancelledCount: number }> => {
  if (Platform.OS === 'web') return { cancelledCount: 0 };
  try {
    const allScheduled = await Notifications.getAllScheduledNotificationsAsync();
    if (!Array.isArray(allScheduled) || allScheduled.length === 0) {
      return { cancelledCount: 0 };
    }

    const activeHabitMap = activeHabits ? new Map(activeHabits.map(h => [h.id, h])) : null;
    const seenSlots = new Set<string>();
    let cancelledCount = 0;

    for (const item of allScheduled) {
      const data = (item.content?.data ?? {}) as Record<string, any>;
      const ownerId = typeof data.ownerId === 'string' ? data.ownerId : undefined;
      const type = data.type || (data.rhythmType ? `rhythm_${data.rhythmType}` : undefined);

      // Check if this belongs to a habit that was deleted, archived, or disabled
      if (ownerId && activeHabitMap) {
        const habit = activeHabitMap.get(ownerId);
        if (!habit || habit.archivedAt || habit.notificationsEnabled === false) {
          await Notifications.cancelScheduledNotificationAsync(item.identifier).catch(() => {});
          cancelledCount++;
          continue;
        }
        const reminderId = data.reminderId;
        if (reminderId && habit.reminders && !habit.reminders.some(r => r.id === reminderId && r.enabled)) {
          await Notifications.cancelScheduledNotificationAsync(item.identifier).catch(() => {});
          cancelledCount++;
          continue;
        }
      }

      // Slot key for deduplication
      let slotKey = '';
      if (ownerId) {
        const trig = item.trigger as any;
        const hour = trig?.hour ?? '';
        const minute = trig?.minute ?? '';
        const weekday = trig?.weekday ?? 'all';
        slotKey = `habit_${ownerId}_${hour}_${minute}_${weekday}`;
      } else if (type === 'pending_habits_summary') {
        slotKey = 'pending_habits_summary';
      } else if (type) {
        slotKey = `type_${type}`;
      } else {
        const title = item.content?.title || '';
        const trig = item.trigger as any;
        slotKey = `generic_${title}_${trig?.hour ?? ''}_${trig?.minute ?? ''}`;
      }

      if (seenSlots.has(slotKey)) {
        // DUPLICATE ALARM DETECTED! Cancel it immediately!
        await Notifications.cancelScheduledNotificationAsync(item.identifier).catch(() => {});
        cancelledCount++;
      } else {
        seenSlots.add(slotKey);
      }
    }

    return { cancelledCount };
  } catch (err) {
    console.warn('Error during notification cleanup sweep:', err);
    return { cancelledCount: 0 };
  }
};

export const PENDING_HABITS_STORAGE_KEY = '@daymark_pending_notification_ids';

export interface PendingHabitsOptions {
  hour?: number;
  minute?: number;
  notificationsEnabled?: boolean;
  soundEnabled?: boolean;
  todayDateStr?: string;
  timezone?: string;
}

/**
 * Automatically schedules a smart daily reminder of pending habits with motivational encouragement.
 * Refreshes smoothly whenever habits are completed or modified.
 */
export const schedulePendingHabitsReminderAsync = async (
  habits: LocalReminderOwner[],
  options: PendingHabitsOptions = {}
): Promise<string | null> => {
  if (options.notificationsEnabled === false) {
    if (Platform.OS !== 'web') {
      try {
        const stored = await AsyncStorage.getItem(PENDING_HABITS_STORAGE_KEY);
        if (stored) {
          const oldIds: string[] = JSON.parse(stored);
          await Promise.all(oldIds.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
          await AsyncStorage.setItem(PENDING_HABITS_STORAGE_KEY, JSON.stringify([]));
        }
      } catch { /* ignore */ }
    }
    return null;
  }

  const today = options.todayDateStr || toLocalDateString(new Date());

  const activeTodayHabits = habits.filter(h => {
    if (h.archivedAt) return false;
    if (h.startDate && h.startDate > today) return false;
    if (h.endDate && h.endDate < today) return false;
    if ((h.pausedPeriods ?? []).some(p => p.startDate <= today && (!p.endDate || p.endDate >= today))) return false;
    return true;
  });

  if (activeTodayHabits.length === 0) return null;

  const pendingHabits = activeTodayHabits.filter(h => {
    const dates = (h as any).completedDates;
    return !Array.isArray(dates) || !dates.includes(today);
  });

  const checkHour = options.hour ?? 19; // Default 7:00 PM evening check-in
  const checkMinute = options.minute ?? 0;

  const motivationalQuote = getRandomMotivationalQuote(pendingHabits.length + checkHour);
  let title = '';
  let body = '';

  if (pendingHabits.length > 0) {
    const pendingNames = pendingHabits.slice(0, 3).map(h => h.name.trim()).join(', ');
    const moreCount = pendingHabits.length > 3 ? ` +${pendingHabits.length - 3} more` : '';
    title = `⚡ ${pendingHabits.length} Pending Habit${pendingHabits.length > 1 ? 's' : ''} Today`;
    body = `Pending: ${pendingNames}${moreCount}\n✨ "${motivationalQuote}"\nTake 5 minutes to complete them and keep your streak strong! 💪`;
  } else {
    title = '🏆 Perfect Day Achieved!';
    body = `All ${activeTodayHabits.length} habits completed today!\n✨ "${motivationalQuote}"\nOutstanding consistency. Rest well tonight! 🌟`;
  }

  if (Platform.OS === 'web') {
    activeWebReminders.delete('pending_habits_summary');
    activeWebReminders.set('pending_habits_summary', {
      ownerId: 'pending_habits_summary',
      ownerName: title,
      ownerDescription: body,
      soundEnabled: options.soundEnabled !== false,
      reminderId: 'pending_habits_summary',
      hour: checkHour,
      minute: checkMinute,
      weekdays: [1, 2, 3, 4, 5, 6, 7],
    });
    ensureWebWatcherStarted();
    return 'web_pending_summary';
  }

  try {
    const allScheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const item of allScheduled) {
      if (item.content?.data?.type === 'pending_habits_summary') {
        await Notifications.cancelScheduledNotificationAsync(item.identifier).catch(() => {});
      }
    }
    const stored = await AsyncStorage.getItem(PENDING_HABITS_STORAGE_KEY);
    if (stored) {
      const oldIds: string[] = JSON.parse(stored);
      await Promise.all(oldIds.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
    }
  } catch { /* ignore */ }

  const permStatus = await checkNotificationPermissionStatus();
  if (!permStatus.granted) return null;

  try {
    const triggerInput: any = {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: checkHour,
      minute: checkMinute,
      channelId: 'habit-reminders',
    };
    if (Platform.OS === 'android') {
      triggerInput.delivery = 'alarmClock';
    }

    const scheduledId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        subtitle: 'Daily Habit Check-In',
        body,
        sound: options.soundEnabled !== false,
        color: '#10B981',
        data: {
          type: 'pending_habits_summary',
          pendingCount: pendingHabits.length,
        },
      },
      trigger: triggerInput,
    });

    await AsyncStorage.setItem(PENDING_HABITS_STORAGE_KEY, JSON.stringify([scheduledId]));
    return scheduledId;
  } catch (err) {
    console.warn('Failed to schedule pending habits reminder:', err);
    return null;
  }
};

/**
 * Allows user to share their pending habits and daily consistency progress with friends, family, or accountability partners.
 */
export const shareDailyProgressAsync = async (
  habits: { name: string; streak?: number; completedDates?: string[]; archivedAt?: string | null; startDate?: string; endDate?: string | null; pausedPeriods?: any[] }[],
  selectedDate: string,
  stats?: { completedToday: number; totalToday: number; bestStreak?: number }
): Promise<boolean> => {
  try {
    const today = selectedDate || toLocalDateString(new Date());
    const activeToday = habits.filter(h => {
      if (h.archivedAt) return false;
      if (h.startDate && h.startDate > today) return false;
      if (h.endDate && h.endDate < today) return false;
      return true;
    });

    const completed = activeToday.filter(h => Array.isArray(h.completedDates) && h.completedDates.includes(today));
    const pending = activeToday.filter(h => !Array.isArray(h.completedDates) || !h.completedDates.includes(today));

    const total = activeToday.length;
    const completedCount = completed.length;
    const percentage = total > 0 ? Math.round((completedCount / total) * 100) : 0;
    const quote = getRandomMotivationalQuote(total + completedCount);

    let message = `🌟 Daymark Habit Progress (${today})\n`;
    message += `📊 ${completedCount}/${total} habits completed (${percentage}%)\n\n`;

    if (completed.length > 0) {
      message += `✅ Completed:\n`;
      completed.forEach(h => {
        const streakText = (h.streak && h.streak > 1) ? ` (🔥 ${h.streak}d)` : '';
        message += `  • ${h.name}${streakText}\n`;
      });
      message += '\n';
    }

    if (pending.length > 0) {
      message += `⏳ Pending:\n`;
      pending.forEach(h => {
        message += `  • ${h.name}\n`;
      });
      message += '\n';
    } else if (total > 0) {
      message += `🏆 All habits finished! Perfect consistency.\n\n`;
    }

    message += `✨ "${quote}"\n\n`;
    message += `Track your daily habits with Daymark: https://play.google.com/store/apps/details?id=com.daymark.habittracker.app`;

    const result = await Share.share({
      title: `Daymark Habit Progress (${completedCount}/${total})`,
      message,
    });

    return result.action === Share.sharedAction;
  } catch (err) {
    console.warn('Could not share habit progress:', err);
    return false;
  }
};

export const RHYTHM_STORAGE_KEY = '@daymark_rhythm_notification_ids';

export interface RhythmPreferencesInput {
  wakeTime?: string | null;
  sleepTime?: string | null;
  notifications?: { routine?: boolean };
  soundEnabled?: boolean;
}

/**
 * Schedules daily wake-up and sleep/wind-down rhythm notifications based on user preferences.
 */
export const scheduleRhythmRemindersAsync = async (prefs: RhythmPreferencesInput): Promise<void> => {
  // 1. Cancel previous rhythm notifications
  if (Platform.OS === 'web') {
    activeWebReminders.delete('rhythm_wake');
    activeWebReminders.delete('rhythm_sleep');
  } else {
    try {
      const allScheduled = await Notifications.getAllScheduledNotificationsAsync();
      for (const item of allScheduled) {
        if (item.content?.data?.rhythmType) {
          await Notifications.cancelScheduledNotificationAsync(item.identifier).catch(() => {});
        }
      }
      const stored = await AsyncStorage.getItem(RHYTHM_STORAGE_KEY);
      if (stored) {
        const oldIds: string[] = JSON.parse(stored);
        await Promise.all(oldIds.map(async id => {
          try { await Notifications.cancelScheduledNotificationAsync(id); } catch { /* ignore */ }
        }));
      }
    } catch {
      // Ignore reading error
    }
  }

  // If routine notifications are explicitly turned off, clear stored IDs and stop
  if (prefs.notifications?.routine === false) {
    if (Platform.OS !== 'web') {
      try { await AsyncStorage.setItem(RHYTHM_STORAGE_KEY, JSON.stringify([])); } catch { /* ignore */ }
    }
    return;
  }

  const parsedWake = prefs.wakeTime ? parseTimeString(prefs.wakeTime) : null;
  const parsedSleep = prefs.sleepTime ? parseTimeString(prefs.sleepTime) : null;

  if (!parsedWake && !parsedSleep) {
    if (Platform.OS !== 'web') {
      try { await AsyncStorage.setItem(RHYTHM_STORAGE_KEY, JSON.stringify([])); } catch { /* ignore */ }
    }
    return;
  }

  // Check permission (silently return if not yet granted to prevent unexpected dialogs)
  const permStatus = await checkNotificationPermissionStatus();
  if (!permStatus.granted && Platform.OS !== 'web') {
    return;
  }

  // Ensure rhythm-reminders channel exists on Android
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('rhythm-reminders', {
        name: 'Daily rhythm (Wake & Sleep)',
        importance: AndroidImportance.MAX,
        vibrationPattern: [0, 300, 200, 300],
        enableVibrate: true,
        sound: 'default',
        showBadge: true,
        lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
      });
    } catch { /* ignore */ }
  }

  const newIds: string[] = [];

  // 1. Wake Up reminder
  if (parsedWake) {
    const wakeTitle = '☀️ Good Morning! Rise & Shine';
    const wakeSub = 'Daily Rhythm';
    const wakeBody = "A new day begins. Check today's routine and set your intentions for greatness.";
    if (Platform.OS === 'web') {
      activeWebReminders.set('rhythm_wake', {
        ownerId: 'rhythm_wake',
        ownerName: wakeTitle,
        ownerDescription: wakeBody,
        soundEnabled: prefs.soundEnabled !== false,
        reminderId: 'rhythm_wake',
        hour: parsedWake.hour,
        minute: parsedWake.minute,
        weekdays: [1, 2, 3, 4, 5, 6, 7],
      });
    } else {
      try {
        const triggerInput: any = {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: parsedWake.hour,
          minute: parsedWake.minute,
          channelId: 'rhythm-reminders',
        };
        if (Platform.OS === 'android') {
          triggerInput.delivery = 'alarmClock';
        }
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: wakeTitle,
            subtitle: wakeSub,
            body: wakeBody,
            sound: prefs.soundEnabled !== false,
            color: '#FF7A00',
            data: { rhythmType: 'wake' },
          },
          trigger: triggerInput,
        });
        newIds.push(id);
      } catch (err) {
        console.warn('Could not schedule wake-up reminder:', err);
      }
    }
  }

  // 2. Sleep reminder
  if (parsedSleep) {
    const sleepTitle = '🌙 Wind Down · Time for Rest';
    const sleepSub = 'Daily Rhythm';
    const sleepBody = 'Rest is your superpower. Review your wins for today and prepare for deep, restorative sleep.';
    if (Platform.OS === 'web') {
      activeWebReminders.set('rhythm_sleep', {
        ownerId: 'rhythm_sleep',
        ownerName: sleepTitle,
        ownerDescription: sleepBody,
        soundEnabled: prefs.soundEnabled !== false,
        reminderId: 'rhythm_sleep',
        hour: parsedSleep.hour,
        minute: parsedSleep.minute,
        weekdays: [1, 2, 3, 4, 5, 6, 7],
      });
    } else {
      try {
        const triggerInput: any = {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: parsedSleep.hour,
          minute: parsedSleep.minute,
          channelId: 'rhythm-reminders',
        };
        if (Platform.OS === 'android') {
          triggerInput.delivery = 'alarmClock';
        }
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: sleepTitle,
            subtitle: sleepSub,
            body: sleepBody,
            sound: prefs.soundEnabled !== false,
            color: '#6366F1',
            data: { rhythmType: 'sleep' },
          },
          trigger: triggerInput,
        });
        newIds.push(id);
      } catch (err) {
        console.warn('Could not schedule sleep reminder:', err);
      }
    }
  }

  if (Platform.OS === 'web') {
    ensureWebWatcherStarted();
  } else {
    try {
      await AsyncStorage.setItem(RHYTHM_STORAGE_KEY, JSON.stringify(newIds));
    } catch { /* ignore */ }
  }
};
