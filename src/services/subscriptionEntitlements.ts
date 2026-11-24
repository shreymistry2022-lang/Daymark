export const PRO_ENTITLEMENT_ID = 'daymark_pro';
export const FREE_ACTIVE_HABIT_LIMIT = 5;

export type SubscriptionFeature =
  | 'habit_limit_5'
  | 'basic_tracking'
  | 'basic_calendar'
  | 'basic_heatmap'
  | 'basic_analytics'
  | 'basic_reminders'
  | 'basic_notes'
  | 'unlimited_habits'
  | 'unlimited_categories'
  | 'advanced_scheduling'
  | 'unlimited_reminders'
  | 'full_history'
  | 'yearly_heatmap'
  | 'advanced_calendar'
  | 'advanced_analytics'
  | 'advanced_streaks'
  | 'routines'
  | 'goals'
  | 'advanced_journal'
  | 'achievements'
  | 'reports'
  | 'premium_themes'
  | 'advanced_widgets'
  | 'advanced_export';

const PRO_FEATURES = new Set<SubscriptionFeature>([
  'unlimited_habits', 'unlimited_categories', 'advanced_scheduling',
  'unlimited_reminders', 'full_history', 'yearly_heatmap', 'advanced_calendar',
  'advanced_analytics', 'advanced_streaks', 'routines', 'goals',
  'advanced_journal', 'achievements', 'reports', 'premium_themes',
  'advanced_widgets', 'advanced_export',
]);

/**
 * Global switch for monetized subscriptions:
 * - false: Launch v1.0 as 100% Free with all features unlocked for Google Play review and initial testers.
 * - true: Turn on RevenueCat paywall and store subscriptions for v1.1+.
 */
export const SUBSCRIPTIONS_ENABLED = true;

export const canAccessFeature = (feature: SubscriptionFeature, isPro: boolean): boolean =>
  !SUBSCRIPTIONS_ENABLED || !PRO_FEATURES.has(feature) || isPro;

export const canCreateHabit = (activeHabitCount: number, isPro: boolean): boolean =>
  !SUBSCRIPTIONS_ENABLED || isPro || activeHabitCount < FREE_ACTIVE_HABIT_LIMIT;

export const PRO_WHITELISTED_EMAILS: string[] = [
  'smsm44186@gmail.com',
];

export const isWhitelistedProEmail = (email?: string | null): boolean => {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return PRO_WHITELISTED_EMAILS.includes(normalized);
};

