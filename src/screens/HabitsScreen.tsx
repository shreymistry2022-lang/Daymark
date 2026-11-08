// src/screens/HabitsScreen.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getHabitPastelTheme } from '../theme/tokens';
import { useHabits, Habit } from '../services/HabitContext';
import { useTheme } from '../theme/ThemeProvider';
import { CreateHabitModal } from '../components/CreateHabitModal';
import { PauseHabitModal } from '../components/PauseHabitModal';
import { HABIT_CATEGORIES } from '../constants/categories';
import { useSubscription } from '../services/SubscriptionProvider';
import { canCreateHabit } from '../services/subscriptionEntitlements';
import { PaywallModal } from '../components/PaywallModal';
import {
  addLocalDays,
  calculateStreakStats,
  getHabitDayStatus,
  parseLocalDate,
} from '../domain/habitEngine';
import { useNavigation, useRoute } from '@react-navigation/native';

export const HabitsScreen = () => {
  const {
    habits,
    archivedHabits,
    allHabits,
    toggleHabit,
    addHabit,
    updateHabit,
    archiveHabit,
    pauseHabit,
    resumeHabit,
    deleteHabit,
    todayDateStr,
  } = useHabits();
  const { colors, isDark } = useTheme();
  const { isPro } = useSubscription();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  // Modes: 'track' (screen 3 & 12 calendar/stats) or 'list' (catalog)
  const [viewMode, setViewMode] = useState<'track' | 'list'>('track');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(habits[0]?.id ?? null);
  const [showHabitDropdown, setShowHabitDropdown] = useState(false);

  // Month navigation for Track Calendar
  const todayDate = useMemo(() => parseLocalDate(todayDateStr) ?? new Date(), [todayDateStr]);
  const [calendarYear, setCalendarYear] = useState<number>(todayDate.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState<number>(todayDate.getMonth()); // 0-11

  // Modals
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [pauseModalHabit, setPauseModalHabit] = useState<Habit | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);

  const selectedHabit = useMemo(() => {
    const targetId = selectedHabitId ?? habits[0]?.id;
    return allHabits.find(h => h.id === targetId) ?? habits[0] ?? null;
  }, [allHabits, habits, selectedHabitId]);

  const requestCreateHabit = () => {
    if (!canCreateHabit(habits.length, isPro)) setPaywallVisible(true);
    else {
      setEditingHabit(null);
      setCreateModalVisible(true);
    }
  };

  useEffect(() => {
    const focusHabitId = route.params?.focusHabitId as string | undefined;
    if (!focusHabitId) return;
    const timeout = setTimeout(() => {
      const habit = allHabits.find(item => item.id === focusHabitId);
      if (habit) {
        setShowArchived(Boolean(habit.archivedAt));
        setSelectedHabitId(habit.id);
        setViewMode('track');
      }
      navigation.setParams({ focusHabitId: undefined });
    }, 0);
    return () => clearTimeout(timeout);
  }, [route.params?.focusHabitId, allHabits, navigation]);

  const categoriesList = ['All', ...HABIT_CATEGORIES.map(c => c.name)];
  const todayReferenceDate = useMemo(() => parseLocalDate(todayDateStr) ?? new Date(), [todayDateStr]);

  const filteredHabits = (showArchived ? archivedHabits : habits).filter(h => {
    const matchesSearch = h.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = selectedCategory === 'All' || h.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const selectedHabitStats = selectedHabit ? calculateStreakStats(selectedHabit) : null;

  // Calendar month days calculation
  const monthName = useMemo(() => {
    const d = new Date(calendarYear, calendarMonth, 1);
    return d.toLocaleString('en-US', { month: 'long' });
  }, [calendarYear, calendarMonth]);

  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(calendarYear, calendarMonth, 1);
    const totalDays = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const startDayIndex = firstDayOfMonth.getDay(); // 0 is Sunday

    const days: { day: number; dateStr: string; isCurrentMonth: boolean }[] = [];

    // Previous month padding
    const prevMonthDays = new Date(calendarYear, calendarMonth, 0).getDate();
    for (let i = startDayIndex - 1; i >= 0; i--) {
      const dayNum = prevMonthDays - i;
      const prevMonth = calendarMonth === 0 ? 11 : calendarMonth - 1;
      const prevYear = calendarMonth === 0 ? calendarYear - 1 : calendarYear;
      const dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      days.push({ day: dayNum, dateStr, isCurrentMonth: false });
    }

    // Current month days
    for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
      const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      days.push({ day: dayNum, dateStr, isCurrentMonth: true });
    }

    // Next month padding to fill complete weeks (multiples of 7)
    const remaining = (7 - (days.length % 7)) % 7;
    for (let dayNum = 1; dayNum <= remaining; dayNum++) {
      const nextMonth = calendarMonth === 11 ? 0 : calendarMonth + 1;
      const nextYear = calendarMonth === 11 ? calendarYear + 1 : calendarYear;
      const dateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      days.push({ day: dayNum, dateStr, isCurrentMonth: false });
    }

    return days;
  }, [calendarYear, calendarMonth]);

  const monthSuccessDays = useMemo(() => {
    if (!selectedHabit) return 0;
    return calendarDays
      .filter(d => d.isCurrentMonth)
      .reduce((count, d) => {
        return getHabitDayStatus(selectedHabit, d.dateStr) === 'completed' ? count + 1 : count;
      }, 0);
  }, [selectedHabit, calendarDays]);

  const prevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear(prev => prev - 1);
    } else {
      setCalendarMonth(prev => prev - 1);
    }
  };

  const nextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear(prev => prev + 1);
    } else {
      setCalendarMonth(prev => prev + 1);
    }
  };

  const handleDelete = (id: string, name: string) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`Are you sure you want to delete "${name}"? This cannot be undone.`)) {
        deleteHabit(id);
        setSelectedHabitId(null);
      }
      return;
    }
    Alert.alert('Delete Habit', `Are you sure you want to delete "${name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteHabit(id);
          setSelectedHabitId(null);
        },
      },
    ]);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Top Header Bar matching screen 3.png */}
      <View style={styles.topBar}>
        {/* Left: Mode toggle (List vs Track) */}
        <TouchableOpacity
          accessibilityLabel="Toggle view mode"
          style={[styles.circleActionBtn, { backgroundColor: '#FF526422' }]}
          onPress={() => setViewMode(prev => (prev === 'track' ? 'list' : 'track'))}
        >
          <Ionicons
            name={viewMode === 'track' ? 'reorder-three-outline' : 'calendar-outline'}
            size={20}
            color="#FF5264"
          />
        </TouchableOpacity>

        {/* Center: Habit Selector Dropdown e.g. 🤸 Yoga ▾ */}
        {viewMode === 'track' && selectedHabit ? (
          <TouchableOpacity
            style={styles.habitDropdownBtn}
            onPress={() => setShowHabitDropdown(prev => !prev)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={selectedHabit.icon as any}
              size={18}
              color={selectedHabit.color || '#FF5264'}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.habitDropdownText, { color: colors.primaryText }]}>
              {selectedHabit.name}
            </Text>
            <Ionicons name="chevron-down" size={14} color={colors.secondaryText} style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        ) : (
          <Text style={[styles.screenTitle, { color: colors.primaryText }]}>
            {viewMode === 'list' ? 'All Habits' : 'Habit Tracker'}
          </Text>
        )}

        {/* Right: + Add habit button */}
        <TouchableOpacity
          accessibilityLabel="Add new habit"
          style={[styles.circleActionBtn, { backgroundColor: '#FF5264' }]}
          onPress={requestCreateHabit}
        >
          <Ionicons name="add" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Habit Dropdown Modal / Picker */}
      {showHabitDropdown && (
        <Modal transparent animationType="fade" visible={showHabitDropdown} onRequestClose={() => setShowHabitDropdown(false)}>
          <TouchableOpacity
            style={styles.dropdownOverlay}
            activeOpacity={1}
            onPress={() => setShowHabitDropdown(false)}
          >
            <View
              style={[
                styles.dropdownMenu,
                {
                  backgroundColor: isDark ? '#1C1E28' : '#FFFFFF',
                  borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                  top: insets.top + 50,
                },
              ]}
            >
              <ScrollView style={{ maxHeight: 280 }}>
                {habits.map(h => {
                  const isSelected = h.id === selectedHabit?.id;
                  return (
                    <TouchableOpacity
                      key={h.id}
                      style={[
                        styles.dropdownItem,
                        isSelected && { backgroundColor: `${colors.accent}14` },
                      ]}
                      onPress={() => {
                        setSelectedHabitId(h.id);
                        setShowHabitDropdown(false);
                      }}
                    >
                      <Ionicons name={h.icon as any} size={18} color={h.color || colors.accent} />
                      <Text
                        style={[
                          styles.dropdownItemText,
                          { color: colors.primaryText, fontWeight: isSelected ? '700' : '500' },
                        ]}
                      >
                        {h.name}
                      </Text>
                      {isSelected && <Ionicons name="checkmark" size={16} color={colors.accent} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Horizontal Habit Icon Strip matching screen 3.png */}
      <View style={styles.iconStripContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.iconStrip}>
          <TouchableOpacity
            style={[
              styles.allChip,
              viewMode === 'list'
                ? { backgroundColor: '#FF5264', borderColor: '#FF5264' }
                : { backgroundColor: isDark ? '#1C1E28' : '#FFFFFF', borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' },
            ]}
            onPress={() => setViewMode('list')}
          >
            <Text
              style={[
                styles.allChipText,
                { color: viewMode === 'list' ? '#FFFFFF' : colors.secondaryText },
              ]}
            >
              All
            </Text>
          </TouchableOpacity>

          {habits.map(habit => {
            const isSelected = viewMode === 'track' && habit.id === selectedHabit?.id;
            return (
              <TouchableOpacity
                key={habit.id}
                style={[
                  styles.habitIconChip,
                  {
                    backgroundColor: isSelected
                      ? `${habit.color || colors.accent}25`
                      : isDark
                      ? '#1C1E28'
                      : '#FFFFFF',
                    borderColor: isSelected
                      ? habit.color || colors.accent
                      : isDark
                      ? 'rgba(255,255,255,0.06)'
                      : 'rgba(0,0,0,0.05)',
                  },
                ]}
                onPress={() => {
                  setSelectedHabitId(habit.id);
                  setViewMode('track');
                }}
              >
                <Ionicons
                  name={habit.icon as any}
                  size={20}
                  color={habit.color || colors.accent}
                />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Main Content Area */}
      {viewMode === 'track' && selectedHabit ? (
        /* Track Habits & Calendar View matching screen 3.png & screen 12.png */
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 90 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Monthly Calendar Card with Crowns 👑 */}
          <View
            style={[
              styles.cardBox,
              {
                backgroundColor: isDark ? '#1C1E28' : '#FFFFFF',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
              },
            ]}
          >
            {/* Header: < 2025/12 > */}
            <View style={styles.calendarHeaderRow}>
              <TouchableOpacity onPress={prevMonth} style={styles.monthNavBtn}>
                <Ionicons name="chevron-back" size={16} color={colors.primaryText} />
              </TouchableOpacity>
              <Text style={[styles.calendarMonthText, { color: colors.primaryText }]}>
                {calendarYear}/{String(calendarMonth + 1).padStart(2, '0')}
              </Text>
              <TouchableOpacity onPress={nextMonth} style={styles.monthNavBtn}>
                <Ionicons name="chevron-forward" size={16} color={colors.primaryText} />
              </TouchableOpacity>
            </View>

            {/* Weekday Labels: S M T W T F S */}
            <View style={styles.weekdayRow}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                <View key={idx} style={styles.weekdayCol}>
                  <Text style={[styles.weekdayText, { color: colors.secondaryText }]}>{day}</Text>
                </View>
              ))}
            </View>

            {/* Calendar Days Matrix */}
            <View style={styles.daysGrid}>
              {calendarDays.map((item, idx) => {
                const status = getHabitDayStatus(selectedHabit, item.dateStr);
                const isCompleted = status === 'completed';
                const isToday = item.dateStr === todayDateStr;

                return (
                  <TouchableOpacity
                    key={idx}
                    style={styles.dayCol}
                    activeOpacity={0.7}
                    onPress={() => {
                      if (item.dateStr === todayDateStr) {
                        toggleHabit(selectedHabit.id);
                      }
                    }}
                  >
                    {/* Crown 👑 on top if completed */}
                    <View style={styles.crownContainer}>
                      {isCompleted ? <Text style={styles.crownIcon}>👑</Text> : null}
                    </View>

                    {/* Day circle */}
                    <View
                      style={[
                        styles.dayCircle,
                        isToday && { borderColor: '#FF5264', borderWidth: 1.5 },
                        isCompleted && {
                          backgroundColor: `${selectedHabit.color || '#FF5264'}22`,
                          borderColor: selectedHabit.color || '#FF5264',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayNumber,
                          {
                            color: !item.isCurrentMonth
                              ? colors.mutedText
                              : isToday
                              ? '#FF5264'
                              : colors.primaryText,
                            fontWeight: isToday || isCompleted ? '700' : '400',
                          },
                        ]}
                      >
                        {item.day}
                      </Text>
                    </View>

                    {/* Tiny today dot */}
                    {isToday && <View style={styles.todayDot} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Yearly Status Heatmap Card */}
          <View
            style={[
              styles.cardBox,
              {
                backgroundColor: isDark ? '#1C1E28' : '#FFFFFF',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                marginTop: 14,
              },
            ]}
          >
            <View style={styles.yearlyHeaderRow}>
              <Text style={[styles.cardTitle, { color: colors.primaryText }]}>Yearly Status</Text>
              <View style={styles.yearPill}>
                <Text style={styles.yearPillText}>{calendarYear} ▾</Text>
              </View>
            </View>

            {/* Micro contribution heatmap */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.microHeatmap}>
                {Array.from({ length: 32 }, (_, colIdx) => (
                  <View key={colIdx} style={styles.heatmapColumn}>
                    {Array.from({ length: 7 }, (_, rowIdx) => {
                      const dayOffset = -(colIdx * 7 + rowIdx);
                      const dStr = addLocalDays(todayDateStr, dayOffset);
                      const isDone = selectedHabit.completedDates.includes(dStr);
                      return (
                        <View
                          key={rowIdx}
                          style={[
                            styles.heatmapCell,
                            {
                              backgroundColor: isDone
                                ? selectedHabit.color || '#FF5264'
                                : isDark
                                ? 'rgba(255,255,255,0.06)'
                                : '#F1F2F6',
                            },
                          ]}
                        />
                      );
                    })}
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>

          {/* Records (4-card metric tiles) matching screen 3.png & screen 12.png */}
          <View style={styles.recordsGrid}>
            {/* Tile 1: Days in Month */}
            <View
              style={[
                styles.recordTile,
                {
                  backgroundColor: isDark ? '#1C1E28' : '#FFFFFF',
                  borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                },
              ]}
            >
              <View style={[styles.tileIconCircle, { backgroundColor: '#38BDF820' }]}>
                <Ionicons name="calendar" size={18} color="#38BDF8" />
              </View>
              <Text style={[styles.tileBigNum, { color: colors.primaryText }]}>
                {monthSuccessDays}{' '}
                <Text style={[styles.tileUnit, { color: colors.secondaryText }]}>Days</Text>
              </Text>
              <Text style={[styles.tileSub, { color: colors.secondaryText }]}>
                success in {monthName}
              </Text>
            </View>

            {/* Tile 2: Total Success */}
            <View
              style={[
                styles.recordTile,
                {
                  backgroundColor: isDark ? '#1C1E28' : '#FFFFFF',
                  borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                },
              ]}
            >
              <View style={[styles.tileIconCircle, { backgroundColor: '#10B98120' }]}>
                <Ionicons name="checkmark-done" size={18} color="#10B981" />
              </View>
              <Text style={[styles.tileBigNum, { color: colors.primaryText }]}>
                {selectedHabit.completedDates.length}{' '}
                <Text style={[styles.tileUnit, { color: colors.secondaryText }]}>Days</Text>
              </Text>
              <Text style={[styles.tileSub, { color: colors.secondaryText }]}>Total Success</Text>
            </View>

            {/* Tile 3: Current Streak */}
            <View
              style={[
                styles.recordTile,
                {
                  backgroundColor: isDark ? '#1C1E28' : '#FFFFFF',
                  borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                },
              ]}
            >
              <View style={[styles.tileIconCircle, { backgroundColor: '#A855F720' }]}>
                <Ionicons name="flame" size={18} color="#A855F7" />
              </View>
              <Text style={[styles.tileBigNum, { color: colors.primaryText }]}>
                {selectedHabit.streak}{' '}
                <Text style={[styles.tileUnit, { color: colors.secondaryText }]}>Day</Text>
              </Text>
              <Text style={[styles.tileSub, { color: colors.secondaryText }]}>Current Streak</Text>
            </View>

            {/* Tile 4: Best Streak */}
            <View
              style={[
                styles.recordTile,
                {
                  backgroundColor: isDark ? '#1C1E28' : '#FFFFFF',
                  borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                },
              ]}
            >
              <View style={[styles.tileIconCircle, { backgroundColor: '#F59E0B20' }]}>
                <Ionicons name="trophy" size={18} color="#F59E0B" />
              </View>
              <Text style={[styles.tileBigNum, { color: colors.primaryText }]}>
                {selectedHabitStats?.bestStreak ?? 0}{' '}
                <Text style={[styles.tileUnit, { color: colors.secondaryText }]}>Days</Text>
              </Text>
              <Text style={[styles.tileSub, { color: colors.secondaryText }]}>Best Streak</Text>
            </View>
          </View>

          {/* Action buttons for selected habit */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.manageBtn, { backgroundColor: `${colors.accent}15` }]}
              onPress={() => {
                setEditingHabit(selectedHabit);
                setCreateModalVisible(true);
              }}
            >
              <Ionicons name="create-outline" size={16} color={colors.accent} />
              <Text style={[styles.manageBtnText, { color: colors.accent }]}>Edit</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.manageBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6' }]}
              onPress={() => setPauseModalHabit(selectedHabit)}
            >
              <Ionicons name="pause-outline" size={16} color={colors.secondaryText} />
              <Text style={[styles.manageBtnText, { color: colors.secondaryText }]}>Pause</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.manageBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6' }]}
              onPress={() => archiveHabit(selectedHabit.id)}
            >
              <Ionicons name="archive-outline" size={16} color={colors.secondaryText} />
              <Text style={[styles.manageBtnText, { color: colors.secondaryText }]}>Archive</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.manageBtn, { backgroundColor: '#FEE2E2' }]}
              onPress={() => handleDelete(selectedHabit.id, selectedHabit.name)}
            >
              <Ionicons name="trash-outline" size={16} color="#EF4444" />
              <Text style={[styles.manageBtnText, { color: "#EF4444" }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
        /* List Catalog View */
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 90 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Search Bar */}
          <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="search-outline" size={18} color={colors.secondaryText} />
            <TextInput
              style={[styles.searchInput, { color: colors.primaryText }]}
              placeholder="Search habits..."
              placeholderTextColor={colors.mutedText}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color={colors.secondaryText} />
              </TouchableOpacity>
            )}
          </View>

          {/* Filter Chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {categoriesList.map(cat => {
              const isActive = selectedCategory === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: isActive ? '#FF5264' : colors.card,
                      borderColor: isActive ? '#FF5264' : colors.border,
                    },
                  ]}
                  onPress={() => setSelectedCategory(cat)}
                >
                  <Text style={{ color: isActive ? '#FFFFFF' : colors.secondaryText, fontSize: 12, fontWeight: '600' }}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Habits List */}
          <View style={styles.listStack}>
            {filteredHabits.map(h => {
              const pastel = getHabitPastelTheme(h, isDark);
              const isCompleted = getHabitDayStatus(h, todayDateStr, todayReferenceDate) === 'completed';
              return (
                <TouchableOpacity
                  key={h.id}
                  style={[
                    styles.habitListCard,
                    {
                      backgroundColor: pastel.bg,
                      borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                    },
                  ]}
                  onPress={() => {
                    setSelectedHabitId(h.id);
                    setViewMode('track');
                  }}
                >
                  <View style={[styles.listIconCircle, { backgroundColor: '#FFFFFF' }]}>
                    <Ionicons name={h.icon as any} size={20} color={h.color || '#FF5264'} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.listCardTitle, { color: pastel.text }]}>{h.name}</Text>
                    <Text style={[styles.listCardSub, { color: colors.secondaryText }]}>
                      🔥 {h.streak}d streak · {h.targetFrequency}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.listCheckBtn,
                      isCompleted ? { backgroundColor: '#10B981' } : { backgroundColor: 'rgba(255,255,255,0.8)' },
                    ]}
                    onPress={() => toggleHabit(h.id)}
                  >
                    <Ionicons
                      name={isCompleted ? 'checkmark' : 'add'}
                      size={18}
                      color={isCompleted ? '#FFFFFF' : '#8E95A5'}
                    />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* Create / Edit Habit Modal */}
      <CreateHabitModal
        visible={createModalVisible}
        onClose={() => {
          setCreateModalVisible(false);
          setEditingHabit(null);
        }}
        onAddHabit={addHabit}
        initialHabit={editingHabit}
        onUpdateHabit={updateHabit}
        onDeleteHabit={deleteHabit}
        onPauseHabit={pauseHabit}
        onResumeHabit={resumeHabit}
      />

      {/* Pause Habit Modal */}
      <PauseHabitModal
        visible={!!pauseModalHabit}
        habit={pauseModalHabit}
        todayDateStr={todayDateStr}
        onClose={() => setPauseModalHabit(null)}
        onConfirmPause={(id: string, start: string, end: string | null) => {
          pauseHabit(id, start, end);
          setPauseModalHabit(null);
        }}
      />

      {/* Paywall Modal */}
      <PaywallModal visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 10,
  },
  circleActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  habitDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 82, 100, 0.08)',
  },
  habitDropdownText: {
    fontSize: 16,
    fontWeight: '800',
  },
  screenTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  dropdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  dropdownMenu: {
    position: 'absolute',
    width: 240,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  dropdownItemText: {
    flex: 1,
    fontSize: 14,
  },
  iconStripContainer: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.04)',
  },
  iconStrip: {
    paddingHorizontal: 18,
    gap: 12,
    alignItems: 'center',
  },
  allChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
  },
  allChipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  habitIconChip: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  cardBox: {
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  calendarHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 18,
    marginBottom: 12,
  },
  monthNavBtn: {
    padding: 4,
  },
  calendarMonthText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  weekdayCol: {
    width: 36,
    alignItems: 'center',
  },
  weekdayText: {
    fontSize: 12,
    fontWeight: '700',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
  },
  dayCol: {
    width: 36,
    alignItems: 'center',
    marginVertical: 4,
    position: 'relative',
  },
  crownContainer: {
    height: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  crownIcon: {
    fontSize: 10,
    lineHeight: 12,
  },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayNumber: {
    fontSize: 13,
  },
  todayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FF5264',
    marginTop: 2,
  },
  yearlyHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  yearPill: {
    backgroundColor: '#FF526418',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  yearPillText: {
    color: '#FF5264',
    fontSize: 12,
    fontWeight: '700',
  },
  microHeatmap: {
    flexDirection: 'row',
    gap: 3,
    paddingVertical: 4,
  },
  heatmapColumn: {
    gap: 3,
  },
  heatmapCell: {
    width: 9,
    height: 9,
    borderRadius: 2,
  },
  recordsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 14,
  },
  recordTile: {
    flex: 1,
    minWidth: '45%',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
  },
  tileIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  tileBigNum: {
    fontSize: 22,
    fontWeight: '900',
  },
  tileUnit: {
    fontSize: 13,
    fontWeight: '600',
  },
  tileSub: {
    fontSize: 12,
    marginTop: 3,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 18,
  },
  manageBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 14,
    gap: 4,
  },
  manageBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    height: 42,
    marginBottom: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  filterRow: {
    gap: 8,
    paddingBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  listStack: {
    gap: 10,
  },
  habitListCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
  },
  listIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listCardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  listCardSub: {
    fontSize: 12,
    marginTop: 2,
  },
  listCheckBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
