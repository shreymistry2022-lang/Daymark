// src/screens/InsightsScreen.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing, radii } from '../theme/tokens';
import { useHabits } from '../services/HabitContext';
import { useTheme } from '../theme/ThemeProvider';
import { useSubscription } from '../services/SubscriptionProvider';
import { canAccessFeature } from '../services/subscriptionEntitlements';
import { PaywallModal } from '../components/PaywallModal';
import { addLocalDays, calculateCompletionStats, calculateStreakStats, parseLocalDate } from '../domain/habitEngine';
import { useAchievements } from '../services/AchievementsContext';

export const InsightsScreen = () => {
  const insets = useSafeAreaInsets();
  const { habits, stats, todayDateStr } = useHabits();
  const todayReferenceDate = parseLocalDate(todayDateStr) ?? new Date();
  const { colors, isDark } = useTheme();
  const { isPro } = useSubscription();
  const { achievements } = useAchievements();

  const [timeRange, setTimeRange] = useState<'7D' | '30D' | '90D' | 'ALL'>('7D');
  const [paywallVisible, setPaywallVisible] = useState(false);

  const timeRanges: ('7D' | '30D' | '90D' | 'ALL')[] = ['7D', '30D', '90D', 'ALL'];

  const earliestDate = habits.flatMap(habit => [habit.startDate, ...habit.completedDates].filter((date): date is string => Boolean(date))).sort()[0] ?? todayDateStr;
  const allDays = Math.max(1, Math.round((new Date(`${todayDateStr}T12:00:00`).getTime() - new Date(`${earliestDate}T12:00:00`).getTime()) / 86400000) + 1);
  const getDaysForRange = (range: '7D' | '30D' | '90D' | 'ALL') => {
    switch (range) {
      case '7D': return 7;
      case '30D': return 30;
      case '90D': return 90;
      case 'ALL': return allDays;
    }
  };

  const getWindowRate = (days: number, offsetDays: number = 0) => {
    if (habits.length === 0 || days <= 0) return 0;
    const end = addLocalDays(todayDateStr, -offsetDays);
    const start = addLocalDays(end, -(days - 1));
    const period = habits.reduce((total, habit) => {
      const result = calculateCompletionStats(habit, start, end, todayReferenceDate);
      return { completed: total.completed + result.completed, scheduled: total.scheduled + result.scheduled };
    }, { completed: 0, scheduled: 0 });
    const { completed: completedCount, scheduled: scheduledCount } = period;
    return scheduledCount > 0 ? Math.round((completedCount / scheduledCount) * 100) : 0;
  };

  const rangeDays = getDaysForRange(timeRange);
  const currentCompletionRate = getWindowRate(rangeDays, 0);
  const prevCompletionRate = getWindowRate(rangeDays, rangeDays);
  const diffRate = currentCompletionRate - prevCompletionRate;

  // Real trailing 7 days completion rate
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekData = Array.from({ length: 7 }, (_, idx) => {
    const daysAgo = 6 - idx; // 6 days ago up to 0 (today)
    const dateStr = addLocalDays(todayDateStr, -daysAgo);
    const d = new Date(`${dateStr}T12:00:00`);
    const dayStats = habits.reduce((total, habit) => {
      const result = calculateCompletionStats(habit, dateStr, dateStr, todayReferenceDate);
      return { completed: total.completed + result.completed, scheduled: total.scheduled + result.scheduled };
    }, { completed: 0, scheduled: 0 });
    const rate = dayStats.scheduled > 0 ? Math.round((dayStats.completed / dayStats.scheduled) * 100) : 0;
    return {
      day: dayNames[d.getDay()],
      rate,
      active: daysAgo === 0,
      dateStr,
    };
  });

  const avgWeeklyRate = Math.round(
    weekData.reduce((acc, curr) => acc + curr.rate, 0) / (weekData.length || 1)
  );

  const rankedHabits = habits.map(habit => {
    const consistency = calculateCompletionStats(habit, addLocalDays(todayDateStr, -29), todayDateStr, todayReferenceDate).percentage;
    return { habit, consistency, stats: calculateStreakStats(habit, todayReferenceDate) };
  }).sort((a, b) => b.consistency - a.consistency || b.stats.currentStreak - a.stats.currentStreak);
  const achievementProgress = achievements.slice(0, 3);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>ANALYTICS & METRICS</Text>
          <Text style={[styles.title, { color: colors.primaryText }]}>Insights</Text>
        </View>

        {/* Time Filter Tabs */}
        <View style={[styles.tabContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {timeRanges.map(tab => {
            const isActive = timeRange === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={[
                  styles.tabButton,
                  isActive && { backgroundColor: isDark ? colors.elevatedCard : colors.secondaryBackground },
                ]}
                onPress={() => {
                  if ((tab === '90D' || tab === 'ALL') && !canAccessFeature('advanced_analytics', isPro)) setPaywallVisible(true);
                  else setTimeRange(tab);
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.tabText,
                    { color: isActive ? colors.primaryText : colors.secondaryText },
                    isActive && { fontWeight: '700' },
                  ]}
                >
                  {tab}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Top Metric Cards */}
        <View style={styles.metricGrid}>
          <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.metricHeader}>
              <Text style={[styles.metricTitle, { color: colors.secondaryText }]}>COMPLETION ({timeRange})</Text>
              <Ionicons name="trending-up" size={16} color={colors.accent} />
            </View>
            <Text style={[styles.metricMain, { color: colors.primaryText }]}>{currentCompletionRate}%</Text>
            <Text style={[styles.metricSub, { color: colors.accent }]}>
              {diffRate >= 0 ? `+${diffRate}%` : `${diffRate}%`} vs last cycle
            </Text>
          </View>

          <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.metricHeader}>
              <Text style={[styles.metricTitle, { color: colors.secondaryText }]}>LONGEST STREAK</Text>
              <Ionicons name="flame" size={16} color={colors.accent} />
            </View>
            <Text style={[styles.metricMain, { color: colors.primaryText }]}>{stats.bestStreak}d</Text>
            <Text style={[styles.metricSub, { color: colors.accent }]}>Personal record</Text>
          </View>
        </View>

        {/* Weekly Consistency Chart */}
        <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.chartHeader}>
            <Text style={[styles.chartTitle, { color: colors.primaryText }]}>Consistency Distribution</Text>
            <Text style={[styles.chartSubtitle, { color: colors.secondaryText }]}>Avg. {avgWeeklyRate}% daily completion</Text>
          </View>

          <View style={styles.chartBars}>
            {weekData.map((item, idx) => (
              <View key={idx} style={styles.barCol}>
                <View style={[styles.barTrack, { backgroundColor: colors.secondaryBackground }]}>
                  <View
                    style={[
                      styles.barFill,
                      { height: `${Math.max(10, item.rate)}%` },
                      item.active ? { backgroundColor: colors.accent } : { backgroundColor: isDark ? '#3F3F46' : '#CBD5E1' },
                    ]}
                  />
                </View>
                <Text
                  style={[
                    styles.barLabel,
                    { color: item.active ? colors.accent : colors.mutedText },
                    item.active && { fontWeight: '700' },
                  ]}
                >
                  {item.day}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Habit Ranking Leaderboard */}
        <View style={styles.leaderboardSection}>
          <Text style={[styles.sectionTitle, { color: colors.secondaryText }]}>HABIT CONSISTENCY</Text>

          {rankedHabits.length === 0 ? <Text style={[styles.chartSubtitle, { color: colors.secondaryText }]}>Create a habit and log activity to see your consistency here.</Text> : rankedHabits
            .map(({ habit: h, consistency, stats: habitStats }, i) => {
              const calculatedProgress = consistency;
              return (
                <View key={h.id} style={[styles.rankingRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.rankingLeft}>
                    <Text style={[styles.rankIndex, { color: colors.mutedText }]}>#{i + 1}</Text>
                    <View style={[styles.rankDot, { backgroundColor: h.color }]} />
                    <Text style={[styles.rankName, { color: colors.primaryText }]} numberOfLines={1}>
                      {h.name}
                    </Text>
                  </View>

                  <View style={styles.rankingRight}>
                    <View style={[styles.rankingTrack, { backgroundColor: colors.secondaryBackground }]}>
                      <View
                        style={[
                          styles.rankingFill,
                          { width: `${calculatedProgress}%`, backgroundColor: h.color },
                        ]}
                      />
                    </View>
                    <Text style={[styles.rankStreak, { color: colors.accent }]}>{habitStats.currentStreak}d · {consistency}%</Text>
                  </View>
                </View>
              );
            })}
        </View>

        {/* Achievement Showcase */}
        <View style={[styles.achievementCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.achievementTitle, { color: colors.primaryText }]}>Milestones Unlocked</Text>
          <View style={styles.badgeRow}>
            {achievementProgress.map(item => <View key={item.key} style={styles.badgeItem}>
              <View style={[styles.badgeIcon, { backgroundColor: item.unlocked ? `${colors.accent}1F` : colors.secondaryBackground }]}>
                <Ionicons name={item.unlocked ? 'ribbon' : 'lock-closed-outline'} size={24} color={item.unlocked ? colors.accent : colors.mutedText} />
              </View>
              <Text style={[styles.badgeName, { color: colors.primaryText }]}>{item.title} {item.progress}/{item.target}</Text>
            </View>)}
          </View>
        </View>
      </ScrollView>
      <PaywallModal visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
  },
  header: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 2,
  },
  tabContainer: {
    flexDirection: 'row',
    borderRadius: radii.md,
    padding: 4,
    marginBottom: spacing.lg,
    borderWidth: 1,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: radii.sm,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  metricGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: spacing.lg,
  },
  metricCard: {
    flex: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
  },
  metricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  metricTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  metricMain: {
    fontSize: 28,
    fontWeight: '800',
  },
  metricSub: {
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  chartCard: {
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  chartHeader: {
    marginBottom: spacing.lg,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  chartSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  chartBars: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 140,
    paddingTop: 10,
  },
  barCol: {
    alignItems: 'center',
    flex: 1,
  },
  barTrack: {
    width: 14,
    height: 100,
    borderRadius: radii.full,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: radii.full,
  },
  barLabel: {
    fontSize: 11,
    marginTop: 8,
    fontWeight: '600',
  },
  leaderboardSection: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: spacing.md,
  },
  rankingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radii.md,
    marginBottom: 8,
    borderWidth: 1,
  },
  rankingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  rankIndex: {
    fontSize: 13,
    fontWeight: '700',
    width: 26,
  },
  rankDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  rankName: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  rankingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: 110,
  },
  rankingTrack: {
    flex: 1,
    height: 6,
    borderRadius: radii.full,
    overflow: 'hidden',
  },
  rankingFill: {
    height: '100%',
    borderRadius: radii.full,
  },
  rankStreak: {
    fontSize: 12,
    fontWeight: '700',
    width: 28,
    textAlign: 'right',
  },
  achievementCard: {
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
  },
  achievementTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  badgeItem: {
    alignItems: 'center',
  },
  badgeIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  badgeName: {
    fontSize: 12,
    fontWeight: '600',
  },
});
