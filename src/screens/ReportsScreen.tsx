// src/screens/ReportsScreen.tsx
import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getHabitPastelTheme } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useHabits } from '../services/HabitContext';
import { addLocalDays, getHabitDayStatus, parseLocalDate, calculateStreakStats } from '../domain/habitEngine';

interface Props {
  onClose?: () => void;
}

type TabPeriod = 'Weekly' | 'Monthly' | 'Yearly';

export const ReportsScreen = ({ onClose }: Props) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { habits, todayDateStr } = useHabits();

  const [activeTab, setActiveTab] = useState<TabPeriod>('Weekly');
  const [weekOffset, setWeekOffset] = useState<number>(0); // 0 = current week, -1 = last week, etc.

  // Reference date adjusted by week offset (7 days per offset)
  const currentRefDate = useMemo(() => {
    return addLocalDays(todayDateStr, weekOffset * 7);
  }, [todayDateStr, weekOffset]);

  // Compute the 7 days of the selected week (Sunday to Saturday or based on weekStart)
  const weekDays = useMemo(() => {
    const ref = parseLocalDate(currentRefDate) ?? new Date();
    const dayOfWeek = ref.getDay(); // 0 is Sunday
    // Start on Sunday (index 0)
    const sundayOffset = -dayOfWeek;
    return Array.from({ length: 7 }, (_, i) => {
      const dateStr = addLocalDays(currentRefDate, sundayOffset + i);
      const d = parseLocalDate(dateStr) ?? new Date();
      return {
        dateStr,
        dayNumber: d.getDate(),
        monthNumber: d.getMonth() + 1,
        dayLabel: ['S', 'M', 'T', 'W', 'T', 'F', 'S'][i],
      };
    });
  }, [currentRefDate]);

  // Date range string like "12/28~01/03"
  const dateRangeLabel = useMemo(() => {
    if (weekDays.length === 0) return '';
    const start = weekDays[0];
    const end = weekDays[6];
    const sStr = `${String(start.monthNumber).padStart(2, '0')}/${String(start.dayNumber).padStart(2, '0')}`;
    const eStr = `${String(end.monthNumber).padStart(2, '0')}/${String(end.dayNumber).padStart(2, '0')}`;
    return `${sStr}~${eStr}`;
  }, [weekDays]);

  // Compute daily completion counts for BestDay calculation
  const dailyCounts = useMemo(() => {
    return weekDays.map(day => {
      let completedCount = 0;
      let scheduledCount = 0;
      habits.forEach(habit => {
        const status = getHabitDayStatus(habit, day.dateStr);
        if (status === 'completed') completedCount++;
        if (status !== 'unscheduled' && status !== 'not_started' && status !== 'ended') scheduledCount++;
      });
      return {
        dateStr: day.dateStr,
        completedCount,
        scheduledCount,
      };
    });
  }, [weekDays, habits]);

  const maxCompletedInDay = useMemo(() => {
    return Math.max(0, ...dailyCounts.map(d => d.completedCount));
  }, [dailyCounts]);

  // Overall Week Metrics
  const totalCompletedInWeek = useMemo(() => {
    return dailyCounts.reduce((acc, curr) => acc + curr.completedCount, 0);
  }, [dailyCounts]);

  const totalScheduledInWeek = useMemo(() => {
    const total = dailyCounts.reduce((acc, curr) => acc + curr.scheduledCount, 0);
    return total > 0 ? total : habits.length * 7;
  }, [dailyCounts, habits.length]);

  const metPercentage = useMemo(() => {
    if (totalScheduledInWeek === 0) return 0;
    return Math.min(100, Math.round((totalCompletedInWeek / totalScheduledInWeek) * 100));
  }, [totalCompletedInWeek, totalScheduledInWeek]);

  const bestStreak = useMemo(() => {
    if (habits.length === 0) return 0;
    let max = 0;
    habits.forEach(h => {
      const stats = calculateStreakStats(h);
      if (stats.bestStreak > max) max = stats.bestStreak;
    });
    return max;
  }, [habits]);

  // Best day string (e.g. "7d" if all 7 met or max days met)
  const bestDayMetric = useMemo(() => {
    const bestCount = dailyCounts.filter(d => d.completedCount > 0 && d.completedCount === maxCompletedInDay).length;
    return bestCount > 0 ? `${bestCount}d` : '0d';
  }, [dailyCounts, maxCompletedInDay]);

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Daymark Habit Report (${dateRangeLabel}): ${metPercentage}% completed with ${totalCompletedInWeek} habits done! ✨`,
      });
    } catch {
      // ignore
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Top Header */}
      <View style={styles.topBar}>
        <View style={styles.tabsRow}>
          {(['Weekly', 'Monthly', 'Yearly'] as TabPeriod[]).map(tab => {
            const isActive = tab === activeTab;
            return (
              <TouchableOpacity
                key={tab}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                onPress={() => setActiveTab(tab)}
                style={styles.tabBtn}
              >
                <Text
                  style={[
                    styles.tabBtnText,
                    {
                      color: isActive ? colors.primaryText : colors.secondaryText,
                      fontWeight: isActive ? '700' : '500',
                    },
                  ]}
                >
                  {tab}
                </Text>
                {isActive && <View style={[styles.tabIndicator, { backgroundColor: colors.accent }]} />}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.topRightActions}>
          <TouchableOpacity
            style={[styles.filterPill, { backgroundColor: colors.accent }]}
            activeOpacity={0.8}
            onPress={() => setWeekOffset(0)}
          >
            <Text style={styles.filterText}>Today</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Share report"
            onPress={handleShare}
            style={[styles.shareCircle, { backgroundColor: `${colors.accent}15` }]}
          >
            <Ionicons name="share-outline" size={17} color={colors.accent} />
          </TouchableOpacity>
          {onClose && (
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.primaryText} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 90 }]}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'Weekly' ? (
          /* Stationery Card matching screen 2.png & screen 10.png */
          <View
            style={[
              styles.stationeryCard,
              {
                backgroundColor: isDark ? '#1C1E28' : '#FFFFFF',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
              },
            ]}
          >
            {/* Calligraphy Banner: ☀️ Habit Tracker 🌙 */}
            <View style={styles.bannerRow}>
              <Text style={styles.bannerSun}>☀️</Text>
              <Text style={[styles.bannerTitle, { color: colors.accent }]}>Habit Tracker</Text>
              <Text style={styles.bannerMoon}>🌙</Text>
            </View>

            {/* Date Range Navigator: < 12/28~01/03 > */}
            <View style={styles.dateNavigator}>
              <TouchableOpacity
                accessibilityLabel="Previous week"
                onPress={() => setWeekOffset(prev => prev - 1)}
                style={[styles.arrowPill, { backgroundColor: `${colors.accent}18` }]}
              >
                <Ionicons name="chevron-back" size={14} color={colors.accent} />
              </TouchableOpacity>

              <View style={styles.yellowDateBadge}>
                <Text style={styles.dateBadgeText}>{dateRangeLabel}</Text>
              </View>

              <TouchableOpacity
                accessibilityLabel="Next week"
                onPress={() => setWeekOffset(prev => Math.min(0, prev + 1))}
                style={[
                  styles.arrowPill,
                  { backgroundColor: `${colors.accent}18`, opacity: weekOffset >= 0 ? 0.35 : 1 },
                ]}
                disabled={weekOffset >= 0}
              >
                <Ionicons name="chevron-forward" size={14} color={colors.accent} />
              </TouchableOpacity>
            </View>

            {/* Matrix Grid Table */}
            <View style={styles.gridContainer}>
              {/* Table Header: Habit | S M T W T F S | Badge */}
              <View style={styles.tableHeaderRow}>
                <View style={styles.habitColumnHeader}>
                  <Text style={[styles.headerLabel, { color: colors.secondaryText }]}>Habit</Text>
                </View>
                <View style={styles.weekDaysHeader}>
                  {weekDays.map((day, idx) => (
                    <View key={idx} style={styles.headerDayCell}>
                      <Text style={[styles.headerDayText, { color: colors.secondaryText }]}>
                        {day.dayLabel}
                      </Text>
                    </View>
                  ))}
                </View>
                <View style={styles.badgeColumnHeader} />
              </View>

              {/* Habit Rows */}
              {habits.length === 0 ? (
                <View style={styles.emptyGridState}>
                  <Text style={[styles.emptyGridText, { color: colors.secondaryText }]}>
                    No habits created yet. Tap + to add habits!
                  </Text>
                </View>
              ) : (
                habits.map(habit => {
                  const pastel = getHabitPastelTheme(habit, isDark);
                  let completedDaysCount = 0;

                  return (
                    <View
                      key={habit.id}
                      style={[
                        styles.habitRow,
                        { borderBottomColor: isDark ? 'rgba(255,255,255,0.04)' : '#F3F4F6' },
                      ]}
                    >
                      {/* Habit Icon + Name */}
                      <View style={styles.habitNameCell}>
                        <Ionicons
                          name={habit.icon as any}
                          size={15}
                          color={habit.color || colors.accent}
                          style={{ marginRight: 6 }}
                        />
                        <Text
                          numberOfLines={1}
                          style={[styles.habitNameText, { color: colors.primaryText }]}
                        >
                          {habit.name}
                        </Text>
                      </View>

                      {/* 7 Days Matrix Cells */}
                      <View style={styles.weekDaysHeader}>
                        {weekDays.map((day, dayIdx) => {
                          const status = getHabitDayStatus(habit, day.dateStr);
                          const isDone = status === 'completed';
                          if (isDone) completedDaysCount++;

                          return (
                            <View key={dayIdx} style={styles.gridSquareWrapper}>
                              <View
                                style={[
                                  styles.pastelSquare,
                                  isDone
                                    ? {
                                        backgroundColor: habit.color || pastel.accent,
                                        opacity: isDark ? 0.9 : 0.85,
                                      }
                                    : {
                                        backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F1F2F6',
                                      },
                                ]}
                              />
                            </View>
                          );
                        })}
                      </View>

                      {/* Perfect Badge if 7/7 completed */}
                      <View style={styles.badgeCell}>
                        {completedDaysCount >= 7 ? (
                          <View style={styles.perfectBadge}>
                            <Text style={styles.perfectIcon}>👍</Text>
                            <Text style={styles.perfectText}>PERFECT</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  );
                })
              )}

              {/* BestDay Row */}
              <View style={[styles.bestDayRow, { backgroundColor: isDark ? '#25201A' : '#FEF8EA' }]}>
                <View style={styles.bestDayTitleCell}>
                  <Text style={[styles.bestDayTitle, { color: isDark ? '#F59E0B' : '#B45309' }]}>
                    BestDay
                  </Text>
                </View>
                <View style={styles.weekDaysHeader}>
                  {dailyCounts.map((day, dIdx) => {
                    const isTopDay = maxCompletedInDay > 0 && day.completedCount === maxCompletedInDay;
                    return (
                      <View key={dIdx} style={styles.bestDayCell}>
                        {isTopDay ? (
                          <Text style={styles.medalEmoji}>🎖️</Text>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
                <View style={styles.badgeCell} />
              </View>
            </View>

            {/* 4 Bottom Metric Stats: Met %, BestDay, TotalDone, BestStreak */}
            <View style={styles.fourMetricsRow}>
              <View style={styles.metricColumn}>
                <Text style={[styles.metricBigNumber, { color: '#FF5264' }]}>
                  {metPercentage}
                  <Text style={styles.metricPercentUnit}>%</Text>
                </Text>
                <Text style={[styles.metricLabel, { color: colors.secondaryText }]}>Met</Text>
              </View>

              <View style={styles.metricColumn}>
                <Text style={[styles.metricBigNumber, { color: '#38BDF8' }]}>
                  {bestDayMetric}
                </Text>
                <Text style={[styles.metricLabel, { color: colors.secondaryText }]}>BestDay</Text>
              </View>

              <View style={styles.metricColumn}>
                <Text style={[styles.metricBigNumber, { color: '#10B981' }]}>
                  {totalCompletedInWeek}
                </Text>
                <Text style={[styles.metricLabel, { color: colors.secondaryText }]}>TotalDone</Text>
              </View>

              <View style={styles.metricColumn}>
                <Text style={[styles.metricBigNumber, { color: '#F59E0B' }]}>
                  {bestStreak}
                  <Text style={styles.metricPercentUnit}>d</Text>
                </Text>
                <Text style={[styles.metricLabel, { color: colors.secondaryText }]}>BestStreak</Text>
              </View>
            </View>
          </View>
        ) : activeTab === 'Monthly' ? (
          /* Monthly Report View */
          <View
            style={[
              styles.stationeryCard,
              {
                backgroundColor: isDark ? '#1C1E28' : '#FFFFFF',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
              },
            ]}
          >
            <View style={styles.bannerRow}>
              <Text style={styles.bannerSun}>☀️</Text>
              <Text style={[styles.bannerTitle, { color: colors.accent }]}>Monthly Overview</Text>
              <Text style={styles.bannerMoon}>🌙</Text>
            </View>

            <View style={styles.fourMetricsRow}>
              <View style={styles.metricColumn}>
                <Text style={[styles.metricBigNumber, { color: '#FF5264' }]}>{metPercentage}%</Text>
                <Text style={[styles.metricLabel, { color: colors.secondaryText }]}>Avg Met</Text>
              </View>
              <View style={styles.metricColumn}>
                <Text style={[styles.metricBigNumber, { color: '#10B981' }]}>{totalCompletedInWeek * 4}</Text>
                <Text style={[styles.metricLabel, { color: colors.secondaryText }]}>Estimated Done</Text>
              </View>
              <View style={styles.metricColumn}>
                <Text style={[styles.metricBigNumber, { color: '#F59E0B' }]}>{bestStreak}d</Text>
                <Text style={[styles.metricLabel, { color: colors.secondaryText }]}>Best Streak</Text>
              </View>
            </View>

            <View style={{ marginTop: 24 }}>
              <Text style={[styles.sectionSubtitle, { color: colors.primaryText }]}>Habit Consistency</Text>
              {habits.map(habit => {
                const completedCount = habit.completedDates.length;
                return (
                  <View key={habit.id} style={styles.monthHabitRow}>
                    <Ionicons name={habit.icon as any} size={18} color={habit.color || colors.accent} />
                    <Text style={[styles.monthHabitName, { color: colors.primaryText }]}>{habit.name}</Text>
                    <Text style={[styles.monthHabitStat, { color: colors.secondaryText }]}>{completedCount} logs</Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : (
          /* Yearly Report View */
          <View
            style={[
              styles.stationeryCard,
              {
                backgroundColor: isDark ? '#1C1E28' : '#FFFFFF',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
              },
            ]}
          >
            <View style={styles.bannerRow}>
              <Text style={styles.bannerSun}>☀️</Text>
              <Text style={[styles.bannerTitle, { color: colors.accent }]}>Yearly Milestones</Text>
              <Text style={styles.bannerMoon}>⭐</Text>
            </View>

            <View style={styles.fourMetricsRow}>
              <View style={styles.metricColumn}>
                <Text style={[styles.metricBigNumber, { color: '#FF5264' }]}>{habits.length}</Text>
                <Text style={[styles.metricLabel, { color: colors.secondaryText }]}>Active Habits</Text>
              </View>
              <View style={styles.metricColumn}>
                <Text style={[styles.metricBigNumber, { color: '#38BDF8' }]}>{bestStreak}d</Text>
                <Text style={[styles.metricLabel, { color: colors.secondaryText }]}>Longest Streak</Text>
              </View>
              <View style={styles.metricColumn}>
                <Text style={[styles.metricBigNumber, { color: '#10B981' }]}>
                  {habits.reduce((acc, h) => acc + h.completedDates.length, 0)}
                </Text>
                <Text style={[styles.metricLabel, { color: colors.secondaryText }]}>All-time Done</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  tabBtn: {
    paddingVertical: 6,
    position: 'relative',
  },
  tabBtnText: {
    fontSize: 15,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: -2,
    left: 0,
    right: 0,
    height: 3,
    borderRadius: 2,
  },
  topRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  filterText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  shareCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    padding: 4,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  stationeryCard: {
    borderRadius: 24,
    paddingVertical: 20,
    paddingHorizontal: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  bannerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  bannerSun: {
    fontSize: 22,
  },
  bannerMoon: {
    fontSize: 20,
  },
  bannerTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  dateNavigator: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  arrowPill: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  yellowDateBadge: {
    backgroundColor: '#FEF08A',
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 12,
  },
  dateBadgeText: {
    color: '#854D0E',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  gridContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  habitColumnHeader: {
    width: 100,
    paddingLeft: 8,
  },
  headerLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  weekDaysHeader: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  headerDayCell: {
    width: 26,
    alignItems: 'center',
  },
  headerDayText: {
    fontSize: 12,
    fontWeight: '700',
  },
  badgeColumnHeader: {
    width: 44,
  },
  emptyGridState: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyGridText: {
    fontSize: 13,
  },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  habitNameCell: {
    width: 100,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
  },
  habitNameText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  gridSquareWrapper: {
    width: 26,
    alignItems: 'center',
  },
  pastelSquare: {
    width: 22,
    height: 22,
    borderRadius: 6,
  },
  badgeCell: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  perfectBadge: {
    backgroundColor: '#38BDF8',
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  perfectIcon: {
    fontSize: 9,
  },
  perfectText: {
    color: '#FFFFFF',
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  bestDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  bestDayTitleCell: {
    width: 100,
    paddingLeft: 8,
  },
  bestDayTitle: {
    fontSize: 12,
    fontWeight: '800',
  },
  bestDayCell: {
    width: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalEmoji: {
    fontSize: 15,
  },
  fourMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginTop: 24,
    paddingTop: 12,
  },
  metricColumn: {
    alignItems: 'center',
  },
  metricBigNumber: {
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 34,
  },
  metricPercentUnit: {
    fontSize: 16,
    fontWeight: '700',
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  sectionSubtitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  monthHabitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  monthHabitName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  monthHabitStat: {
    fontSize: 13,
  },
});
