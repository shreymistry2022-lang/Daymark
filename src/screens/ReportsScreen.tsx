import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing, radii } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { PerformanceReport, ReportPeriod } from '../domain/reportEngine';
import { useReports } from '../services/ReportsContext';
import { MinimalModalHeader } from '../components/MinimalModalHeader';

interface Props {
  onClose?: () => void;
}

export const ReportsScreen = ({ onClose }: Props) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { reports, isLoading, error } = useReports();
  const [periodType, setPeriodType] = useState<ReportPeriod>('week');
  const items = useMemo(() => reports.filter(report => report.periodType === periodType), [reports, periodType]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <MinimalModalHeader
        title="Reports"
        colors={colors}
        onClose={onClose}
        closeIcon="chevron-back"
        closeAccessibilityLabel="Close reports"
        showHandle
      />

      <View style={[styles.selector, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {(['week', 'month'] as const).map(type => {
          const active = type === periodType;
          return (
            <TouchableOpacity
              key={type}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setPeriodType(type)}
              style={[styles.selectButton, active && { backgroundColor: colors.accent }]}
            >
              <Text style={{ color: active ? '#FFF' : colors.secondaryText, fontSize: 13, fontWeight: '700' }}>
                {type === 'week' ? 'Weekly' : 'Monthly'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 28 }]}>
        {error && (
          <View style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="cloud-offline-outline" size={18} color={colors.accent} />
            <Text style={[styles.noticeText, { color: colors.secondaryText }]}>{error}</Text>
          </View>
        )}

        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.accent} />
            <Text style={[styles.muted, { color: colors.secondaryText }]}>Loading reports…</Text>
          </View>
        ) : items.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.emptyBadge, { backgroundColor: `${colors.accent}1A` }]}>
              <Ionicons name="document-text-outline" size={26} color={colors.accent} />
            </View>
            <Text style={[styles.heading, { color: colors.primaryText }]}>Reports will appear here</Text>
            <Text style={[styles.muted, { color: colors.secondaryText, textAlign: 'center' }]}>
              Start recording scheduled habit activity to build your history.
            </Text>
          </View>
        ) : (
          items.map(report => <ReportCard key={report.id} report={report} colors={colors} />)
        )}
      </ScrollView>
    </View>
  );
};

const ReportCard = ({ report, colors }: { report: PerformanceReport; colors: any }) => (
  <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
    <View style={styles.cardHead}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.period, { color: colors.primaryText }]}>
          {report.periodType === 'week' ? 'WEEK' : 'MONTH'} · {report.periodStart}
          {report.periodEnd !== report.periodStart ? ` — ${report.periodEnd}` : ''}
        </Text>
        <Text style={[styles.muted, { color: colors.secondaryText }]}>
          {report.totalCompleted} of {report.totalScheduled} scheduled habits completed
        </Text>
      </View>
      <View style={styles.rateBox}>
        <Text style={[styles.rate, { color: colors.accent }]}>{report.percentage}%</Text>
        <Text style={[styles.tiny, { color: colors.mutedText }]}>COMPLETE</Text>
      </View>
    </View>

    <View style={[styles.progressTrack, { backgroundColor: colors.secondaryBackground }]}>
      <View style={[styles.progressFill, { width: `${report.percentage}%`, backgroundColor: colors.accent }]} />
    </View>

    <View style={styles.metrics}>
      <Metric
        label="VS PREVIOUS"
        value={
          report.improvementPercentage == null
            ? '—'
            : `${report.improvementPercentage >= 0 ? '+' : ''}${report.improvementPercentage}%`
        }
        colors={colors}
      />
      <Metric
        label={report.periodType === 'week' ? 'BEST DAY' : 'TOTAL CHECK-INS'}
        value={
          report.periodType === 'week'
            ? report.bestDay
              ? `${report.bestDay.date.slice(5)} · ${report.bestDay.percentage}%`
              : '—'
            : String(report.totalCompleted)
        }
        colors={colors}
      />
    </View>

    <View style={styles.highlights}>
      <Highlight label="Strongest habit" item={report.strongestHabit} colors={colors} />
      <Highlight label="Needs attention" item={report.weakestHabit} colors={colors} />
    </View>

    {report.periodType === 'month' && report.trend.length > 0 && (
      <View style={styles.trend}>
        {report.trend.map((value, index) => (
          <View key={index} style={styles.trendColumn}>
            <View style={[styles.trendTrack, { backgroundColor: colors.secondaryBackground }]}>
              <View style={[styles.trendFill, { height: `${Math.max(4, value)}%`, backgroundColor: colors.accent }]} />
            </View>
            <Text style={[styles.tiny, { color: colors.mutedText }]}>{value}%</Text>
          </View>
        ))}
      </View>
    )}

    {!!report.habits.length && (
      <View style={[styles.habitTable, { borderTopColor: colors.border }]}>
        <Text style={[styles.tableHead, { color: colors.mutedText }]}>HABIT COMPARISON</Text>
        {report.habits.slice(0, 8).map(habit => (
          <View key={habit.habitId} style={styles.habitRow}>
            <Text numberOfLines={1} style={[styles.habitName, { color: colors.primaryText }]}>
              {habit.name}
            </Text>
            <Text style={[styles.habitStat, { color: colors.secondaryText }]}>
              {habit.completed}/{habit.scheduled}
            </Text>
            <Text style={[styles.habitStat, { color: colors.accent, width: 42, textAlign: 'right' }]}>
              {habit.percentage}%
            </Text>
          </View>
        ))}
      </View>
    )}
  </View>
);

const Metric = ({ label, value, colors }: { label: string; value: string; colors: any }) => (
  <View style={{ flex: 1 }}>
    <Text style={[styles.tiny, { color: colors.mutedText }]}>{label}</Text>
    <Text numberOfLines={1} style={[styles.metricValue, { color: colors.primaryText }]}>
      {value}
    </Text>
  </View>
);

const Highlight = ({
  label,
  item,
  colors,
}: {
  label: string;
  item: PerformanceReport['strongestHabit'];
  colors: any;
}) => (
  <View style={{ flex: 1 }}>
    <Text style={[styles.tiny, { color: colors.mutedText }]}>{label}</Text>
    <Text numberOfLines={1} style={[styles.highlightName, { color: colors.primaryText }]}>
      {item?.name ?? '—'}
    </Text>
    <Text style={[styles.tiny, { color: colors.accent }]}>
      {item ? `${item.percentage}% · ${item.completed}/${item.scheduled}` : 'No scheduled data'}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  screen: { flex: 1 },
  selector: {
    marginHorizontal: spacing.lg,
    borderWidth: 1,
    borderRadius: radii.full,
    padding: 4,
    flexDirection: 'row',
  },
  selectButton: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radii.full },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md },
  notice: { borderWidth: 1, borderRadius: radii.lg, padding: spacing.md, flexDirection: 'row', gap: 8 },
  noticeText: { flex: 1, fontSize: 12 },
  loading: { alignItems: 'center', padding: 40 },
  muted: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  empty: { alignItems: 'center', padding: spacing.xl, borderWidth: 1, borderRadius: radii.xl },
  emptyBadge: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 17, fontWeight: '800', marginTop: spacing.md },
  card: { borderWidth: 1, borderRadius: radii.xl, padding: spacing.lg },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  period: { fontSize: 13, fontWeight: '700' },
  rateBox: { alignItems: 'flex-end' },
  rate: { fontSize: 22, fontWeight: '800' },
  tiny: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  progressTrack: { height: 6, borderRadius: radii.full, overflow: 'hidden', marginTop: spacing.md },
  progressFill: { height: '100%', borderRadius: radii.full },
  metrics: { flexDirection: 'row', marginTop: spacing.md },
  metricValue: { fontSize: 14, fontWeight: '700', marginTop: 4 },
  highlights: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  highlightName: { fontSize: 13, fontWeight: '700', marginVertical: 3 },
  trend: { height: 64, flexDirection: 'row', gap: 5, marginTop: spacing.md },
  trendColumn: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', gap: 4 },
  trendTrack: { width: '100%', flex: 1, borderRadius: 4, justifyContent: 'flex-end', overflow: 'hidden' },
  trendFill: { width: '100%', minHeight: 3 },
  habitTable: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: spacing.md, paddingTop: spacing.sm },
  tableHead: { fontSize: 10, letterSpacing: 0.8, fontWeight: '700', marginBottom: 4 },
  habitRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: 8 },
  habitName: { flex: 1, fontSize: 12 },
  habitStat: { width: 42, textAlign: 'right', fontSize: 12, fontWeight: '700' },
});
