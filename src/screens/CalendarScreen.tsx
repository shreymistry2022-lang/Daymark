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
import { useNavigation } from '@react-navigation/native';
import { spacing, radii } from '../theme/tokens';
import { useHabits } from '../services/HabitContext';
import { useTheme } from '../theme/ThemeProvider';
import { useSubscription } from '../services/SubscriptionProvider';
import { canAccessFeature } from '../services/subscriptionEntitlements';
import { PaywallModal } from '../components/PaywallModal';
import { HabitDotGrid } from '../components/HabitDotGrid';
import { HabitTrackingControl } from '../components/HabitTrackingControl';
import { MonthYearPickerModal } from '../components/MonthYearPickerModal';
import { AnimatedMonthContainer, AnimatedPopTouchable, triggerLayoutEase } from '../components/AnimatedMonthGrid';
import {
  addLocalDays,
  calculateCompletionStats,
  calculateStreakStats,
  canLogHabitOnDate,
  getHabitDayStatus,
  isScheduledOnDate,
  parseLocalDate,
} from '../domain/habitEngine';
import { calculateCalendarDayActivity } from '../domain/calendarEngine';
import { usePreferences } from '../services/PreferencesContext';
import { getWeekDates } from '../domain/preferencesEngine';

interface HeatmapTheme {
  name: string;
  key: string;
  primary: string;
  shades: [string, string, string, string];
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
  const navigation = useNavigation<any>();
  const { habits, toggleHabit, recordHabitLog, todayDateStr } = useHabits();
  const { colors, isDark } = useTheme();
  const { isPro } = useSubscription();
  const { preferences } = usePreferences();

  const today = useMemo(() => parseLocalDate(todayDateStr) ?? new Date(), [todayDateStr]);
  const [currentYear, setCurrentYear] = useState<number>(today.getFullYear());
  const [currentMonthIndex, setCurrentMonthIndex] = useState<number>(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<number>(today.getDate());
  const [activeThemeKey, setActiveThemeKey] = useState<string>('tangerine');
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showYearOverview, setShowYearOverview] = useState(false);
  const [monthPickerVisible, setMonthPickerVisible] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showWeekView, setShowWeekView] = useState(false);

  const activeTheme = HEATMAP_THEMES[activeThemeKey] || HEATMAP_THEMES.tangerine;

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const weekdays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const daysOfWeek = [...weekdays.slice(preferences.weekStart), ...weekdays.slice(0, preferences.weekStart)];

  const daysInMonth = new Date(currentYear, currentMonthIndex + 1, 0).getDate();
  const firstDayOfWeek = (new Date(currentYear, currentMonthIndex, 1).getDay() - preferences.weekStart + 7) % 7;

  const monthRows = useMemo(() => {
    const cells: (number | null)[] = Array(firstDayOfWeek).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      rows.push(cells.slice(i, i + 7));
    }
    return rows;
  }, [firstDayOfWeek, daysInMonth]);

  const yearDays = Array.from({ length: new Date(currentYear, 2, 0).getDate() === 29 ? 366 : 365 }, (_, index) => {
    const date = new Date(currentYear, 0, index + 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
  const yearStartOffset = (new Date(currentYear, 0, 1).getDay() - preferences.weekStart + 7) % 7;
  const paddedYearDays: (string | null)[] = [...Array(yearStartOffset).fill(null), ...yearDays];
  while (paddedYearDays.length % 7 !== 0) paddedYearDays.push(null);
  const yearWeeks = Array.from({ length: paddedYearDays.length / 7 }, (_, index) => paddedYearDays.slice(index * 7, index * 7 + 7));

  const safeSelectedDay = Math.min(selectedDay, daysInMonth);
  const getDayString = (day: number) =>
    `${currentYear}-${String(currentMonthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const selectedDateStr = getDayString(safeSelectedDay);
  const selectedWeek = useMemo(() => getWeekDates(selectedDateStr, preferences.weekStart), [selectedDateStr, preferences.weekStart]);

  const goToDate = (date: string) => {
    const parsed = parseLocalDate(date);
    if (!parsed) return;
    setCurrentYear(parsed.getFullYear());
    setCurrentMonthIndex(parsed.getMonth());
    setSelectedDay(parsed.getDate());
  };

  const handleShiftMonth = (delta: number) => {
    const next = new Date(currentYear, currentMonthIndex + delta, 1);
    setCurrentYear(next.getFullYear());
    setCurrentMonthIndex(next.getMonth());
  };

  const handlePrevMonth = () => handleShiftMonth(-1);

  const handleNextMonth = () => handleShiftMonth(1);

  const handleJumpToToday = () => {
    goToDate(todayDateStr);
  };

  const categories = useMemo(() => [...new Set(habits.map(habit => habit.category))].sort(), [habits]);
  const visibleHabits = habits.filter(
    habit => (!selectedHabitId || habit.id === selectedHabitId) && (!selectedCategory || habit.category === selectedCategory),
  );
  const getDayActivity = (date: string) => calculateCalendarDayActivity(visibleHabits, date, today);

  const getIntensity = (day: number) => getDayActivity(getDayString(day)).intensity;

  const getIntensityColor = (intensity: number) => {
    if (intensity === 0) {
      return isDark ? colors.secondaryBackground : '#E8ECF4';
    }
    const filteredHabit = selectedHabitId ? habits.find(habit => habit.id === selectedHabitId) : null;
    if (filteredHabit) {
      return [`${filteredHabit.color}24`, `${filteredHabit.color}70`, filteredHabit.color][Math.min(2, intensity - 1)];
    }
    return activeTheme.shades[intensity] || (isDark ? colors.secondaryBackground : '#E8ECF4');
  };

  const selectedFilterColor = selectedHabitId
    ? habits.find(h => h.id === selectedHabitId)?.color ?? activeTheme.primary
    : activeTheme.primary;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 110 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Minimalist Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.primaryText }]}>Calendar</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Choose heatmap color theme"
              onPress={() => {
                triggerLayoutEase();
                setShowThemePicker(v => !v);
              }}
              style={[
                styles.circleBtn,
                {
                  backgroundColor: showThemePicker ? `${activeTheme.primary}20` : colors.secondaryBackground,
                  borderColor: showThemePicker ? activeTheme.primary : colors.border,
                },
              ]}
            >
              <Ionicons name="color-palette-outline" size={18} color={showThemePicker ? activeTheme.primary : colors.primaryText} />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`Toggle ${currentYear} yearly heatmap`}
              onPress={() => {
                if (!canAccessFeature('yearly_heatmap', isPro)) setPaywallVisible(true);
                else {
                  triggerLayoutEase();
                  setShowYearOverview(value => !value);
                }
              }}
              style={[
                styles.yearPillBtn,
                {
                  backgroundColor: showYearOverview ? `${colors.accent}20` : colors.secondaryBackground,
                  borderColor: showYearOverview ? colors.accent : colors.border,
                },
              ]}
            >
              <Ionicons name="grid-outline" size={15} color={showYearOverview ? colors.accent : colors.primaryText} />
              <Text style={[styles.yearPillText, { color: showYearOverview ? colors.accent : colors.primaryText }]}>
                {currentYear}
              </Text>
              {!isPro ? <Ionicons name="lock-closed" size={12} color={colors.mutedText} /> : null}
            </TouchableOpacity>
          </View>
        </View>

        {/* Collapsible Heatmap Palette Selector */}
        {showThemePicker && (
          <View style={[styles.paletteCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionEyebrow, { color: colors.mutedText }]}>HEATMAP COLOR</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {Object.values(HEATMAP_THEMES).map(th => {
                const isActive = activeThemeKey === th.key;
                return (
                  <TouchableOpacity
                    key={th.key}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: isActive ? `${th.primary}20` : colors.secondaryBackground,
                        borderColor: isActive ? th.primary : colors.border,
                      },
                    ]}
                    activeOpacity={0.75}
                    onPress={() => {
                      if (th.key !== 'tangerine' && !canAccessFeature('premium_themes', isPro)) setPaywallVisible(true);
                      else setActiveThemeKey(th.key);
                    }}
                  >
                    <View style={[styles.themeDot, { backgroundColor: th.primary }]}>
                      {isActive && <Ionicons name="checkmark" size={10} color="#000" />}
                    </View>
                    <Text style={[styles.chipText, { color: isActive ? colors.primaryText : colors.secondaryText, fontWeight: isActive ? '700' : '600' }]}>
                      {th.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Yearly Combined Activity Overview (Pro) */}
        {showYearOverview && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.yearHeader}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Show year ${currentYear - 1}`}
                onPress={() => setCurrentYear(year => year - 1)}
                style={[styles.smallCircleBtn, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}
              >
                <Ionicons name="chevron-back" size={16} color={colors.primaryText} />
              </TouchableOpacity>
              <Text style={[styles.yearTitle, { color: colors.primaryText }]}>{currentYear} Overview</Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Show year ${currentYear + 1}`}
                accessibilityState={{ disabled: currentYear >= today.getFullYear() }}
                disabled={currentYear >= today.getFullYear()}
                onPress={() => setCurrentYear(year => year + 1)}
                style={[
                  styles.smallCircleBtn,
                  { backgroundColor: colors.secondaryBackground, borderColor: colors.border },
                  currentYear >= today.getFullYear() && { opacity: 0.35 },
                ]}
              >
                <Ionicons name="chevron-forward" size={16} color={colors.primaryText} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.yearCaption, { color: colors.secondaryText }]}>
              Combined daily habit activity across the year
            </Text>
            <View style={styles.yearMonthLabels}>
              {months.map(month => (
                <Text key={month} style={[styles.yearMonthLabel, { color: colors.mutedText }]}>{month}</Text>
              ))}
            </View>
            <View style={styles.yearGridRow}>
              <View style={styles.yearWeekdayLabels}>
                {daysOfWeek.map((day, index) => (
                  <Text key={`${day}-${index}`} style={[styles.yearWeekdayLabel, { color: colors.mutedText }]}>{day}</Text>
                ))}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.yearGrid}>
                {yearWeeks.map((week, weekIndex) => (
                  <View key={weekIndex} style={styles.yearWeek}>
                    {week.map((date, dayIndex) => {
                      const activity = date ? getDayActivity(date) : null;
                      const color = activity?.lapses ? '#F43F5E' : getIntensityColor(activity?.intensity ?? 0);
                      return date ? (
                        <TouchableOpacity
                          key={`${weekIndex}-${dayIndex}`}
                          accessibilityRole="button"
                          accessibilityLabel={`${date}, ${activity?.completed ?? 0} completed, ${activity?.lapses ?? 0} lapses`}
                          onPress={() => {
                            const [year, month, day] = date.split('-').map(Number);
                            setCurrentYear(year);
                            setCurrentMonthIndex(month - 1);
                            setSelectedDay(day);
                            setShowYearOverview(false);
                          }}
                          style={[styles.yearSquare, { backgroundColor: color }]}
                        />
                      ) : (
                        <View key={`${weekIndex}-${dayIndex}`} style={[styles.yearSquare, { backgroundColor: 'transparent' }]} />
                      );
                    })}
                  </View>
                ))}
              </ScrollView>
            </View>
          </View>
        )}

        {/* Pill Mode Switcher */}
        <View style={[styles.viewToggle, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ selected: !showWeekView }}
            onPress={() => {
              triggerLayoutEase();
              setShowWeekView(false);
            }}
            style={[styles.viewToggleButton, !showWeekView && { backgroundColor: colors.accent }]}
          >
            <Text style={[styles.viewToggleText, { color: !showWeekView ? '#FFFFFF' : colors.secondaryText }]}>
              Month
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ selected: showWeekView }}
            onPress={() => {
              triggerLayoutEase();
              setShowWeekView(true);
            }}
            style={[styles.viewToggleButton, showWeekView && { backgroundColor: colors.accent }]}
          >
            <Text style={[styles.viewToggleText, { color: showWeekView ? '#FFFFFF' : colors.secondaryText }]}>
              Week
            </Text>
          </TouchableOpacity>
        </View>

        {/* Compact Habit & Category Filters */}
        <View style={styles.filtersGroup}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Filter calendar to all habits"
              style={[
                styles.chip,
                {
                  borderColor: !selectedHabitId ? colors.accent : colors.border,
                  backgroundColor: !selectedHabitId ? colors.accent : colors.card,
                },
              ]}
              onPress={() => setSelectedHabitId(null)}
            >
              <Text style={[styles.chipText, { color: !selectedHabitId ? '#FFFFFF' : colors.secondaryText, fontWeight: '700' }]}>
                All habits
              </Text>
            </TouchableOpacity>
            {habits.map(habit => {
              const selected = selectedHabitId === habit.id;
              return (
                <TouchableOpacity
                  key={habit.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Filter calendar to ${habit.name}`}
                  style={[
                    styles.chip,
                    {
                      borderColor: selected ? habit.color : colors.border,
                      backgroundColor: selected ? `${habit.color}22` : colors.card,
                    },
                  ]}
                  onPress={() => setSelectedHabitId(selected ? null : habit.id)}
                >
                  <View style={[styles.habitFilterDot, { backgroundColor: habit.color }]} />
                  <Text numberOfLines={1} style={[styles.chipText, { color: selected ? colors.primaryText : colors.secondaryText, fontWeight: selected ? '700' : '600' }]}>
                    {habit.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {categories.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Filter calendar to all categories"
                accessibilityState={{ selected: selectedCategory === null }}
                style={[
                  styles.chip,
                  {
                    borderColor: colors.border,
                    backgroundColor: selectedCategory === null ? colors.secondaryBackground : colors.card,
                  },
                ]}
                onPress={() => { setSelectedCategory(null); setSelectedHabitId(null); }}
              >
                <Text style={[styles.chipText, { color: selectedCategory === null ? colors.primaryText : colors.secondaryText }]}>
                  All categories
                </Text>
              </TouchableOpacity>
              {categories.map(category => {
                const active = selectedCategory === category;
                return (
                  <TouchableOpacity
                    key={category}
                    accessibilityRole="button"
                    accessibilityLabel={`Filter calendar to ${category} category`}
                    accessibilityState={{ selected: active }}
                    style={[
                      styles.chip,
                      {
                        borderColor: active ? colors.accent : colors.border,
                        backgroundColor: active ? `${colors.accent}20` : colors.card,
                      },
                    ]}
                    onPress={() => { setSelectedCategory(active ? null : category); setSelectedHabitId(null); }}
                  >
                    <Text style={[styles.chipText, { color: active ? colors.accent : colors.secondaryText }]}>
                      {category}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>

        {/* Week View OR Clean 7-Column Swipeable Month Heatmap */}
        {showWeekView ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.weekCalendarHeader}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Previous week"
                onPress={() => goToDate(addLocalDays(selectedDateStr, -7))}
                style={[styles.smallCircleBtn, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}
              >
                <Ionicons name="chevron-back" size={16} color={colors.primaryText} />
              </TouchableOpacity>
              <Text style={[styles.monthName, { color: colors.primaryText }]}>
                {selectedWeek[0]} – {selectedWeek[6]}
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Next week"
                accessibilityState={{ disabled: selectedWeek[6] >= todayDateStr }}
                disabled={selectedWeek[6] >= todayDateStr}
                onPress={() => goToDate(addLocalDays(selectedDateStr, 7))}
                style={[
                  styles.smallCircleBtn,
                  { backgroundColor: colors.secondaryBackground, borderColor: colors.border },
                  selectedWeek[6] >= todayDateStr && { opacity: 0.35 },
                ]}
              >
                <Ionicons name="chevron-forward" size={16} color={colors.primaryText} />
              </TouchableOpacity>
            </View>

            {selectedWeek.map((date, idx) => {
              const activity = getDayActivity(date);
              const weekday = new Intl.DateTimeFormat('en', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
              const day = parseLocalDate(date)!.getDate();
              const isSelected = date === selectedDateStr;
              return (
                <TouchableOpacity
                  key={date}
                  accessibilityRole="button"
                  accessibilityLabel={`${weekday} ${date}: ${activity.completed} of ${activity.eligible.length} completed${activity.lapses ? `, ${activity.lapses} lapses` : ''}`}
                  accessibilityState={{ selected: isSelected, disabled: date > todayDateStr }}
                  disabled={date > todayDateStr}
                  onPress={() => goToDate(date)}
                  style={[
                    styles.weekCalendarDay,
                    idx < selectedWeek.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                    isSelected && { backgroundColor: `${colors.accent}18`, borderRadius: radii.md },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.weekCalendarDate, { color: colors.primaryText }]}>
                      {weekday} · {months[parseLocalDate(date)!.getMonth()]} {day}
                    </Text>
                    <Text style={[styles.weekCalendarStatus, { color: colors.secondaryText }]}>
                      {activity.completed} of {activity.eligible.length} completed{activity.lapses ? ` · ${activity.lapses} lapses` : ''}
                    </Text>
                  </View>
                  <View style={[styles.weekCalendarMeter, { backgroundColor: colors.secondaryBackground }]}>
                    <View
                      style={{
                        width: `${activity.eligible.length ? Math.round((activity.completed / activity.eligible.length) * 100) : 0}%`,
                        height: '100%',
                        backgroundColor: activity.lapses ? colors.error : selectedFilterColor,
                      }}
                    />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Month & Year Picker Trigger + Nav Controls */}
            <View style={styles.monthCardTop}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Choose month and year"
                onPress={() => setMonthPickerVisible(true)}
                style={[styles.monthPickerPill, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}
              >
                <Text style={[styles.monthName, { color: colors.primaryText }]}>
                  {months[currentMonthIndex]} {currentYear}
                </Text>
                <Ionicons name="chevron-down" size={14} color={colors.secondaryText} />
              </TouchableOpacity>
              <View style={styles.monthNavControls}>
                <TouchableOpacity
                  onPress={handleJumpToToday}
                  style={[styles.todayPill, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}
                >
                  <Text style={[styles.todayPillText, { color: colors.primaryText }]}>Today</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Previous month"
                  onPress={handlePrevMonth}
                  style={[styles.smallCircleBtn, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}
                >
                  <Ionicons name="chevron-back" size={16} color={colors.primaryText} />
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Next month"
                  onPress={handleNextMonth}
                  style={[styles.smallCircleBtn, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}
                >
                  <Ionicons name="chevron-forward" size={16} color={colors.primaryText} />
                </TouchableOpacity>
              </View>
            </View>

            {/* 7-Column Weekday Headers */}
            <View style={styles.weekHeaderRow}>
              {daysOfWeek.map((d, i) => (
                <View key={i} style={styles.weekHeaderCell}>
                  <Text style={[styles.weekHeaderText, { color: colors.mutedText }]}>{d}</Text>
                </View>
              ))}
            </View>

            {/* Swipeable Strict 7-Column Month Grid */}
            <AnimatedMonthContainer
              year={currentYear}
              month={currentMonthIndex}
              onShiftMonth={handleShiftMonth}
              style={styles.monthGridRows}
            >
              {monthRows.map((row, rIdx) => (
                <View key={rIdx} style={styles.monthGridRow}>
                  {row.map((day, cIdx) => {
                    if (!day) {
                      return <View key={`empty-${rIdx}-${cIdx}`} style={styles.dayCellEmpty} />;
                    }
                    const dateStr = getDayString(day);
                    const intensity = getIntensity(day);
                    const activity = getDayActivity(dateStr);
                    const isSelected = safeSelectedDay === day;
                    const isToday = dateStr === todayDateStr;

                    return (
                      <AnimatedPopTouchable
                        key={day}
                        pressScale={0.86}
                        containerStyle={styles.dayCellSlot}
                        style={[
                          styles.dayCell,
                          { backgroundColor: activity.lapses ? '#F43F5E' : getIntensityColor(intensity) },
                          isToday && !isSelected && { borderColor: colors.accent, borderWidth: 1 },
                          isSelected && { borderColor: selectedFilterColor, borderWidth: 2 },
                        ]}
                        activeOpacity={0.78}
                        onPress={() => setSelectedDay(day)}
                      >
                        <Text
                          style={[
                            styles.dayText,
                            {
                              color: intensity === 0 ? colors.primaryText : '#FFFFFF',
                              fontWeight: isSelected || isToday || intensity >= 2 ? '700' : '500',
                            },
                          ]}
                        >
                          {day}
                        </Text>
                      </AnimatedPopTouchable>
                    );
                  })}
                </View>
              ))}
            </AnimatedMonthContainer>

            {/* Heatmap Intensity Legend */}
            <View style={styles.legendRow}>
              <Text style={[styles.legendLabel, { color: colors.mutedText }]}>Swipe to change month</Text>
              <View style={styles.legendRight}>
                <Text style={[styles.legendLabel, { color: colors.mutedText }]}>Less</Text>
                {[0, 1, 2, 3].map(level => (
                  <View
                    key={level}
                    style={[styles.legendBox, { backgroundColor: getIntensityColor(level) }]}
                  />
                ))}
                <Text style={[styles.legendLabel, { color: colors.mutedText }]}>More</Text>
              </View>
            </View>
          </View>
        )}

        {/* Selected Day Details */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.detailsHeader}>
            <Text style={[styles.detailsTitle, { color: colors.primaryText }]}>
              {months[currentMonthIndex]} {safeSelectedDay}, {currentYear}
            </Text>
            <View style={[styles.logPill, { backgroundColor: `${selectedFilterColor}1C` }]}>
              <Text style={[styles.logPillText, { color: selectedFilterColor }]}>
                {getDayActivity(selectedDateStr).completed} of {getDayActivity(selectedDateStr).eligible.length} Done
              </Text>
            </View>
          </View>

          <View style={styles.habitList}>
            {visibleHabits.map(h => {
              const status = getHabitDayStatus(h, selectedDateStr, today);
              const isDone = status === 'completed';
              const statusLabel =
                status === 'completed' ? 'Done'
                  : status === 'missed' ? 'Missed'
                    : status === 'lapse' ? 'Lapse'
                      : status === 'paused' ? 'Paused'
                        : status === 'unscheduled' ? 'Unscheduled'
                          : status === 'future' ? 'Future'
                            : status === 'ended' ? 'Ended'
                              : status === 'not_started' ? 'Ready'
                                : 'Pending';

              return (
                <View
                  key={h.id}
                  style={[styles.detailRow, { backgroundColor: colors.secondaryBackground }]}
                >
                  <View style={[styles.detailIcon, { backgroundColor: `${h.color}20` }]}>
                    <Ionicons name={h.icon} size={18} color={h.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.detailHabitName,
                        { color: isDone ? colors.mutedText : colors.primaryText },
                        isDone && styles.detailHabitNameDone,
                      ]}
                      numberOfLines={1}
                    >
                      {h.name}
                    </Text>
                    <Text style={[styles.detailStatusText, { color: isDone ? h.color : colors.mutedText }]}>
                      {statusLabel}
                    </Text>
                  </View>
                  {canLogHabitOnDate(h, selectedDateStr, today) ? (
                    h.habitKind === 'quit' ? (
                      <HabitTrackingControl key={`${h.id}-${selectedDateStr}-${status}`} habit={h} date={selectedDateStr} onSave={recordHabitLog} />
                    ) : (
                      <AnimatedPopTouchable
                        pressScale={0.86}
                        accessibilityRole="button"
                        accessibilityLabel={`${isDone ? 'Undo' : 'Complete'} ${h.name} for ${selectedDateStr}`}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        activeOpacity={0.7}
                        onPress={() => {
                          toggleHabit(h.id, selectedDateStr);
                        }}
                        style={[
                          styles.checkBoxTile,
                          {
                            backgroundColor: isDone ? h.color : colors.card,
                            borderColor: isDone ? h.color : colors.border,
                          },
                        ]}
                      >
                        <Ionicons name="checkmark" size={16} color={isDone ? '#FFFFFF' : colors.mutedText} />
                      </AnimatedPopTouchable>
                    )
                  ) : null}
                </View>
              );
            })}
            {visibleHabits.filter(h => isScheduledOnDate(h, selectedDateStr)).length === 0 && visibleHabits.length === 0 && (
              <Text style={[styles.emptyDetailText, { color: colors.secondaryText }]}>
                No habits scheduled for this date.
              </Text>
            )}
          </View>
        </View>

        {/* All Habits Heatmaps Section */}
        <View style={styles.sectionHeadingRow}>
          <Text style={[styles.sectionEyebrow, { color: colors.mutedText }]}>ALL HABITS HEATMAP</Text>
          <Text style={[styles.sectionCount, { color: colors.mutedText }]}>
            {visibleHabits.length} {visibleHabits.length === 1 ? 'habit' : 'habits'}
          </Text>
        </View>

        {visibleHabits.length === 0 ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, alignItems: 'center' }]}>
            <Text style={[styles.emptyDetailText, { color: colors.secondaryText }]}>
              Create a habit to see its activity heatmap here.
            </Text>
          </View>
        ) : (
          visibleHabits.map(habit => {
            const streak = calculateStreakStats(habit, today).currentStreak;
            const rate30d = calculateCompletionStats(habit, addLocalDays(todayDateStr, -29), todayDateStr, today).percentage;
            return (
              <TouchableOpacity
                key={habit.id}
                accessibilityRole="button"
                accessibilityLabel={`Open ${habit.name} calendar and heatmap`}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('Habits', { focusHabitId: habit.id })}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={styles.habitHeatmapHead}>
                  <View style={[styles.habitHeatmapIcon, { backgroundColor: `${habit.color}20` }]}>
                    <Ionicons name={habit.icon} size={18} color={habit.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.habitHeatmapName, { color: colors.primaryText }]} numberOfLines={1}>
                      {habit.name}
                    </Text>
                    <Text style={[styles.habitHeatmapMeta, { color: colors.secondaryText }]}>
                      {habit.targetFrequency} · {rate30d}% (30d)
                    </Text>
                  </View>
                  <View style={[styles.streakBadgePill, { backgroundColor: `${habit.color}1C` }]}>
                    <Ionicons name="flame" size={12} color={habit.color} />
                    <Text style={[styles.streakBadgeText, { color: habit.color }]}>{streak}d</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.mutedText} />
                </View>

                <View style={styles.dotGridWrap}>
                  <HabitDotGrid
                    habit={habit}
                    todayDateStr={todayDateStr}
                    isDark={isDark}
                    mutedTextColor={colors.mutedText}
                    weeks={16}
                    dotSize={10}
                    dotGap={3}
                    showMonthLabels
                    showWeekdayLabels
                  />
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <MonthYearPickerModal
        visible={monthPickerVisible}
        monthIndex={currentMonthIndex}
        year={currentYear}
        accentColor={selectedFilterColor}
        onCancel={() => setMonthPickerVisible(false)}
        onConfirm={(nextMonth, nextYear) => {
          setCurrentMonthIndex(nextMonth);
          setCurrentYear(nextYear);
          setMonthPickerVisible(false);
        }}
      />

      <PaywallModal visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.lg, gap: 14 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallCircleBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yearPillBtn: {
    height: 38,
    borderRadius: radii.full,
    borderWidth: 1,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  yearPillText: { fontSize: 13, fontWeight: '700' },
  paletteCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: 10,
  },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.9,
    marginLeft: 2,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingHorizontal: 2,
  },
  sectionCount: { fontSize: 12, fontWeight: '600' },
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  viewToggle: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: radii.full,
    padding: 4,
  },
  viewToggleButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.full,
  },
  viewToggleText: { fontSize: 13, fontWeight: '700' },
  filtersGroup: { gap: 8 },
  chipRow: { gap: 8, paddingVertical: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.full,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderWidth: 1,
    gap: 7,
  },
  chipText: { fontSize: 12 },
  themeDot: {
    width: 15,
    height: 15,
    borderRadius: 7.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  habitFilterDot: { width: 8, height: 8, borderRadius: 4 },
  yearHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  yearTitle: { fontSize: 16, fontWeight: '800' },
  yearCaption: { fontSize: 12, marginTop: 4, marginBottom: spacing.md },
  yearMonthLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 5 },
  yearMonthLabel: { fontSize: 9, fontWeight: '700' },
  yearGridRow: { flexDirection: 'row', gap: 4 },
  yearWeekdayLabels: { width: 12, gap: 3 },
  yearWeekdayLabel: { width: 9, height: 9, fontSize: 7, lineHeight: 9, textAlign: 'center' },
  yearGrid: { gap: 3 },
  yearWeek: { gap: 3 },
  yearSquare: { width: 9, height: 9, borderRadius: 2 },
  monthCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 14,
  },
  monthPickerPill: {
    height: 36,
    borderRadius: radii.full,
    borderWidth: 1,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  monthName: { fontSize: 14, fontWeight: '700' },
  monthNavControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  todayPill: {
    height: 34,
    borderRadius: radii.full,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayPillText: { fontSize: 12, fontWeight: '700' },
  weekHeaderRow: { flexDirection: 'row', marginBottom: 8 },
  weekHeaderCell: { flex: 1, alignItems: 'center' },
  weekHeaderText: { fontSize: 12, fontWeight: '700' },
  monthGridRows: { gap: 6 },
  monthGridRow: { flexDirection: 'row', gap: 6 },
  dayCellEmpty: { flex: 1, aspectRatio: 1, maxHeight: 44 },
  dayCellSlot: { flex: 1, aspectRatio: 1, maxHeight: 44 },
  dayCell: {
    flex: 1,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: { fontSize: 13 },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  legendRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendLabel: { fontSize: 11 },
  legendBox: { width: 14, height: 14, borderRadius: 4 },
  weekCalendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  weekCalendarDay: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
  },
  weekCalendarDate: { fontSize: 13, fontWeight: '700' },
  weekCalendarStatus: { fontSize: 11, marginTop: 3 },
  weekCalendarMeter: { width: 58, height: 6, borderRadius: radii.full, overflow: 'hidden' },
  detailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  detailsTitle: { fontSize: 16, fontWeight: '700' },
  logPill: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: radii.full },
  logPillText: { fontSize: 12, fontWeight: '700' },
  habitList: { gap: 8 },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: radii.md,
    gap: 12,
  },
  detailIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailHabitName: { fontSize: 14, fontWeight: '600' },
  detailHabitNameDone: { textDecorationLine: 'line-through' },
  detailStatusText: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  checkBoxTile: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyDetailText: { fontSize: 13, paddingVertical: 8 },
  habitHeatmapHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  habitHeatmapIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  habitHeatmapName: { fontSize: 15, fontWeight: '700' },
  habitHeatmapMeta: { fontSize: 12, marginTop: 1 },
  streakBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  streakBadgeText: { fontSize: 12, fontWeight: '700' },
  dotGridWrap: { paddingTop: 2 },
});
