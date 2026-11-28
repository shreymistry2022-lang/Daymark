// src/screens/TodayScreen.tsx
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing, radii } from '../theme/tokens';
import { useHabits, Habit } from '../services/HabitContext';
import { useTheme } from '../theme/ThemeProvider';
import { CreateHabitModal } from '../components/CreateHabitModal';
import { HABIT_CATEGORIES } from '../constants/categories';
import { useSubscription } from '../services/SubscriptionProvider';
import { canCreateHabit, SUBSCRIPTIONS_ENABLED } from '../services/subscriptionEntitlements';
import { PaywallModal } from '../components/PaywallModal';
import { HabitTrackingControl } from '../components/HabitTrackingControl';
import { HabitDotGrid } from '../components/HabitDotGrid';
import { triggerLayoutEase } from '../components/AnimatedMonthGrid';
import { usePreferences } from '../services/PreferencesContext';
import { getWeekDates } from '../domain/preferencesEngine';
import { addLocalDays, getHabitDayStatus, isTrackableOnDate, parseLocalDate } from '../domain/habitEngine';
import { useNavigation } from '@react-navigation/native';
import { formatGapLabel, formatReminderTime, shareDailyProgressAsync } from '../services/localReminders';

type DashboardViewMode = 'cards' | 'matrix' | 'grid';

const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAY_2 = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

interface MinimalHabitCardProps {
  habit: Habit;
  habitIndex: number;
  totalCount: number;
  selectedDate: string;
  todayDateStr: string;
  dateReference: Date;
  colors: any;
  isDark: boolean;
  showReorder: boolean;
  onOpenDetails: (habitId: string) => void;
  onToggle: (habitId: string, dateStr: string) => void;
  onRecordLog: (id: string, log: any) => { error?: string };
  onMoveUp: () => void;
  onMoveDown: () => void;
}

const MinimalHabitCard = React.memo(({
  habit,
  habitIndex,
  totalCount,
  selectedDate,
  todayDateStr,
  dateReference,
  colors,
  isDark,
  showReorder,
  onOpenDetails,
  onToggle,
  onRecordLog,
  onMoveUp,
  onMoveDown,
}: MinimalHabitCardProps) => {
  const isCompleted = getHabitDayStatus(habit, selectedDate, dateReference) === 'completed';
  const enabledReminders = (habit.reminders ?? []).filter(r => r.enabled);
  const [checkScale] = useState(() => new Animated.Value(1));

  const handlePressCheckbox = useCallback(() => {
    Animated.sequence([
      Animated.timing(checkScale, { toValue: 0.85, duration: 50, useNativeDriver: true }),
      Animated.spring(checkScale, { toValue: 1, friction: 5, tension: 65, useNativeDriver: true }),
    ]).start();
    onToggle(habit.id, selectedDate);
  }, [checkScale, onToggle, habit.id, selectedDate]);

  const reminderSummary = enabledReminders.length > 0
    ? enabledReminders.length > 1
      ? `${enabledReminders.length}x/day${enabledReminders[0]?.intervalMinutes ? ` · ${formatGapLabel(enabledReminders[0].intervalMinutes)}` : ''}`
      : formatReminderTime(enabledReminders[0].hour, enabledReminders[0].minute)
    : null;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`Open ${habit.name} details`}
      activeOpacity={0.85}
      onPress={() => onOpenDetails(habit.id)}
      style={[
        styles.habitCard,
        {
          backgroundColor: colors.card,
          borderColor: isCompleted ? `${habit.color}45` : colors.border,
        },
      ]}
    >
      <View style={styles.cardTopRow}>
        <View style={[styles.habitIconSquircle, { backgroundColor: `${habit.color}20` }]}>
          <Ionicons name={habit.icon} size={20} color={habit.color} />
        </View>

        <View style={styles.cardTitleCol}>
          <Text style={[styles.habitTitle, { color: colors.primaryText }]} numberOfLines={1}>
            {habit.name}
          </Text>
          <View style={styles.metaRow}>
            <Text style={[styles.metaText, { color: colors.secondaryText }]} numberOfLines={1}>
              {habit.streak > 0 ? `🔥 ${habit.streak}d` : habit.category}
              {reminderSummary ? `  ·  🔔 ${reminderSummary}` : ''}
            </Text>
          </View>
        </View>

        {showReorder ? (
          <View style={styles.reorderGroup}>
            <TouchableOpacity
              accessibilityLabel={`Move ${habit.name} up`}
              disabled={habitIndex === 0}
              onPress={onMoveUp}
              style={styles.reorderBtn}
            >
              <Ionicons name="chevron-up" size={16} color={habitIndex === 0 ? colors.mutedText : colors.secondaryText} />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel={`Move ${habit.name} down`}
              disabled={habitIndex === totalCount - 1}
              onPress={onMoveDown}
              style={styles.reorderBtn}
            >
              <Ionicons name="chevron-down" size={16} color={habitIndex === totalCount - 1 ? colors.mutedText : colors.secondaryText} />
            </TouchableOpacity>
          </View>
        ) : null}

        {habit.habitKind === 'quit' ? (
          <HabitTrackingControl
            key={`${habit.id}-${selectedDate}`}
            habit={habit}
            date={selectedDate}
            onSave={onRecordLog}
          />
        ) : (
          <Animated.View style={{ transform: [{ scale: checkScale }] }}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`${isCompleted ? 'Undo' : 'Complete'} ${habit.name} for ${selectedDate}`}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={[
                styles.checkSquircle,
                {
                  borderColor: isCompleted ? habit.color : colors.border,
                  backgroundColor: isCompleted ? habit.color : colors.secondaryBackground,
                },
              ]}
              activeOpacity={0.7}
              onPress={handlePressCheckbox}
            >
              <Ionicons
                name="checkmark"
                size={18}
                color={isCompleted ? '#FFFFFF' : colors.mutedText}
              />
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>

      <View style={styles.cardHeatmapWrap}>
        <HabitDotGrid
          habit={habit}
          todayDateStr={todayDateStr}
          isDark={isDark}
          mutedTextColor={colors.mutedText}
          weeks={20}
          dotSize={9}
          dotGap={3}
        />
      </View>
    </TouchableOpacity>
  );
}, (prev, next) => (
  prev.habit.id === next.habit.id &&
  prev.habit.name === next.habit.name &&
  prev.habit.category === next.habit.category &&
  prev.habit.color === next.habit.color &&
  prev.habit.icon === next.habit.icon &&
  prev.habit.streak === next.habit.streak &&
  prev.habit.completedDates === next.habit.completedDates &&
  prev.habit.logs === next.habit.logs &&
  prev.habit.reminders === next.habit.reminders &&
  prev.habitIndex === next.habitIndex &&
  prev.totalCount === next.totalCount &&
  prev.selectedDate === next.selectedDate &&
  prev.todayDateStr === next.todayDateStr &&
  prev.isDark === next.isDark &&
  prev.showReorder === next.showReorder
));

MinimalHabitCard.displayName = 'MinimalHabitCard';

export const TodayScreen = () => {
  const { habits, toggleHabit, recordHabitLog, addHabit, moveHabit, todayDateStr, stats, triggerCelebration } = useHabits();
  const { colors, isDark } = useTheme();
  const { isPro } = useSubscription();
  const { preferences } = usePreferences();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const navigation = useNavigation<any>();

  const [viewMode, setViewMode] = useState<DashboardViewMode>('cards');
  const [showFilters, setShowFilters] = useState(false);
  const [showWeekStrip, setShowWeekStrip] = useState(false);
  const [inspectedDate, setInspectedDate] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);

  const weekDates = useMemo(() => getWeekDates(todayDateStr, preferences.weekStart), [todayDateStr, preferences.weekStart]);
  const selectedDate = inspectedDate && weekDates.includes(inspectedDate) ? inspectedDate : todayDateStr;
  const dateReference = useMemo(() => parseLocalDate(todayDateStr) ?? new Date(), [todayDateStr]);
  const todaysHabits = habits.filter(habit => isTrackableOnDate(habit, selectedDate, dateReference));
  const selectedCompleted = todaysHabits.filter(habit => getHabitDayStatus(habit, selectedDate, dateReference) === 'completed').length;
  const selectedCompletionRate = todaysHabits.length ? Math.round((selectedCompleted / todaysHabits.length) * 100) : 0;

  const last5Days = useMemo(() => (
    Array.from({ length: 5 }, (_, idx) => {
      const dateStr = addLocalDays(todayDateStr, idx - 4);
      const d = parseLocalDate(dateStr) ?? new Date();
      return {
        dateStr,
        dayShort: WEEKDAY_2[d.getDay()],
        dayNum: d.getDate(),
        monthAbbr: MONTH_ABBR[d.getMonth()],
      };
    })
  ), [todayDateStr]);

  const requestCreateHabit = () => {
    if (!canCreateHabit(habits.length, isPro)) setPaywallVisible(true);
    else setCreateModalVisible(true);
  };

  const availableCategories = ['All', ...Array.from(new Set(habits.map(h => h.category)))];
  const baseList = viewMode === 'cards' ? todaysHabits : habits;
  const filteredHabits = baseList.filter(h => selectedCategory === 'All' || h.category === selectedCategory);

  const handleOpenDetails = useCallback((habitId: string) => {
    navigation.navigate('Habits', { focusHabitId: habitId });
  }, [navigation]);

  const handleToggleHabit = useCallback((habitId: string, dateStr: string) => {
    toggleHabit(habitId, dateStr);
  }, [toggleHabit]);

  const gridColumns = width >= 400 ? 3 : 2;
  const gridCardWidth = (width - spacing.lg * 2 - 10 * (gridColumns - 1)) / gridColumns;
  const todayParsed = parseLocalDate(todayDateStr) ?? new Date();
  const monthLabel = `${MONTH_FULL[todayParsed.getMonth()]} ${todayParsed.getFullYear()}`;
  const matrixRangeLabel = `${last5Days[0].dayNum} ${last5Days[0].monthAbbr} – ${last5Days[4].dayNum} ${last5Days[4].monthAbbr}`;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 110 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Minimalist Circle Icon Header */}
        <View style={styles.topBar}>
          <View style={styles.topLeft}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Open profile settings"
              style={[styles.circleBtn, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}
              onPress={() => navigation.navigate('Profile')}
              activeOpacity={0.7}
            >
              <Ionicons name="settings-outline" size={20} color={colors.primaryText} />
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                triggerLayoutEase();
                setShowWeekStrip(prev => !prev);
              }}
              style={[styles.summaryPill, { backgroundColor: colors.card, borderColor: selectedCompletionRate === 100 ? colors.accent : colors.border }]}
            >
              <Text style={[styles.summaryText, { color: colors.primaryText }]}>
                {selectedDate === todayDateStr ? 'Today' : selectedDate.slice(5)}
              </Text>
              <View style={[styles.summaryDot, { backgroundColor: colors.accent }]} />
              <Text style={[styles.summaryRate, { color: colors.accent }]}>
                {selectedCompleted}/{todaysHabits.length}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.topRight}>
            {SUBSCRIPTIONS_ENABLED && !isPro ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Daymark Pro"
                style={[styles.proCircleBtn, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}
                onPress={() => setPaywallVisible(true)}
                activeOpacity={0.7}
              >
                <Text style={[styles.proBadgeText, { color: colors.primaryText }]}>PRO</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Filter habits by category"
              style={[
                styles.circleBtn,
                {
                  backgroundColor: showFilters ? `${colors.accent}22` : colors.secondaryBackground,
                  borderColor: showFilters ? colors.accent : colors.border,
                },
              ]}
              onPress={() => {
                triggerLayoutEase();
                setShowFilters(prev => !prev);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="filter" size={18} color={showFilters ? colors.accent : colors.primaryText} />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Share daily habit progress"
              style={[styles.circleBtn, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}
              onPress={() => void shareDailyProgressAsync(habits, selectedDate, stats)}
              activeOpacity={0.7}
            >
              <Ionicons name="share-outline" size={18} color={colors.primaryText} />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Create a new habit"
              style={[styles.circleBtn, { backgroundColor: colors.accent, borderColor: colors.accent }]}
              onPress={requestCreateHabit}
              activeOpacity={0.75}
            >
              <Ionicons name="add" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Sub-bar: View Switcher Pill + Date / Progress */}
        <View style={styles.subBar}>
          <View style={[styles.viewSwitcherPill, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {([
              { id: 'cards', icon: 'albums-outline', label: 'Cards' },
              { id: 'matrix', icon: 'list-outline', label: '5 Days' },
              { id: 'grid', icon: 'grid-outline', label: 'Month' },
            ] as const).map(item => {
              const active = viewMode === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.label} view`}
                  onPress={() => setViewMode(item.id)}
                  style={[
                    styles.viewTabBtn,
                    active && { backgroundColor: colors.elevatedCard },
                  ]}
                  activeOpacity={0.7}
                >
                  <Ionicons name={item.icon} size={15} color={active ? colors.primaryText : colors.secondaryText} />
                  <Text style={[styles.viewTabText, { color: active ? colors.primaryText : colors.secondaryText }]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {viewMode === 'matrix' ? (
            <Text style={[styles.rangeCaption, { color: colors.secondaryText }]}>{matrixRangeLabel}</Text>
          ) : viewMode === 'grid' ? (
            <Text style={[styles.rangeCaption, { color: colors.secondaryText }]}>{monthLabel}</Text>
          ) : (
            <TouchableOpacity
              activeOpacity={selectedCompletionRate === 100 ? 0.7 : 1}
              onPress={() => {
                if (selectedDate === todayDateStr && selectedCompletionRate === 100 && todaysHabits.length > 0) {
                  triggerCelebration();
                }
              }}
              style={[styles.rateChip, { backgroundColor: `${colors.accent}18` }]}
            >
              <Text style={[styles.rateChipText, { color: colors.accent }]}>{selectedCompletionRate}%</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Expandable 7-Day Week Selector Strip (tapped from Today pill) */}
        {showWeekStrip ? (
          <View style={[styles.weekCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.weekHeader}>
              <Text style={[styles.weekTitle, { color: colors.secondaryText }]}>
                {selectedDate === todayDateStr ? 'THIS WEEK' : 'REVIEWING PAST DAY'}
              </Text>
              {selectedDate !== todayDateStr ? (
                <TouchableOpacity onPress={() => setInspectedDate(null)}>
                  <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 12 }}>Today</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={styles.weekRow}>
              {weekDates.map(date => {
                const isFuture = date > todayDateStr;
                const parsed = parseLocalDate(date)!;
                const weekday = WEEKDAY_2[new Date(`${date}T12:00:00Z`).getUTCDay()];
                const completed = habits.filter(habit => getHabitDayStatus(habit, date, dateReference) === 'completed').length;
                const active = date === selectedDate;
                return (
                  <TouchableOpacity
                    key={date}
                    disabled={isFuture}
                    onPress={() => setInspectedDate(date)}
                    style={[
                      styles.weekDayPill,
                      {
                        backgroundColor: active ? colors.accent : colors.secondaryBackground,
                        opacity: isFuture ? 0.4 : 1,
                      },
                    ]}
                  >
                    <Text style={[styles.weekdayLabel, { color: active ? '#FFFFFF' : colors.secondaryText }]}>{weekday}</Text>
                    <Text style={[styles.weekdayDate, { color: active ? '#FFFFFF' : colors.primaryText }]}>{parsed.getDate()}</Text>
                    <View style={[styles.weekDot, { backgroundColor: active ? '#FFFFFF' : completed > 0 ? colors.accent : colors.border }]} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* Optional Category Filter Pills */}
        {showFilters ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {availableCategories.map(cat => {
              const isActive = selectedCategory === cat;
              const categoryDef = HABIT_CATEGORIES.find(c => c.name === cat);
              return (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.filterPill,
                    {
                      backgroundColor: isActive ? colors.primaryText : colors.card,
                      borderColor: isActive ? colors.primaryText : colors.border,
                    },
                  ]}
                  activeOpacity={0.7}
                  onPress={() => setSelectedCategory(cat)}
                >
                  {categoryDef ? (
                    <Ionicons
                      name={categoryDef.icon}
                      size={13}
                      color={isActive ? colors.background : categoryDef.color}
                      style={{ marginRight: 5 }}
                    />
                  ) : null}
                  <Text style={[styles.filterPillText, { color: isActive ? colors.background : colors.secondaryText }]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : null}

        {/* Empty State */}
        {filteredHabits.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.emptyIconCircle, { backgroundColor: `${colors.accent}18` }]}>
              <Ionicons name="sparkles-outline" size={28} color={colors.accent} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.primaryText }]}>
              {selectedDate === todayDateStr ? 'Start your first habit' : 'No habits scheduled this day'}
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.secondaryText }]}>
              Tap the + button to build a simple daily routine.
            </Text>
            <TouchableOpacity
              style={[styles.emptyButton, { backgroundColor: colors.accent }]}
              onPress={requestCreateHabit}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={18} color="#FFFFFF" />
              <Text style={styles.emptyButtonText}>New Habit</Text>
            </TouchableOpacity>
          </View>
        ) : viewMode === 'cards' ? (
          <View style={styles.cardsStack}>
            {filteredHabits.map((habit, habitIndex) => (
              <MinimalHabitCard
                key={habit.id}
                habit={habit}
                habitIndex={habitIndex}
                totalCount={filteredHabits.length}
                selectedDate={selectedDate}
                todayDateStr={todayDateStr}
                dateReference={dateReference}
                colors={colors}
                isDark={isDark}
                showReorder={preferences.dashboardSort === 'custom' && selectedCategory === 'All'}
                onOpenDetails={handleOpenDetails}
                onToggle={handleToggleHabit}
                onRecordLog={recordHabitLog}
                onMoveUp={() => moveHabit(habit.id, filteredHabits[habitIndex - 1]?.id ?? '')}
                onMoveDown={() => moveHabit(habit.id, filteredHabits[habitIndex + 1]?.id ?? '')}
              />
            ))}
          </View>
        ) : viewMode === 'matrix' ? (
          /* 5-Day Matrix View (Reference Image 1) */
          <View style={[styles.matrixCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.matrixHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.matrixCountLabel, { color: colors.secondaryText }]}>
                {filteredHabits.length} {filteredHabits.length === 1 ? 'HABIT' : 'HABITS'}
              </Text>
              <View style={styles.matrixDaysHeader}>
                {last5Days.map(day => {
                  const isToday = day.dateStr === todayDateStr;
                  return (
                    <View key={day.dateStr} style={styles.matrixDayColHeader}>
                      <Text style={[styles.matrixDayShort, { color: isToday ? colors.primaryText : colors.mutedText }]}>
                        {day.dayShort}
                      </Text>
                      <Text style={[styles.matrixDayNum, { color: isToday ? colors.primaryText : colors.secondaryText, fontWeight: isToday ? '800' : '600' }]}>
                        {day.dayNum}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>

            {filteredHabits.map((habit, idx) => (
              <View
                key={habit.id}
                style={[
                  styles.matrixRow,
                  idx < filteredHabits.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                ]}
              >
                <TouchableOpacity
                  style={styles.matrixHabitLeft}
                  activeOpacity={0.7}
                  onPress={() => handleOpenDetails(habit.id)}
                >
                  <View style={[styles.matrixIconSquircle, { backgroundColor: `${habit.color}20` }]}>
                    <Ionicons name={habit.icon} size={16} color={habit.color} />
                  </View>
                  <Text style={[styles.matrixHabitName, { color: colors.primaryText }]} numberOfLines={1}>
                    {habit.name}
                  </Text>
                </TouchableOpacity>

                <View style={styles.matrixTilesRow}>
                  {last5Days.map(day => {
                    const trackable = isTrackableOnDate(habit, day.dateStr, dateReference);
                    const done = getHabitDayStatus(habit, day.dateStr, dateReference) === 'completed';
                    return (
                      <TouchableOpacity
                        key={day.dateStr}
                        disabled={!trackable}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={`Toggle ${habit.name} on ${day.dateStr}`}
                        onPress={() => handleToggleHabit(habit.id, day.dateStr)}
                        style={[
                          styles.matrixTile,
                          {
                            backgroundColor: done ? habit.color : `${habit.color}1C`,
                            opacity: trackable ? 1 : 0.35,
                          },
                        ]}
                      />
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        ) : (
          /* Monthly Compact Grid View (Reference Image 4) */
          <View style={styles.gridWrap}>
            {filteredHabits.map(habit => {
              const done = getHabitDayStatus(habit, todayDateStr, dateReference) === 'completed';
              return (
                <TouchableOpacity
                  key={habit.id}
                  activeOpacity={0.85}
                  onPress={() => handleOpenDetails(habit.id)}
                  style={[
                    styles.gridCard,
                    {
                      width: gridCardWidth,
                      backgroundColor: colors.card,
                      borderColor: done ? `${habit.color}45` : colors.border,
                    },
                  ]}
                >
                  <View style={styles.gridCardHead}>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={`Toggle ${habit.name}`}
                      onPress={() => handleToggleHabit(habit.id, todayDateStr)}
                      style={[
                        styles.gridCheckCircle,
                        {
                          backgroundColor: done ? habit.color : colors.secondaryBackground,
                          borderColor: done ? habit.color : colors.border,
                        },
                      ]}
                    >
                      <Ionicons name="checkmark" size={12} color={done ? '#FFFFFF' : colors.mutedText} />
                    </TouchableOpacity>
                    <Text style={[styles.gridHabitName, { color: colors.primaryText }]} numberOfLines={1}>
                      {habit.name}
                    </Text>
                  </View>
                  <HabitDotGrid
                    habit={habit}
                    todayDateStr={todayDateStr}
                    isDark={isDark}
                    mutedTextColor={colors.mutedText}
                    mode="month"
                    dotSize={gridColumns === 3 ? 8 : 11}
                    dotGap={3}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {createModalVisible ? (
        <CreateHabitModal
          key={createModalVisible ? 'open' : 'closed'}
          visible={createModalVisible}
          onClose={() => setCreateModalVisible(false)}
          onAddHabit={addHabit}
        />
      ) : null}
      <PaywallModal visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.lg },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  circleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proCircleBtn: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  summaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    paddingHorizontal: 14,
    borderRadius: radii.full,
    borderWidth: 1,
    gap: 7,
  },
  summaryText: { fontSize: 14, fontWeight: '700' },
  summaryDot: { width: 5, height: 5, borderRadius: 2.5 },
  summaryRate: { fontSize: 13, fontWeight: '800' },

  subBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  viewSwitcherPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.full,
    borderWidth: 1,
    padding: 3,
    gap: 2,
  },
  viewTabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: radii.full,
  },
  viewTabText: { fontSize: 12, fontWeight: '700' },
  rangeCaption: { fontSize: 11, fontWeight: '700', letterSpacing: 0.7 },
  rateChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.full,
  },
  rateChipText: { fontSize: 12, fontWeight: '800' },

  weekCard: {
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  weekTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  weekDayPill: {
    flex: 1,
    minHeight: 62,
    borderRadius: radii.md,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 6,
  },
  weekdayLabel: { fontSize: 10, fontWeight: '700' },
  weekdayDate: { fontSize: 15, fontWeight: '800', marginTop: 2 },
  weekDot: { width: 4, height: 4, borderRadius: 2, marginTop: 4 },

  filterRow: { gap: 8, marginBottom: spacing.md },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.full,
    borderWidth: 1,
  },
  filterPillText: { fontSize: 12, fontWeight: '600' },

  cardsStack: { gap: spacing.md },
  habitCard: {
    borderRadius: radii.xl,
    padding: spacing.md,
    borderWidth: 1,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  habitIconSquircle: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitleCol: { flex: 1 },
  habitTitle: { fontSize: 16, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  metaText: { fontSize: 12, fontWeight: '500' },
  reorderGroup: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  reorderBtn: { padding: 6 },
  checkSquircle: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeatmapWrap: {
    marginTop: 12,
    paddingTop: 2,
  },

  matrixCard: {
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.md,
  },
  matrixHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    marginBottom: 4,
    borderBottomWidth: 1,
  },
  matrixCountLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  matrixDaysHeader: { flexDirection: 'row', gap: 6 },
  matrixDayColHeader: { width: 32, alignItems: 'center' },
  matrixDayShort: { fontSize: 10, fontWeight: '600' },
  matrixDayNum: { fontSize: 12, marginTop: 1 },
  matrixRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
  },
  matrixHabitLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 8 },
  matrixIconSquircle: { width: 32, height: 32, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center' },
  matrixHabitName: { flex: 1, fontSize: 14, fontWeight: '600' },
  matrixTilesRow: { flexDirection: 'row', gap: 6 },
  matrixTile: { width: 32, height: 32, borderRadius: radii.sm },

  gridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gridCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: 10,
    gap: 10,
  },
  gridCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gridCheckCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridHabitName: { flex: 1, fontSize: 12, fontWeight: '700' },

  emptyState: {
    marginTop: spacing.xl,
    paddingVertical: 40,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.xl,
    borderWidth: 1,
    alignItems: 'center',
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptySubtitle: { fontSize: 13, textAlign: 'center', marginTop: 6, marginBottom: 18 },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: radii.full,
  },
  emptyButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});
