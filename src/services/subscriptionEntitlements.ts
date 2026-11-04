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

export const canAccessFeature = (feature: SubscriptionFeature, isPro: boolean): boolean =>
  !PRO_FEATURES.has(feature) || isPro;

export const canCreateHabit = (activeHabitCount: number, isPro: boolean): boolean =>
  isPro || activeHabitCount < FREE_ACTIVE_HABIT_LIMIT;

export const PRO_WHITELISTED_EMAILS: string[] = [
  'smsm44186@gmail.com',
];

export const isWhitelistedProEmail = (email?: string | null): boolean => {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return PRO_WHITELISTED_EMAILS.includes(normalized);
};

