export interface ExportHabit { id: string; name: string; category: string; color: string; icon: string; description?: string; habitKind?: string; trackingMethod?: string; targetValue?: number; unit?: string; startDate?: string; schedule?: unknown; reminders?: unknown[]; completedDates?: string[]; logs?: { date: string; value?: number; outcome?: string; note?: string }[]; archivedAt?: string | null; pausedPeriods?: unknown[]; configurationHistory?: unknown[] }
export interface ExportRecord { id: string; name: string; description?: string; createdAt?: string; updatedAt?: string; archivedAt?: string | null; metadata?: unknown }
export interface DaymarkExport { exportedAt: string; timezone: string; statistics: unknown; habits: ExportHabit[]; routines: ExportRecord[]; goals: ExportRecord[]; journal: { id: string; habitId: string | null; date: string; text: string; createdAt: string; updatedAt: string }[]; achievements: unknown[] }

const csvValue = (value: unknown) => {
  const string = value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value) ?? '';
  return /[",\r\n]/.test(string) ? `"${string.replace(/"/g, '""')}"` : string;
};
export const buildDaymarkCsv = (data: DaymarkExport): string => {
  const header = ['record_type', 'id', 'name', 'date', 'status', 'value', 'unit', 'category', 'note', 'metadata'];
  const rows: unknown[][] = [[ 'summary', '', 'Daymark export', data.exportedAt, '', '', '', '', '', { timezone: data.timezone, statistics: data.statistics } ]];
  for (const habit of data.habits) {
    rows.push(['habit', habit.id, habit.name, habit.startDate, habit.archivedAt ? 'archived' : 'active', habit.targetValue, habit.unit, habit.category, '', { color: habit.color, icon: habit.icon, description: habit.description, habitKind: habit.habitKind, trackingMethod: habit.trackingMethod, schedule: habit.schedule, reminders: habit.reminders, pausedPeriods: habit.pausedPeriods, configurationHistory: habit.configurationHistory }]);
    const logs = new Map((habit.logs ?? []).map(log => [log.date, log]));
    const dates = [...new Set([...(habit.completedDates ?? []), ...logs.keys()])].sort();
    for (const date of dates) {
      const log = logs.get(date);
      rows.push(['completion', habit.id, habit.name, date, log?.outcome ?? 'completed', log?.value ?? 1, habit.unit, habit.category, log?.note ?? '', { trackingMethod: habit.trackingMethod, targetValue: habit.targetValue }]);
    }
  }
  for (const entry of data.journal) rows.push(['journal', entry.id, data.habits.find(habit => habit.id === entry.habitId)?.name ?? 'Daily reflection', entry.date, 'entry', '', '', '', entry.text, { habitId: entry.habitId, createdAt: entry.createdAt, updatedAt: entry.updatedAt }]);
  for (const routine of data.routines) rows.push(['routine', routine.id, routine.name, routine.createdAt, routine.archivedAt ? 'archived' : 'active', '', '', '', routine.description ?? '', routine.metadata]);
  for (const goal of data.goals) rows.push(['goal', goal.id, goal.name, goal.createdAt, goal.archivedAt ? 'archived' : 'active', '', '', '', goal.description ?? '', goal.metadata]);
  return [header, ...rows].map(row => row.map(csvValue).join(',')).join('\r\n');
};

export const buildDaymarkJson = (data: DaymarkExport): string => JSON.stringify({ format: 'daymark-export-v1', ...data }, null, 2);
