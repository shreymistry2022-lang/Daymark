// src/screens/CalendarScreen.tsx
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

interface HeatmapTheme {
  name: string;
  key: string;
  primary: string;
  shades: [string, string, string, string]; // [empty, low, medium, high]
}

const HEATMAP_THEMES: Record<string, HeatmapTheme> = {
  tangerine: {
    name: 'Tangerine',
    key: 'tangerine',
    primary: '#FF7A00',
    shades: ['#1C1D24', '#592B00', '#B35700', '#FF7A00'],
  },
  emerald: {
    name: 'Emerald',
    key: 'emerald',
    primary: '#10B981',
    shades: ['#1C1D24', '#064E3B', '#059669', '#10B981'],
  },
  cobalt: {
    name: 'Cobalt',
    key: 'cobalt',
    primary: '#38BDF8',
    shades: ['#1C1D24', '#1E3A8A', '#2563EB', '#38BDF8'],
  },
  amethyst: {
    name: 'Amethyst',
    key: 'amethyst',
    primary: '#A78BFA',
    shades: ['#1C1D24', '#4C1D95', '#7C3AED', '#A78BFA'],
  },
  crimson: {
    name: 'Crimson',
    key: 'crimson',
    primary: '#FB7185',
    shades: ['#1C1D24', '#881337', '#E11D48', '#FB7185'],
  },
  monochrome: {
    name: 'Monochrome',
    key: 'monochrome',
    primary: '#F4F4F5',
    shades: ['#1C1D24', '#3F3F46', '#A1A1AA', '#F4F4F5'],
  },
};

export const CalendarScreen = () => {
  const insets = useSafeAreaInsets();
  const { habits, toggleHabit } = useHabits();
  const { colors, isDark } = useTheme();

  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDate());
  const [currentMonthIndex, setCurrentMonthIndex] = useState<number>(10); // Nov
  const [activeThemeKey, setActiveThemeKey] = useState<string>('tangerine');

  const activeTheme = HEATMAP_THEMES[activeThemeKey] || HEATMAP_THEMES.tangerine;

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const daysOfWeek = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  // Days in November: 30
  const daysInMonth = 30;
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const getDayString = (day: number) => {
    return `2026-${String(currentMonthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const selectedDateStr = getDayString(selectedDay);

  // Compute activity intensity for each day (0 to 3)
  const getIntensity = (day: number) => {
    const dStr = getDayString(day);
    const count = habits.filter(h => h.completedDates.includes(dStr)).length;
    if (count === 0) return 0;
    if (count <= 2) return 1;
    if (count <= 4) return 2;
    return 3;
  };

  const getIntensityColor = (intensity: number) => {
    if (intensity === 0) {
      return isDark ? '#1C1D24' : '#E2E6EE';
    }
    return activeTheme.shades[intensity] || (isDark ? '#1C1D24' : '#E2E6EE');
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>TIMELINE & HEATMAP</Text>
          <Text style={[styles.title, { color: colors.primaryText }]}>Calendar</Text>
        </View>

        {/* Month Navigation */}
        <View style={[styles.monthNav, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity
            style={styles.navArrow}
            onPress={() => setCurrentMonthIndex(prev => Math.max(0, prev - 1))}
          >
            <Ionicons name="chevron-back" size={20} color={colors.primaryText} />
          </TouchableOpacity>
          <Text style={[styles.monthName, { color: colors.primaryText }]}>{months[currentMonthIndex]} 2026</Text>
          <TouchableOpacity
            style={styles.navArrow}
            onPress={() => setCurrentMonthIndex(prev => Math.min(11, prev + 1))}
          >
            <Ionicons name="chevron-forward" size={20} color={colors.primaryText} />
          </TouchableOpacity>
        </View>

        {/* Heatmap Color Palette Selector */}
        <View style={styles.colorPaletteSection}>
          <Text style={[styles.paletteLabel, { color: colors.secondaryText }]}>HEATMAP COLOR THEME</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.paletteRow}
          >
            {Object.values(HEATMAP_THEMES).map(th => {
              const isActive = activeThemeKey === th.key;
              return (
                <TouchableOpacity
                  key={th.key}
                  style={[
                    styles.paletteChip,
                    {
                      backgroundColor: colors.card,
                      borderColor: isActive ? th.primary : colors.border,
                    },
                    isActive && { backgroundColor: `${th.primary}18` },
                  ]}
                  activeOpacity={0.7}
                  onPress={() => setActiveThemeKey(th.key)}
                >
                  <View style={[styles.paletteDot, { backgroundColor: th.primary }]}>
                    {isActive && <Ionicons name="checkmark" size={10} color="#000" />}
                  </View>
                  <Text
                    style={[
                      styles.paletteText,
                      { color: isActive ? colors.primaryText : colors.secondaryText },
                      isActive && { fontWeight: '700' },
                    ]}
                  >
                    {th.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Heatmap Grid Card */}
        <View style={[styles.heatmapCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.weekHeader}>
            {daysOfWeek.map((d, i) => (
              <Text key={i} style={[styles.weekHeaderText, { color: colors.mutedText }]}>
                {d}
              </Text>
            ))}
          </View>

          <View style={styles.daysGrid}>
            {daysArray.map(day => {
              const intensity = getIntensity(day);
              const isSelected = selectedDay === day;
              return (
                <TouchableOpacity
                  key={day}
                  style={[
                    styles.daySquare,
                    { backgroundColor: getIntensityColor(intensity) },
                    isSelected && [styles.daySquareSelected, { borderColor: activeTheme.primary }],
                  ]}
                  activeOpacity={0.7}
                  onPress={() => setSelectedDay(day)}
                >
                  <Text
                    style={[
                      styles.dayText,
                      { color: intensity === 0 ? (isDark ? colors.secondaryText : colors.primaryText) : '#FFF' },
                      intensity >= 2 && styles.dayTextBright,
                      isSelected && styles.dayTextSelected,
                    ]}
                  >
                    {day}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Heatmap Legend */}
          <View style={styles.legendRow}>
            <Text style={[styles.legendLabel, { color: colors.mutedText }]}>Less</Text>
            {activeTheme.shades.map((shade, idx) => (
              <View
                key={idx}
                style={[
                  styles.legendBox,
                  { backgroundColor: idx === 0 ? (isDark ? '#1C1D24' : '#E2E6EE') : shade },
                ]}
              />
            ))}
            <Text style={[styles.legendLabel, { color: colors.mutedText }]}>More</Text>
          </View>
        </View>

        {/* Selected Day Details */}
        <View style={[styles.detailsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.detailsHeader}>
            <Text style={[styles.detailsTitle, { color: colors.primaryText }]}>
              {months[currentMonthIndex]} {selectedDay}, 2026
            </Text>
            <View style={[styles.logPill, { backgroundColor: `${activeTheme.primary}1A` }]}>
              <Text style={[styles.logPillText, { color: activeTheme.primary }]}>
                {habits.filter(h => h.completedDates.includes(selectedDateStr)).length} of {habits.length} Done
              </Text>
            </View>
          </View>

          <View style={styles.habitList}>
            {habits.map(h => {
              const isDone = h.completedDates.includes(selectedDateStr);
              return (
                <TouchableOpacity
                  key={h.id}
                  style={[styles.detailRow, { backgroundColor: colors.secondaryBackground }]}
                  activeOpacity={0.7}
                  onPress={() => toggleHabit(h.id, selectedDateStr)}
                >
                  <View style={[styles.detailIcon, { backgroundColor: `${h.color}1F` }]}>
                    <Ionicons name={h.icon} size={18} color={h.color} />
                  </View>
                  <Text
                    style={[
                      styles.detailHabitName,
                      { color: isDone ? colors.mutedText : colors.primaryText },
                      isDone && styles.detailHabitNameDone,
                    ]}
                  >
                    {h.name}
                  </Text>
                  <Ionicons
                    name={isDone ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={isDone ? h.color : colors.mutedText}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>
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
  monthNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
  },
  navArrow: {
    padding: spacing.xs,
  },
  monthName: {
    fontSize: 16,
    fontWeight: '700',
  },
  colorPaletteSection: {
    marginBottom: spacing.md,
  },
  paletteLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  paletteRow: {
    gap: 8,
    paddingVertical: 2,
  },
  paletteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    gap: 8,
  },
  paletteDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paletteText: {
    fontSize: 12,
    fontWeight: '500',
  },
  heatmapCard: {
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    paddingHorizontal: 4,
  },
  weekHeaderText: {
    width: 38,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-start',
  },
  daySquare: {
    width: 38,
    height: 38,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  daySquareSelected: {
    borderWidth: 2,
  },
  dayText: {
    fontSize: 12,
    fontWeight: '600',
  },
  dayTextBright: {
    color: '#000',
    fontWeight: '700',
  },
  dayTextSelected: {
    color: '#FFF',
    fontWeight: '800',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: spacing.md,
    gap: 6,
  },
  legendLabel: {
    fontSize: 11,
  },
  legendBox: {
    width: 14,
    height: 14,
    borderRadius: 3,
  },
  detailsCard: {
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
  },
  detailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  detailsTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  logPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  logPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  habitList: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radii.md,
  },
  detailIcon: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  detailHabitName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  detailHabitNameDone: {
    textDecorationLine: 'line-through',
  },
});
