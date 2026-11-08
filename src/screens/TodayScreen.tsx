// src/screens/TodayScreen.tsx
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getHabitPastelTheme } from '../theme/tokens';
import { useHabits, Habit } from '../services/HabitContext';
import { useTheme } from '../theme/ThemeProvider';
import { CreateHabitModal } from '../components/CreateHabitModal';
import { useSubscription } from '../services/SubscriptionProvider';
import { canCreateHabit } from '../services/subscriptionEntitlements';
import { PaywallModal } from '../components/PaywallModal';
import { HabitMemoModal } from '../components/HabitMemoModal';
import { FocusTimerModal } from '../components/FocusTimerModal';
import * as Haptics from 'expo-haptics';
import { usePreferences } from '../services/PreferencesContext';
import { getWeekDates } from '../domain/preferencesEngine';
import { getHabitDayStatus, isTrackableOnDate, parseLocalDate } from '../domain/habitEngine';
import { useNavigation } from '@react-navigation/native';

export const TodayScreen = () => {
  const { habits, toggleHabit, recordHabitLog, addHabit, todayDateStr, triggerCelebration } = useHabits();
  const { colors, isDark } = useTheme();
  const { isPro } = useSubscription();
  const { preferences } = usePreferences();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [inspectedDate, setInspectedDate] = useState<string | null>(null);
  const weekDates = useMemo(() => getWeekDates(todayDateStr, preferences.weekStart), [todayDateStr, preferences.weekStart]);
  const selectedDate = inspectedDate && weekDates.includes(inspectedDate) ? inspectedDate : todayDateStr;
  const dateReference = parseLocalDate(todayDateStr) ?? new Date();

  const todaysHabits = habits.filter(habit => isTrackableOnDate(habit, selectedDate, dateReference));
  const selectedCompleted = todaysHabits.filter(habit => getHabitDayStatus(habit, selectedDate, dateReference) === 'completed').length;
  const selectedCompletionRate = todaysHabits.length ? Math.round((selectedCompleted / todaysHabits.length) * 100) : 0;

  // Filter & Modals
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);
  const [memoHabit, setMemoHabit] = useState<Habit | null>(null);
  const [timerHabit, setTimerHabit] = useState<Habit | null>(null);

  const requestCreateHabit = () => {
    if (!canCreateHabit(habits.length, isPro)) setPaywallVisible(true);
    else setCreateModalVisible(true);
  };

  const availableCategories = ['All', ...Array.from(new Set(todaysHabits.map(h => h.category)))];

  const filteredHabits = todaysHabits.filter(h => {
    if (selectedCategory === 'All') return true;
    return h.category === selectedCategory;
  });

  const handleTrackAction = (habit: Habit) => {
    if (preferences.hapticsEnabled) void Haptics.selectionAsync().catch(() => {});

    if (habit.habitKind === 'quit') {
      const isLapse = habit.logs?.find(log => log.date === selectedDate)?.outcome === 'lapse';
      const result = recordHabitLog(habit.id, { date: selectedDate, outcome: isLapse ? 'completed' : 'lapse' });
      if (result.error) Alert.alert('Could not update', result.error);
      return;
    }

    if (habit.trackingMethod === 'count' || habit.trackingMethod === 'measurable') {
      const currentVal = habit.logs?.find(log => log.date === selectedDate)?.value ?? (habit.completedDates.includes(selectedDate) ? (habit.targetValue ?? 1) : 0);
      const target = habit.targetValue ?? 1;
      const nextVal = currentVal >= target ? 0 : currentVal + (habit.trackingMethod === 'measurable' && target >= 100 ? 250 : 1);
      const result = recordHabitLog(habit.id, {
        date: selectedDate,
        value: nextVal,
        outcome: nextVal >= target ? 'completed' : undefined,
      });
      if (result.error) Alert.alert('Could not update', result.error);
      else if (nextVal >= target && selectedCompleted + 1 >= todaysHabits.length) {
        triggerCelebration();
      }
      return;
    }

    // Standard yes/no toggle
    toggleHabit(habit.id, selectedDate);
    const wasCompleted = getHabitDayStatus(habit, selectedDate, dateReference) === 'completed';
    if (!wasCompleted && selectedCompleted + 1 >= todaysHabits.length) {
      triggerCelebration();
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: isDark ? '#101117' : '#FAF9F7', paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 90 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Bar matching screen 1.png */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={[styles.categoryPill, { backgroundColor: colors.accent }]}
            onPress={() => setCategoryPickerVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.categoryPillText}>{selectedCategory}</Text>
            <Ionicons name="chevron-down" size={14} color="#FFFFFF" style={{ marginLeft: 4 }} />
          </TouchableOpacity>

          <Text style={[styles.topTitle, { color: colors.primaryText }]}>Today</Text>

          <View style={styles.topRight}>
            <TouchableOpacity
              style={[styles.topAddBtn, { backgroundColor: `${colors.accent}1F` }]}
              onPress={requestCreateHabit}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={20} color={colors.accent} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.mascotBtn}
              onPress={() => {
                if (selectedCompletionRate === 100 && todaysHabits.length > 0) {
                  triggerCelebration();
                } else {
                  navigation.navigate('Profile');
                }
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.mascotEmoji}>😊</Text>
              {selectedCompletionRate === 100 && (
                <View style={[styles.mascotBadge, { backgroundColor: colors.accent }]} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* 7-Day Week Strip with Crowns matching screen 1.png */}
        <View style={styles.weekStripContainer}>
          {weekDates.map(date => {
            const parsed = parseLocalDate(date)!;
            const isSelected = date === selectedDate;
            const isToday = date === todayDateStr;
            const weekdayShort = new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)).slice(0, 2);

            const dayTrackable = habits.filter(h => isTrackableOnDate(h, date, dateReference));
            const dayCompleted = dayTrackable.filter(h => getHabitDayStatus(h, date, dateReference) === 'completed').length;
            const isAllCompleted = dayTrackable.length > 0 && dayCompleted === dayTrackable.length;
            const hasCompleted = dayCompleted > 0;

            return (
              <TouchableOpacity
                key={date}
                onPress={() => setInspectedDate(date)}
                style={styles.weekDayCol}
                activeOpacity={0.7}
              >
                <Text style={[styles.weekDayLabel, { color: isSelected ? colors.accent : colors.secondaryText }]}>
                  {weekdayShort}
                </Text>

                <View style={styles.circleContainer}>
                  {/* Cute Crown atop completed days */}
                  {isAllCompleted ? (
                    <Text style={styles.crownEmoji}>👑</Text>
                  ) : hasCompleted ? (
                    <Text style={[styles.crownEmoji, { opacity: 0.5 }]}>👑</Text>
                  ) : (
                    <View style={{ height: 14 }} />
                  )}

                  <View
                    style={[
                      styles.dayCircle,
                      {
                        backgroundColor: isDark ? '#1C1E28' : '#FFFFFF',
                        borderColor: isSelected ? colors.accent : isToday ? `${colors.accent}66` : isDark ? '#262938' : '#E8EBF2',
                        borderWidth: isSelected ? 2 : 1.5,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayNumberText,
                        {
                          color: isSelected ? colors.accent : colors.primaryText,
                          fontWeight: isSelected ? '800' : '600',
                        },
                      ]}
                    >
                      {parsed.getDate()}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Habit List Section matching screen 1.png & screen 9.png */}
        <View style={styles.habitList}>
          {filteredHabits.map((habit, index) => {
            const isCompleted = getHabitDayStatus(habit, selectedDate, dateReference) === 'completed';
            const pastel = getHabitPastelTheme(habit, isDark);

            const currentVal = habit.logs?.find(log => log.date === selectedDate)?.value ?? (habit.completedDates.includes(selectedDate) ? (habit.targetValue ?? 1) : 0);
            const target = habit.targetValue ?? 1;

            let progressRate = isCompleted ? 100 : 0;
            let subtitle = '1/1';
            if (habit.trackingMethod === 'count' || habit.trackingMethod === 'measurable') {
              progressRate = Math.min(100, Math.round((currentVal / target) * 100));
              subtitle = `${currentVal}/${target} ${habit.unit || ''}`.trim();
            } else if (habit.habitKind === 'quit') {
              const isLapse = habit.logs?.find(log => log.date === selectedDate)?.outcome === 'lapse';
              subtitle = isLapse ? 'Lapse logged' : 'Restraint kept';
              progressRate = isLapse ? 0 : 100;
            }

            return (
              <TouchableOpacity
                key={habit.id}
                activeOpacity={0.85}
                onPress={() => setMemoHabit(habit)}
                style={[
                  styles.habitCard,
                  {
                    backgroundColor: isDark ? '#1A1C26' : pastel.bg,
                    borderColor: isCompleted ? (isDark ? pastel.fill : pastel.border) : 'transparent',
                  },
                ]}
              >
                {/* Horizontal Progress Bar Fill (screen 9.png) */}
                <View
                  style={[
                    styles.cardProgressFill,
                    {
                      width: `${Math.min(100, Math.max(0, progressRate))}%`,
                      backgroundColor: isDark ? `${pastel.fill}33` : `${pastel.fill}66`,
                    },
                  ]}
                />

                <View style={styles.cardContent}>
                  {/* Left Habit Icon */}
                  <View
                    style={[
                      styles.iconCircle,
                      {
                        backgroundColor: isDark ? '#26293A' : '#FFFFFF',
                      },
                    ]}
                  >
                    <Ionicons name={habit.icon as any} size={22} color={pastel.text} />
                  </View>

                  {/* Habit Name & Progress Subtitle */}
                  <View style={styles.cardInfoCol}>
                    <Text
                      style={[
                        styles.habitTitle,
                        { color: isDark ? '#FFFFFF' : '#1A1D24' },
                        isCompleted && styles.habitTitleDone,
                      ]}
                      numberOfLines={1}
                    >
                      {habit.name}
                    </Text>
                    <Text style={[styles.habitSubtitle, { color: isDark ? '#9EA5B5' : '#606778' }]}>
                      {subtitle}
                    </Text>
                  </View>

                  {/* Streak Flame Badge */}
                  <View style={styles.streakBadge}>
                    <Text style={styles.streakText}>🔥 {habit.streak} {habit.streak === 1 ? 'Day' : 'Days'}</Text>
                  </View>

                  {/* Right Action Button: + or Green Checkmark */}
                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      isCompleted
                        ? styles.actionBtnDone
                        : [
                            styles.actionBtnIncomplete,
                            {
                              backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.85)',
                            },
                          ],
                    ]}
                    onPress={() => handleTrackAction(habit)}
                    activeOpacity={0.7}
                  >
                    {isCompleted ? (
                      <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                    ) : (
                      <Ionicons name="add" size={20} color={isDark ? '#FFFFFF' : '#333333'} />
                    )}
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          })}

          {filteredHabits.length === 0 && (
            <View style={[styles.emptyBox, { backgroundColor: isDark ? '#1A1C26' : '#FFFFFF' }]}>
              <Ionicons name="sparkles-outline" size={36} color={colors.accent} />
              <Text style={[styles.emptyTitle, { color: colors.primaryText }]}>No habits scheduled</Text>
              <Text style={[styles.emptySubtitle, { color: colors.secondaryText }]}>
                Tap the + button above to create a new habit.
              </Text>
              <TouchableOpacity
                style={[styles.emptyAddBtn, { backgroundColor: colors.accent }]}
                onPress={requestCreateHabit}
              >
                <Text style={styles.emptyAddText}>+ Create First Habit</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Category Picker Modal */}
      <Modal visible={categoryPickerVisible} transparent animationType="fade" onRequestClose={() => setCategoryPickerVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setCategoryPickerVisible(false)}>
          <View style={[styles.pickerCard, { backgroundColor: isDark ? '#1C1E2A' : '#FFFFFF' }]}>
            <Text style={[styles.pickerTitle, { color: colors.primaryText }]}>Filter by Category</Text>
            {availableCategories.map(cat => {
              const isActive = selectedCategory === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  style={[styles.categoryOption, isActive && { backgroundColor: `${colors.accent}1A` }]}
                  onPress={() => {
                    setSelectedCategory(cat);
                    setCategoryPickerVisible(false);
                  }}
                >
                  <Text style={[styles.categoryOptionText, { color: isActive ? colors.accent : colors.primaryText }]}>
                    {cat}
                  </Text>
                  {isActive && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Habit Memo / Diary Modal (screen 7.png) */}
      <HabitMemoModal
        visible={Boolean(memoHabit)}
        habit={memoHabit}
        date={selectedDate}
        initialNote={memoHabit?.logs?.find(l => l.date === selectedDate)?.note ?? ''}
        onClose={() => setMemoHabit(null)}
        onSave={(habitId, date, note, mood) => {
          const formattedNote = mood ? `[Mood: ${mood}] ${note}`.trim() : note;
          recordHabitLog(habitId, { date, note: formattedNote });
        }}
      />

      {/* Focus Timer Modal (screen 6.png) */}
      <FocusTimerModal
        visible={Boolean(timerHabit)}
        habit={timerHabit}
        onClose={() => setTimerHabit(null)}
        onCompleteSession={(habitId, mins) => {
          recordHabitLog(habitId, { date: selectedDate, value: mins, outcome: 'completed' });
        }}
      />

      <CreateHabitModal
        visible={createModalVisible}
        onClose={() => setCreateModalVisible(false)}
        onAddHabit={addHabit}
      />
      <PaywallModal visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 12,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    shadowColor: '#FF5264',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  categoryPillText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  topTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  topAddBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mascotBtn: {
    position: 'relative',
    padding: 2,
  },
  mascotEmoji: {
    fontSize: 26,
  },
  mascotBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  weekStripContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 14,
    paddingVertical: 8,
  },
  weekDayCol: {
    alignItems: 'center',
    flex: 1,
  },
  weekDayLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  circleContainer: {
    alignItems: 'center',
  },
  crownEmoji: {
    fontSize: 12,
    height: 14,
    lineHeight: 14,
  },
  dayCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  dayNumberText: {
    fontSize: 14,
  },
  habitList: {
    gap: 12,
    marginTop: 8,
  },
  habitCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardProgressFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: 18,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 12,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardInfoCol: {
    flex: 1,
  },
  habitTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  habitTitleDone: {
    opacity: 0.85,
  },
  habitSubtitle: {
    fontSize: 12,
    fontWeight: '500',
  },
  streakBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 122, 0, 0.12)',
  },
  streakText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FF7A00',
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnIncomplete: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  actionBtnDone: {
    backgroundColor: '#4CAF50',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 3,
  },
  emptyBox: {
    padding: 36,
    borderRadius: 20,
    alignItems: 'center',
    marginTop: 20,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
  },
  emptyAddBtn: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  emptyAddText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  pickerCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 20,
    padding: 20,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
  },
  categoryOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  categoryOptionText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
