export type HabitKind = 'positive' | 'quit';
export type TrackingMethod = 'yes_no' | 'count' | 'measurable';

export type ScheduleFrequency =
  | 'daily'
  | 'weekdays'
  | 'weekends'
  | 'selected_weekdays'
  | 'weekly_target'
  | 'monthly_dates';

export interface HabitSchedule {
  frequency: ScheduleFrequency;
  /** ISO weekday values: Monday=1 through Sunday=7. */
  weekdays?: number[];
  /** Successful occurrences required within an ISO week. */
  weeklyTarget?: number;
  /** Calendar dates 1-31 for a monthly schedule. */
  monthDays?: number[];
}

export interface HabitPause {
  startDate: string;
  endDate: string | null;
}

export interface HabitLog {
  date: string;
  value?: number;
  outcome?: 'completed' | 'lapse';
  note?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface HabitReminder {
  id: string;
  hour: number;
  minute: number;
  weekdays: number[];
  enabled: boolean;
  notificationIds?: string[];
}

export interface HabitConfigurationSnapshot {
  effectiveFrom: string;
  name: string;
  description?: string;
  category: string;
  color: string;
  icon: string;
  targetFrequency?: string;
  habitKind: HabitKind;
  trackingMethod: TrackingMethod;
  targetValue: number;
  unit?: string;
  schedule: HabitSchedule;
  startDate?: string;
  endDate?: string | null;
}
