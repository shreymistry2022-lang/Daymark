import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { addLocalDays, getHabitDayStatus, parseLocalDate } from '../domain/habitEngine';
import { Habit } from '../services/HabitContext';

interface HabitDotGridProps {
  habit: Habit;
  todayDateStr: string;
  isDark: boolean;
  mutedTextColor: string;
  weeks?: number;
  dotSize?: number;
  dotGap?: number;
  showMonthLabels?: boolean;
  showWeekdayLabels?: boolean;
  mode?: 'heatmap' | 'month';
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const HabitDotGrid = React.memo(({
  habit,
  todayDateStr,
  isDark,
  mutedTextColor,
  weeks = 18,
  dotSize = 9,
  dotGap = 3,
  showMonthLabels = false,
  showWeekdayLabels = false,
  mode = 'heatmap',
}: HabitDotGridProps) => {
  const todayRef = useMemo(() => parseLocalDate(todayDateStr) ?? new Date(), [todayDateStr]);
  const emptyDotColor = isDark ? `${habit.color}1C` : `${habit.color}22`;

  const monthData = useMemo(() => {
    if (mode !== 'month') return null;
    const year = todayRef.getFullYear();
    const month = todayRef.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const offset = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-first
    const cells: (string | null)[] = Array(offset).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [mode, todayRef]);

  const weekColumns = useMemo(() => {
    if (mode !== 'heatmap') return [];
    const totalDays = weeks * 7;
    const todayDayIndex = (todayRef.getDay() + 6) % 7; // 0 = Mon ... 6 = Sun
    const endOfWeekOffset = 6 - todayDayIndex;
    const gridEnd = addLocalDays(todayDateStr, endOfWeekOffset);
    const gridStart = addLocalDays(gridEnd, -(totalDays - 1));

    const cols: { monthLabel: string | null; dates: string[] }[] = [];
    let lastMonth = -1;
    for (let w = 0; w < weeks; w++) {
      const colDates: string[] = [];
      let label: string | null = null;
      for (let d = 0; d < 7; d++) {
        const dateStr = addLocalDays(gridStart, w * 7 + d);
        colDates.push(dateStr);
        if (d === 0) {
          const parsed = parseLocalDate(dateStr);
          if (parsed && parsed.getMonth() !== lastMonth) {
            lastMonth = parsed.getMonth();
            label = MONTH_SHORT[lastMonth];
          }
        }
      }
      cols.push({ monthLabel: label, dates: colDates });
    }
    return cols;
  }, [mode, todayDateStr, todayRef, weeks]);

  if (mode === 'month' && monthData) {
    const rows = Array.from({ length: monthData.length / 7 }, (_, i) => monthData.slice(i * 7, i * 7 + 7));
    return (
      <View style={{ gap: dotGap }}>
        {rows.map((row, rowIdx) => (
          <View key={rowIdx} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: dotGap }}>
            {row.map((dateStr, colIdx) => {
              if (!dateStr) {
                return <View key={`empty_${colIdx}`} style={{ width: dotSize, height: dotSize }} />;
              }
              const done = dateStr <= todayDateStr && getHabitDayStatus(habit, dateStr, todayRef) === 'completed';
              const isToday = dateStr === todayDateStr;
              return (
                <View
                  key={dateStr}
                  style={{
                    width: dotSize,
                    height: dotSize,
                    borderRadius: Math.max(2, Math.round(dotSize * 0.35)),
                    backgroundColor: done ? habit.color : emptyDotColor,
                    borderWidth: isToday && !done ? 1 : 0,
                    borderColor: isToday ? habit.color : 'transparent',
                  }}
                />
              );
            })}
          </View>
        ))}
      </View>
    );
  }

  return (
    <View>
      {showMonthLabels ? (
        <View style={{ flexDirection: 'row', gap: dotGap, marginBottom: 4, paddingLeft: showWeekdayLabels ? 28 : 0 }}>
          {weekColumns.map((col, idx) => (
            <View key={idx} style={{ width: dotSize, overflow: 'visible' }}>
              {col.monthLabel ? (
                <Text numberOfLines={1} style={{ fontSize: 9, fontWeight: '600', color: mutedTextColor, width: 28 }}>
                  {col.monthLabel}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        {showWeekdayLabels ? (
          <View style={{ width: 24, marginRight: 4, gap: dotGap }}>
            {['', 'Tue', '', 'Thu', '', 'Sat', ''].map((dayLabel, idx) => (
              <View key={idx} style={{ height: dotSize, justifyContent: 'center' }}>
                {dayLabel ? (
                  <Text style={{ fontSize: 9, fontWeight: '600', color: mutedTextColor }}>{dayLabel}</Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', gap: dotGap }}>
          {weekColumns.map((col, wIdx) => (
            <View key={wIdx} style={{ gap: dotGap }}>
              {col.dates.map(dateStr => {
                const isFuture = dateStr > todayDateStr;
                const done = !isFuture && getHabitDayStatus(habit, dateStr, todayRef) === 'completed';
                return (
                  <View
                    key={dateStr}
                    style={{
                      width: dotSize,
                      height: dotSize,
                      borderRadius: Math.max(2, Math.round(dotSize * 0.32)),
                      backgroundColor: done ? habit.color : emptyDotColor,
                      opacity: isFuture ? 0.35 : 1,
                    }}
                  />
                );
              })}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}, (prev, next) => (
  prev.habit.id === next.habit.id &&
  prev.habit.completedDates === next.habit.completedDates &&
  prev.habit.logs === next.habit.logs &&
  prev.habit.color === next.habit.color &&
  prev.habit.startDate === next.habit.startDate &&
  prev.habit.endDate === next.habit.endDate &&
  prev.habit.pausedPeriods === next.habit.pausedPeriods &&
  prev.habit.schedule === next.habit.schedule &&
  prev.habit.targetValue === next.habit.targetValue &&
  prev.habit.trackingMethod === next.habit.trackingMethod &&
  prev.habit.habitKind === next.habit.habitKind &&
  prev.todayDateStr === next.todayDateStr &&
  prev.isDark === next.isDark &&
  prev.mutedTextColor === next.mutedTextColor &&
  prev.weeks === next.weeks &&
  prev.dotSize === next.dotSize &&
  prev.dotGap === next.dotGap &&
  prev.showMonthLabels === next.showMonthLabels &&
  prev.showWeekdayLabels === next.showWeekdayLabels &&
  prev.mode === next.mode
));

HabitDotGrid.displayName = 'HabitDotGrid';
