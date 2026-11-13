// src/screens/TodayScreen.tsx
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
import { CreateHabitModal } from '../components/CreateHabitModal';
import { HABIT_CATEGORIES } from '../constants/categories';
import { useSubscription } from '../services/SubscriptionProvider';
import { canCreateHabit } from '../services/subscriptionEntitlements';
import { PaywallModal } from '../components/PaywallModal';
import { HabitTrackingControl } from '../components/HabitTrackingControl';
import * as Haptics from 'expo-haptics';
import { usePreferences } from '../services/PreferencesContext';
import { formatAppDate, getWeekDates } from '../domain/preferencesEngine';
import { getHabitDayStatus, isTrackableOnDate, parseLocalDate } from '../domain/habitEngine';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../services/AuthProvider';
import { formatReminderTime } from '../services/localReminders';

export const TodayScreen = () => {
  const { habits, toggleHabit, recordHabitLog, addHabit, moveHabit, todayDateStr, stats, triggerCelebration } = useHabits();
  const { colors } = useTheme();
  const { isPro } = useSubscription();
  const { preferences } = usePreferences();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [inspectedDate, setInspectedDate] = useState<string | null>(null);
  const weekDates = useMemo(() => getWeekDates(todayDateStr, preferences.weekStart), [todayDateStr, preferences.weekStart]);
  const selectedDate = inspectedDate && weekDates.includes(inspectedDate) ? inspectedDate : todayDateStr;
  const dateReference = parseLocalDate(todayDateStr) ?? new Date();
  const todaysHabits = habits.filter(habit => isTrackableOnDate(habit, selectedDate, dateReference));
  const selectedCompleted = todaysHabits.filter(habit => getHabitDayStatus(habit, selectedDate, dateReference) === 'completed').length;
  const selectedCompletionRate = todaysHabits.length ? Math.round(selectedCompleted / todaysHabits.length * 100) : 0;

  // Filter state
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const requestCreateHabit = () => {
    if (!canCreateHabit(habits.length, isPro)) setPaywallVisible(true);
    else setCreateModalVisible(true);
  };

  // Extract unique active categories from existing habits plus popular ones
  const availableCategories = [
    'All',
    ...Array.from(new Set(todaysHabits.map(h => h.category))),
  ];

  const filteredHabits = todaysHabits.filter(h => {
    if (selectedCategory === 'All') return true;
    return h.category === selectedCategory;
  });

  const currentDateFormatted = formatAppDate(new Date(`${selectedDate}T12:00:00Z`), preferences.dateFormat, preferences.timezone).toUpperCase();
  const currentHour = Number(new Intl.DateTimeFormat('en', { hour: '2-digit', hour12: false, timeZone: preferences.timezone }).format(new Date()));
  const greeting = currentHour < 12 ? 'Good morning' : currentHour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 110 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Editorial Top Bar */}
        <View style={styles.topBar}>
          <View>
            <Text style={[styles.dateLabel, { color: colors.accent }]}>{currentDateFormatted}</Text>
            <Text style={[styles.mainTitle, { color: colors.primaryText }]}>{selectedDate === todayDateStr ? 'Today’s Focus' : 'Day Review'}</Text>
            {user?.fullName ? <Text style={[styles.greeting, { color: colors.secondaryText }]}>{greeting}, {user.fullName.split(' ')[0]}</Text> : null}
          </View>
          <View style={styles.topActions}>
            <View style={styles.iconActions}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open notification preferences" onPress={() => navigation.navigate('Profile', { openPreferences: true })} style={styles.topIconButton}><Ionicons name="notifications-outline" size={20} color={colors.primaryText} /></TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open profile" onPress={() => navigation.navigate('Profile')} style={styles.topIconButton}><Ionicons name="person-circle-outline" size={23} color={colors.primaryText} /></TouchableOpacity>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Create a new habit"
              style={[styles.addButton, { backgroundColor: colors.accent }]}
              activeOpacity={0.7}
              onPress={requestCreateHabit}
            >
              <Ionicons name="add" size={20} color="#000" />
              <Text style={styles.addButtonText}>New Habit</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Swiss Progress Dashboard Card */}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`${selectedCompletionRate}% complete${selectedDate === todayDateStr ? ', tap to celebrate when all habits are done' : ''}`}
          style={[
            styles.heroCard,
            {
              backgroundColor: colors.card,
              borderColor: selectedCompletionRate === 100 ? colors.accent : colors.border,
            },
          ]}
          activeOpacity={selectedCompletionRate === 100 ? 0.75 : 1}
          onPress={() => {
            if (selectedDate === todayDateStr && selectedCompletionRate === 100 && todaysHabits.length > 0) {
              triggerCelebration();
            }
          }}
        >
          <View style={styles.heroHeader}>
            <View>
              <Text style={[styles.heroCategory, { color: colors.secondaryText }]}>DAILY RITUALS</Text>
              <Text style={[styles.heroStats, { color: colors.primaryText }]}>
                {todaysHabits.length > 0 ? `${selectedCompleted} of ${todaysHabits.length} completed` : 'No habits scheduled this day'}
              </Text>
            </View>
            <View style={[styles.percentageBadge, { backgroundColor: `${colors.accent}18` }]}>
              <Text style={[styles.percentageText, { color: colors.accent }]}>{selectedCompletionRate}%</Text>
            </View>
          </View>

          {/* Precision Progress Bar */}
          <View style={[styles.progressTrack, { backgroundColor: colors.secondaryBackground }]}>
            <View
              style={[
                styles.progressBar,
                { width: `${Math.max(5, selectedCompletionRate)}%`, backgroundColor: colors.accent },
              ]}
            />
          </View>

          <View style={styles.heroFooter}>
            <View style={styles.streakIndicator}>
              <Ionicons name="flame" size={16} color={colors.accent} />
              <Text style={[styles.streakText, { color: colors.primaryText }]}>{stats.bestStreak} Day Best Streak</Text>
            </View>
            <Text style={[styles.quoteSubtext, { color: colors.mutedText }]}>
              {selectedDate === todayDateStr ? (selectedCompletionRate === 100 && todaysHabits.length > 0 ? 'All done! 🎉 Tap to celebrate' : `${Math.max(0, todaysHabits.length - selectedCompleted)} remaining today`) : `${selectedCompleted} completed · ${Math.max(0, todaysHabits.length - selectedCompleted)} missed or unfinished`}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={[styles.weekCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.weekHeader}>
            <Text style={[styles.weekTitle, { color: colors.primaryText }]}>{selectedDate === todayDateStr ? 'THIS WEEK' : 'REVIEWING A PAST DAY'}</Text>
            {selectedDate !== todayDateStr && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Return to today" onPress={() => setInspectedDate(null)} style={styles.todayLink}><Text style={{ color: colors.accent, fontWeight: '700' }}>Today</Text></TouchableOpacity>}
          </View>
          <View style={styles.weekRow}>
            {weekDates.map(date => {
              const isFuture = date > todayDateStr;
              const parsed = parseLocalDate(date)!;
              const weekday = new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
              const completed = habits.filter(habit => getHabitDayStatus(habit, date, dateReference) === 'completed').length;
              const hasMissed = habits.some(habit => getHabitDayStatus(habit, date, dateReference) === 'missed');
              const active = date === selectedDate;
              return <TouchableOpacity key={date} accessibilityRole="button" accessibilityLabel={`${weekday}, ${parsed.getDate()}${date === todayDateStr ? ', today' : ''}${isFuture ? ', unavailable' : `, ${completed} completed${hasMissed ? ', missed habits' : ''}`}`} accessibilityState={{ selected: active, disabled: isFuture }} disabled={isFuture} onPress={() => setInspectedDate(date)} style={[styles.weekDay, { backgroundColor: active ? colors.accent : colors.secondaryBackground, opacity: isFuture ? 0.45 : 1 }]}>
                <Text style={[styles.weekdayLabel, { color: active ? '#000' : colors.mutedText }]}>{weekday}</Text>
                <Text style={[styles.weekdayDate, { color: active ? '#000' : colors.primaryText }]}>{parsed.getDate()}</Text>
                <View style={[styles.weekDot, { backgroundColor: active ? '#000' : completed > 0 ? colors.accent : hasMissed ? colors.error : colors.border }]} />
              </TouchableOpacity>;
            })}
          </View>
          {selectedDate !== todayDateStr && <Text style={[styles.reviewHint, { color: colors.secondaryText }]}>You can correct this day’s habit entries. Future days are unavailable.</Text>}
        </View>

        {/* Filter Pills with Categories */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
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
                {categoryDef && (
                  <Ionicons
                    name={categoryDef.icon}
                    size={14}
                    color={isActive ? colors.background : categoryDef.color}
                    style={{ marginRight: 6 }}
                  />
                )}
                <Text
                  style={[
                    styles.filterPillText,
                    { color: isActive ? colors.background : colors.secondaryText },
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Habit Cards Section */}
        <View style={styles.habitsSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionHeader, { color: colors.secondaryText }]}>
              HABITS ({filteredHabits.length})
            </Text>
            <TouchableOpacity onPress={() => setCreateModalVisible(true)}>
              <Text style={[styles.quickAddLink, { color: colors.accent }]}>+ Create Habit</Text>
            </TouchableOpacity>
          </View>

          {filteredHabits.map((habit, habitIndex) => {
            const isCompleted = getHabitDayStatus(habit, selectedDate, dateReference) === 'completed';
            const enabledReminders = (habit.reminders ?? []).filter(r => r.enabled);
            return (
              <View
                key={habit.id}
                style={[
                  styles.habitCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: isCompleted ? `${colors.accent}40` : colors.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.habitIconBox,
                    { backgroundColor: `${habit.color}1F` },
                  ]}
                >
                  <Ionicons name={habit.icon} size={22} color={habit.color} />
                </View>

                <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Open ${habit.name} details`} style={styles.habitMeta} onPress={() => navigation.navigate('Habits', { focusHabitId: habit.id })}>
                  <Text
                    style={[
                      styles.habitTitle,
                      { color: isCompleted ? colors.mutedText : colors.primaryText },
                      isCompleted && styles.habitTitleCompleted,
                    ]}
                    numberOfLines={1}
                  >
                    {habit.name}
                  </Text>
                  <View style={styles.tagRow}>
                    <Text style={[styles.categoryTag, { color: colors.secondaryText }]}>{habit.category}</Text>
                    <Text style={[styles.tagDivider, { color: colors.mutedText }]}>•</Text>
                    <Text style={[styles.streakTag, { color: colors.accent }]}>🔥 {habit.streak}d streak</Text>
                    <Text style={[styles.tagDivider, { color: colors.mutedText }]}>•</Text>
                    <Text style={[styles.freqTag, { color: colors.mutedText }]}>{habit.targetFrequency}</Text>
                  </View>
                  {enabledReminders.length > 0 && (
                    <View style={[styles.reminderPill, { backgroundColor: `${habit.color}18`, opacity: isCompleted ? 0.6 : 1 }]}>
                      <Ionicons name="notifications-outline" size={11} color={habit.color} />
                      <Text style={[styles.reminderText, { color: habit.color }]}>
                        {enabledReminders.map(r => formatReminderTime(r.hour, r.minute)).join(', ')}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>

                {/* Big Interactive Checkbox */}
                {habit.habitKind === 'quit' || habit.trackingMethod === 'count' || habit.trackingMethod === 'measurable' ? (
                  <HabitTrackingControl key={`${habit.id}-${selectedDate}-${habit.logs?.find(log => log.date === selectedDate)?.value ?? 0}-${habit.logs?.find(log => log.date === selectedDate)?.outcome ?? ''}`} habit={habit} date={selectedDate} onSave={recordHabitLog} />
                ) : <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`${habit.completedDates.includes(selectedDate) ? 'Undo' : 'Complete'} ${habit.name} for ${selectedDate}`}
                  style={[
                    styles.checkbox,
                    {
                      borderColor: isCompleted ? habit.color : colors.border,
                      backgroundColor: isCompleted ? habit.color : colors.secondaryBackground,
                    },
                  ]}
                  activeOpacity={0.6}
                  onPress={() => { toggleHabit(habit.id, selectedDate); if (preferences.hapticsEnabled) void Haptics.selectionAsync().catch(() => {}); }}
                >
                  {isCompleted && (
                    <Ionicons name="checkmark" size={18} color="#000" />
                  )}
                </TouchableOpacity>}
                {preferences.dashboardSort === 'custom' && selectedCategory === 'All' && <View style={styles.reorderControls}>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Move ${habit.name} up`} accessibilityState={{ disabled: habitIndex === 0 }} disabled={habitIndex === 0} onPress={() => moveHabit(habit.id, filteredHabits[habitIndex - 1]?.id ?? '')} style={styles.reorderButton}><Ionicons name="chevron-up" size={18} color={habitIndex === 0 ? colors.mutedText : colors.secondaryText} /></TouchableOpacity>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Move ${habit.name} down`} accessibilityState={{ disabled: habitIndex === filteredHabits.length - 1 }} disabled={habitIndex === filteredHabits.length - 1} onPress={() => moveHabit(habit.id, filteredHabits[habitIndex + 1]?.id ?? '')} style={styles.reorderButton}><Ionicons name="chevron-down" size={18} color={habitIndex === filteredHabits.length - 1 ? colors.mutedText : colors.secondaryText} /></TouchableOpacity>
                </View>}
              </View>
            );
          })}

          {filteredHabits.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="leaf-outline" size={40} color={colors.secondaryText} />
              <Text style={[styles.emptyTitle, { color: colors.primaryText }]}>{selectedDate === todayDateStr ? 'No habits scheduled today' : 'No habits scheduled this day'}</Text>
              <TouchableOpacity
                style={[styles.emptyButton, { backgroundColor: colors.card, borderColor: colors.accent }]}
                onPress={() => setCreateModalVisible(true)}
              >
                <Text style={[styles.emptyButtonText, { color: colors.accent }]}>+ Create New Habit</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Floating Action Button for Quick Habit Creation */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.accent, bottom: insets.bottom + 80 }]}
        activeOpacity={0.8}
        onPress={requestCreateHabit}
      >
        <Ionicons name="add" size={28} color="#000" />
      </TouchableOpacity>

      {/* 14 Categories Creation Modal */}
      {createModalVisible && <CreateHabitModal
        key={createModalVisible ? 'open' : 'closed'}
        visible={createModalVisible}
        onClose={() => setCreateModalVisible(false)}
        onAddHabit={addHabit}
      />}
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
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  dateLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  greeting: { fontSize: 13, fontWeight: '600', marginTop: 5 },
  topActions: { alignItems: 'flex-end', gap: 8 },
  iconActions: { flexDirection: 'row', gap: 2 },
  topIconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  mainTitle: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 2,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.full,
    gap: 4,
  },
  addButtonText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 13,
  },
  heroCard: {
    borderRadius: radii.lg,
    padding: spacing.xl,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  weekCard: { borderWidth: 1, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.lg },
  weekHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  weekTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  todayLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  weekDay: { flex: 1, minHeight: 68, borderRadius: radii.md, justifyContent: 'center', alignItems: 'center', paddingVertical: 7 },
  weekdayLabel: { fontSize: 10, fontWeight: '700' },
  weekdayDate: { fontSize: 16, fontWeight: '800', marginTop: 2 },
  weekDot: { width: 5, height: 5, borderRadius: 3, marginTop: 4 },
  reviewHint: { fontSize: 11, marginTop: spacing.sm },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  heroCategory: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  heroStats: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 2,
  },
  percentageBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.full,
  },
  percentageText: {
    fontWeight: '800',
    fontSize: 16,
  },
  progressTrack: {
    height: 10,
    borderRadius: radii.full,
    overflow: 'hidden',
    marginVertical: spacing.sm,
  },
  progressBar: {
    height: '100%',
    borderRadius: radii.full,
  },
  heroFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  streakIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  streakText: {
    fontSize: 13,
    fontWeight: '600',
  },
  quoteSubtext: {
    fontSize: 12,
  },
  filterRow: {
    gap: 8,
    marginBottom: spacing.lg,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.full,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  habitsSection: {
    marginTop: spacing.xs,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  quickAddLink: {
    fontSize: 13,
    fontWeight: '600',
  },
  habitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
  },
  habitIconBox: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  habitMeta: {
    flex: 1,
  },
  reorderControls: { justifyContent: 'center', marginLeft: 4 },
  reorderButton: { minWidth: 40, minHeight: 34, alignItems: 'center', justifyContent: 'center' },
  habitTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  habitTitleCompleted: {
    textDecorationLine: 'line-through',
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    flexWrap: 'wrap',
  },
  categoryTag: {
    fontSize: 12,
  },
  tagDivider: {
    marginHorizontal: 5,
  },
  streakTag: {
    fontSize: 12,
    fontWeight: '500',
  },
  freqTag: {
    fontSize: 11,
  },
  reminderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginTop: 5,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: radii.sm,
  },
  reminderText: {
    fontSize: 11,
    fontWeight: '600',
  },
  checkbox: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  emptyButton: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radii.full,
    borderWidth: 1,
  },
  emptyButtonText: {
    fontWeight: '700',
    fontSize: 13,
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
});
