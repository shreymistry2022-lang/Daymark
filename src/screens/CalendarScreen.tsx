// src/screens/CalendarScreen.tsx
import React, { useMemo, useState } from 'react';
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
import { addLocalDays, getHabitDayStatus, isScheduledOnDate, isTrackableOnDate, parseLocalDate } from '../domain/habitEngine';
import { calculateCalendarDayActivity } from '../domain/calendarEngine';
import { HabitTrackingControl } from '../components/HabitTrackingControl';
import { usePreferences } from '../services/PreferencesContext';
import { getWeekDates } from '../domain/preferencesEngine';

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
  const { habits, toggleHabit, recordHabitLog, todayDateStr } = useHabits();
  const { colors, isDark } = useTheme();
  const { isPro } = useSubscription();
  const { preferences } = usePreferences();

  const today = parseLocalDate(todayDateStr) ?? new Date();
  const [currentYear, setCurrentYear] = useState<number>(today.getFullYear());
  const [currentMonthIndex, setCurrentMonthIndex] = useState<number>(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<number>(today.getDate());
  const [activeThemeKey, setActiveThemeKey] = useState<string>('tangerine');
  const [showYearOverview, setShowYearOverview] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showWeekView, setShowWeekView] = useState(false);

  const activeTheme = HEATMAP_THEMES[activeThemeKey] || HEATMAP_THEMES.tangerine;

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const weekdays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const daysOfWeek = [...weekdays.slice(preferences.weekStart), ...weekdays.slice(0, preferences.weekStart)];

  // Days in selected month
  const daysInMonth = new Date(currentYear, currentMonthIndex + 1, 0).getDate();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const yearDays = Array.from({ length: new Date(currentYear, 2, 0).getDate() === 29 ? 366 : 365 }, (_, index) => {
    const date = new Date(currentYear, 0, index + 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
  const yearStartOffset = (new Date(currentYear, 0, 1).getDay() - preferences.weekStart + 7) % 7;
  const paddedYearDays: (string | null)[] = [...Array(yearStartOffset).fill(null), ...yearDays];
  while (paddedYearDays.length % 7 !== 0) paddedYearDays.push(null);
  const yearWeeks = Array.from({ length: paddedYearDays.length / 7 }, (_, index) => paddedYearDays.slice(index * 7, index * 7 + 7));
  const firstDayOfWeek = (new Date(currentYear, currentMonthIndex, 1).getDay() - preferences.weekStart + 7) % 7;

  const safeSelectedDay = Math.min(selectedDay, daysInMonth);

  const getDayString = (day: number) => {
    return `${currentYear}-${String(currentMonthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const selectedDateStr = getDayString(safeSelectedDay);
  const selectedWeek = useMemo(() => getWeekDates(selectedDateStr, preferences.weekStart), [selectedDateStr, preferences.weekStart]);
  const goToDate = (date: string) => {
    const parsed = parseLocalDate(date);
    if (!parsed) return;
    setCurrentYear(parsed.getFullYear());
    setCurrentMonthIndex(parsed.getMonth());
    setSelectedDay(parsed.getDate());
  };

  const handlePrevMonth = () => {
    if (currentMonthIndex === 0) {
      setCurrentMonthIndex(11);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonthIndex(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonthIndex === 11) {
      setCurrentMonthIndex(0);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonthIndex(prev => prev + 1);
    }
  };

  const handleJumpToToday = () => {
    goToDate(todayDateStr);
  };

  const categories = useMemo(() => [...new Set(habits.map(habit => habit.category))].sort(), [habits]);
  const visibleHabits = habits.filter(habit => (!selectedHabitId || habit.id === selectedHabitId) && (!selectedCategory || habit.category === selectedCategory));
  const getDayActivity = (date: string) => calculateCalendarDayActivity(visibleHabits, date, today);

  const getIntensity = (day: number) => {
    return getDayActivity(getDayString(day)).intensity;
  };

  const getIntensityColor = (intensity: number) => {
    if (intensity === 0) {
      return isDark ? '#1C1D24' : '#E2E6EE';
    }
    const filteredHabit = selectedHabitId ? habits.find(habit => habit.id === selectedHabitId) : null;
    if (filteredHabit) return [`${filteredHabit.color}1A`, `${filteredHabit.color}66`, filteredHabit.color][Math.min(2, intensity - 1)];
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

        <TouchableOpacity
          style={[styles.yearToggle, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => {
            if (!canAccessFeature('yearly_heatmap', isPro)) setPaywallVisible(true);
            else setShowYearOverview(value => !value);
          }}
          activeOpacity={0.75}
        >
          <Ionicons name="grid-outline" size={18} color={colors.accent} />
          <Text style={[styles.yearToggleText, { color: colors.primaryText }]}>{showYearOverview ? 'Hide' : 'View'} {currentYear} Pro overview</Text>
          {!isPro ? <Ionicons name="lock-closed" size={15} color={colors.secondaryText} /> : null}
        </TouchableOpacity>

        {showYearOverview ? (
          <View style={[styles.yearCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.yearHeader}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Show year ${currentYear - 1}`} onPress={() => setCurrentYear(year => year - 1)} style={styles.navArrow}><Ionicons name="chevron-back" size={20} color={colors.primaryText} /></TouchableOpacity>
              <Text style={[styles.yearTitle, { color: colors.primaryText }]}>{currentYear} activity</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Show year ${currentYear + 1}`} accessibilityState={{ disabled: currentYear >= today.getFullYear() }} disabled={currentYear >= today.getFullYear()} onPress={() => setCurrentYear(year => year + 1)} style={[styles.navArrow, currentYear >= today.getFullYear() && { opacity: 0.35 }]}><Ionicons name="chevron-forward" size={20} color={colors.primaryText} /></TouchableOpacity>
            </View>
            <Text style={[styles.yearCaption, { color: colors.secondaryText }]}>Every day of the year, based on completed habits.</Text>
            <View style={styles.yearMonthLabels}>{months.map(month => <Text key={month} style={[styles.yearMonthLabel, { color: colors.mutedText }]}>{month}</Text>)}</View>
            <View style={styles.yearGridRow}>
              <View style={styles.yearWeekdayLabels}>{daysOfWeek.map((day, index) => <Text key={`${day}-${index}`} style={[styles.yearWeekdayLabel, { color: colors.mutedText }]}>{day}</Text>)}</View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.yearGrid}>
                {yearWeeks.map((week, weekIndex) => (
                  <View key={weekIndex} style={styles.yearWeek}>
                    {week.map((date, dayIndex) => {
                      const activity = date ? getDayActivity(date) : null;
                      const color = activity?.lapses ? '#F43F5E' : getIntensityColor(activity?.intensity ?? 0);
                      return date ? <TouchableOpacity key={`${weekIndex}-${dayIndex}`} accessibilityRole="button" accessibilityLabel={`${date}, ${activity?.completed ?? 0} completed, ${activity?.lapses ?? 0} lapses`} onPress={() => { const [year, month, day] = date.split('-').map(Number); setCurrentYear(year); setCurrentMonthIndex(month - 1); setSelectedDay(day); setShowYearOverview(false); }} style={[styles.yearSquare, { backgroundColor: color }]} /> : <View key={`${weekIndex}-${dayIndex}`} style={[styles.yearSquare, { backgroundColor: 'transparent' }]} />;
                    })}
                  </View>
                ))}
              </ScrollView>
            </View>
          </View>
        ) : null}

        <View style={[styles.viewToggle, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: !showWeekView }} onPress={() => setShowWeekView(false)} style={[styles.viewToggleButton, !showWeekView && { backgroundColor: colors.accent }]}><Text style={[styles.viewToggleText, { color: !showWeekView ? '#000' : colors.secondaryText }]}>Month</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: showWeekView }} onPress={() => setShowWeekView(true)} style={[styles.viewToggleButton, showWeekView && { backgroundColor: colors.accent }]}><Text style={[styles.viewToggleText, { color: showWeekView ? '#000' : colors.secondaryText }]}>Week</Text></TouchableOpacity>
        </View>

        {showWeekView ? <View style={[styles.weekCalendar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.weekCalendarHeader}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Previous week" onPress={() => goToDate(addLocalDays(selectedDateStr, -7))} style={styles.navArrow}><Ionicons name="chevron-back" size={20} color={colors.primaryText} /></TouchableOpacity>
            <Text style={[styles.monthName, { color: colors.primaryText }]}>{selectedWeek[0]} – {selectedWeek[6]}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Next week" accessibilityState={{ disabled: selectedWeek[6] >= todayDateStr }} disabled={selectedWeek[6] >= todayDateStr} onPress={() => goToDate(addLocalDays(selectedDateStr, 7))} style={[styles.navArrow, selectedWeek[6] >= todayDateStr && { opacity: 0.35 }]}><Ionicons name="chevron-forward" size={20} color={colors.primaryText} /></TouchableOpacity>
          </View>
          {selectedWeek.map(date => {
            const activity = getDayActivity(date);
            const weekday = new Intl.DateTimeFormat('en', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
            const day = parseLocalDate(date)!.getDate();
            return <TouchableOpacity key={date} accessibilityRole="button" accessibilityLabel={`${weekday} ${date}: ${activity.completed} of ${activity.eligible.length} completed${activity.lapses ? `, ${activity.lapses} lapses` : ''}`} accessibilityState={{ selected: date === selectedDateStr, disabled: date > todayDateStr }} disabled={date > todayDateStr} onPress={() => goToDate(date)} style={[styles.weekCalendarDay, { borderBottomColor: colors.border, backgroundColor: date === selectedDateStr ? `${colors.accent}18` : 'transparent' }]}>
              <View style={{ flex: 1 }}><Text style={[styles.weekCalendarDate, { color: colors.primaryText }]}>{weekday} · {months[parseLocalDate(date)!.getMonth()]} {day}</Text><Text style={[styles.weekCalendarStatus, { color: colors.secondaryText }]}>{activity.completed} of {activity.eligible.length} completed · {activity.lapses} lapses</Text></View>
              <View style={[styles.weekCalendarMeter, { backgroundColor: colors.secondaryBackground }]}><View style={{ width: `${activity.eligible.length ? Math.round(activity.completed / activity.eligible.length * 100) : 0}%`, height: '100%', backgroundColor: activity.lapses ? colors.error : colors.accent }} /></View>
            </TouchableOpacity>;
          })}
        </View> : null}

        {/* Month Navigation */}
        {!showWeekView ? <View style={[styles.monthNav, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity
            style={styles.navArrow}
            onPress={handlePrevMonth}
          >
            <Ionicons name="chevron-back" size={20} color={colors.primaryText} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleJumpToToday} activeOpacity={0.7}>
            <Text style={[styles.monthName, { color: colors.primaryText }]}>
              {months[currentMonthIndex]} {currentYear}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.navArrow}
            onPress={handleNextMonth}
          >
            <Ionicons name="chevron-forward" size={20} color={colors.primaryText} />
          </TouchableOpacity>
        </View> : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.paletteRow}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Filter calendar to all categories" accessibilityState={{ selected: selectedCategory === null }} style={[styles.paletteChip, { borderColor: selectedCategory === null ? colors.accent : colors.border, backgroundColor: colors.card }]} onPress={() => { setSelectedCategory(null); setSelectedHabitId(null); }}><Text style={{ color: colors.primaryText }}>All categories</Text></TouchableOpacity>
          {categories.map(category => <TouchableOpacity key={category} accessibilityRole="button" accessibilityLabel={`Filter calendar to ${category} category`} accessibilityState={{ selected: selectedCategory === category }} style={[styles.paletteChip, { borderColor: selectedCategory === category ? colors.accent : colors.border, backgroundColor: colors.card }]} onPress={() => { setSelectedCategory(selectedCategory === category ? null : category); setSelectedHabitId(null); }}><Text style={{ color: colors.primaryText }}>{category}</Text></TouchableOpacity>)}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.paletteRow}>
          <TouchableOpacity style={[styles.paletteChip, { borderColor: !selectedHabitId ? colors.accent : colors.border, backgroundColor: colors.card }]} onPress={() => setSelectedHabitId(null)}><Text style={{ color: colors.primaryText }}>All habits</Text></TouchableOpacity>
          {habits.map(habit => <TouchableOpacity key={habit.id} accessibilityRole="button" accessibilityLabel={`Filter calendar to ${habit.name}`} style={[styles.paletteChip, { borderColor: selectedHabitId === habit.id ? habit.color : colors.border, backgroundColor: colors.card }]} onPress={() => setSelectedHabitId(selectedHabitId === habit.id ? null : habit.id)}><View style={[styles.paletteDot, { backgroundColor: habit.color }]} /><Text numberOfLines={1} style={[styles.paletteText, { color: colors.primaryText }]}>{habit.name}</Text></TouchableOpacity>)}
        </ScrollView>

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
                  onPress={() => {
                    if (th.key !== 'tangerine' && !canAccessFeature('premium_themes', isPro)) setPaywallVisible(true);
                    else setActiveThemeKey(th.key);
                  }}
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
        {!showWeekView ? <View style={[styles.heatmapCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.weekHeader}>
            {daysOfWeek.map((d, i) => (
              <Text key={i} style={[styles.weekHeaderText, { color: colors.mutedText }]}>
                {d}
              </Text>
            ))}
          </View>

          <View style={styles.daysGrid}>
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <View key={`empty-${i}`} style={styles.daySquareEmpty} />
            ))}
            {daysArray.map(day => {
              const intensity = getIntensity(day);
              const activity = getDayActivity(getDayString(day));
              const isSelected = safeSelectedDay === day;
              return (
                <TouchableOpacity
                  key={day}
                  style={[
                    styles.daySquare,
                    { backgroundColor: activity.lapses ? '#F43F5E' : getIntensityColor(intensity) },
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
        </View> : null}

        {/* Selected Day Details */}
        <View style={[styles.detailsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.detailsHeader}>
            <Text style={[styles.detailsTitle, { color: colors.primaryText }]}>
              {months[currentMonthIndex]} {safeSelectedDay}, {currentYear}
            </Text>
            <View style={[styles.logPill, { backgroundColor: `${activeTheme.primary}1A` }]}>
              <Text style={[styles.logPillText, { color: activeTheme.primary }]}>
              {getDayActivity(selectedDateStr).completed} of {getDayActivity(selectedDateStr).eligible.length} Done
              </Text>
            </View>
          </View>

          <View style={styles.habitList}>
            {visibleHabits.map(h => {
              const status = getHabitDayStatus(h, selectedDateStr, today);
              const isDone = status === 'completed';
              return (
                <View
                  key={h.id}
                  style={[styles.detailRow, { backgroundColor: colors.secondaryBackground }]}
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
                  <Text style={[styles.detailHabitName, { color: isDone ? h.color : colors.secondaryText, textAlign: 'right' }]}>{status === 'completed' ? 'Done' : status === 'missed' ? 'Missed' : status === 'lapse' ? 'Lapse' : status === 'paused' ? 'Paused' : status === 'unscheduled' ? 'Unscheduled' : status === 'future' ? 'Future' : status === 'ended' ? 'Ended' : status === 'not_started' ? 'Not started' : 'Pending'}</Text>
                  {isTrackableOnDate(h, selectedDateStr, today) ? h.habitKind === 'quit' || h.trackingMethod === 'count' || h.trackingMethod === 'measurable' ? <HabitTrackingControl key={`${h.id}-${selectedDateStr}-${h.logs?.find(log => log.date === selectedDateStr)?.value ?? 0}-${status}`} habit={h} date={selectedDateStr} onSave={recordHabitLog} /> : <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${isDone ? 'Undo' : 'Complete'} ${h.name} for ${selectedDateStr}`} onPress={() => toggleHabit(h.id, selectedDateStr)}><Ionicons name={isDone ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={isDone ? h.color : colors.mutedText} /></TouchableOpacity> : null}
                </View>
              );
            })}
            {visibleHabits.filter(h => isScheduledOnDate(h, selectedDateStr)).length === 0 && <Text style={[styles.detailHabitName, { color: colors.secondaryText }]}>No habits were scheduled for this date.</Text>}
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
  yearToggle: {
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  yearToggleText: { flex: 1, fontSize: 13, fontWeight: '700' },
  yearHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  yearMonthLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, marginTop: 10, marginBottom: 5 },
  yearMonthLabel: { fontSize: 9, fontWeight: '700' },
  yearGridRow: { flexDirection: 'row', gap: 4 },
  yearWeekdayLabels: { width: 12, gap: 3, paddingTop: 0 },
  yearWeekdayLabel: { width: 9, height: 9, fontSize: 7, lineHeight: 9, textAlign: 'center' },
  viewToggle: { flexDirection: 'row', borderWidth: 1, borderRadius: radii.md, padding: 3, marginBottom: spacing.md },
  viewToggleButton: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm },
  viewToggleText: { fontSize: 13, fontWeight: '700' },
  weekCalendar: { borderWidth: 1, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.md },
  weekCalendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  weekCalendarDay: { minHeight: 58, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, gap: spacing.sm },
  weekCalendarDate: { fontSize: 13, fontWeight: '700' },
  weekCalendarStatus: { fontSize: 11, marginTop: 3 },
  weekCalendarMeter: { width: 56, height: 5, borderRadius: radii.full, overflow: 'hidden' },
  yearCard: { borderRadius: radii.lg, borderWidth: 1, padding: spacing.md, marginBottom: spacing.lg },
  yearTitle: { fontSize: 16, fontWeight: '800' },
  yearCaption: { fontSize: 12, marginTop: 3, marginBottom: spacing.md },
  yearGrid: { gap: 3 },
  yearWeek: { gap: 3 },
  yearSquare: { width: 9, height: 9, borderRadius: 2 },
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
  daySquareEmpty: {
    width: 38,
    height: 38,
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
