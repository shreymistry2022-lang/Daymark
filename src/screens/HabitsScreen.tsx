// src/screens/HabitsScreen.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing, radii } from '../theme/tokens';
import { useHabits, Habit } from '../services/HabitContext';
import { useTheme } from '../theme/ThemeProvider';
import { CreateHabitModal } from '../components/CreateHabitModal';
import { PauseHabitModal } from '../components/PauseHabitModal';
import { HabitDetailModal } from '../components/HabitDetailModal';
import { HABIT_CATEGORIES } from '../constants/categories';
import { useSubscription } from '../services/SubscriptionProvider';
import { canCreateHabit } from '../services/subscriptionEntitlements';
import { PaywallModal } from '../components/PaywallModal';
import { getHabitDayStatus, parseLocalDate } from '../domain/habitEngine';
import { formatGapLabel, formatReminderTime } from '../services/localReminders';
import { useNavigation, useRoute } from '@react-navigation/native';
import { AnimatedPopTouchable } from '../components/AnimatedMonthGrid';

export const HabitsScreen = () => {
  const { habits, archivedHabits, allHabits, toggleHabit, recordHabitLog, addHabit, updateHabit, archiveHabit, restoreHabit, pauseHabit, resumeHabit, deleteHabit, todayDateStr } = useHabits();
  const { colors } = useTheme();
  const { isPro } = useSubscription();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [pauseModalHabit, setPauseModalHabit] = useState<Habit | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const selectedHabit = selectedHabitId ? allHabits.find(habit => habit.id === selectedHabitId) ?? null : null;
  const [paywallVisible, setPaywallVisible] = useState(false);

  const requestCreateHabit = () => {
    if (!canCreateHabit(habits.length, isPro)) setPaywallVisible(true);
    else setCreateModalVisible(true);
  };

  useEffect(() => {
    const focusHabitId = route.params?.focusHabitId as string | undefined;
    if (!focusHabitId) return;
    const timeout = setTimeout(() => {
      const habit = allHabits.find(item => item.id === focusHabitId);
      if (habit) { setShowArchived(Boolean(habit.archivedAt)); setSelectedHabitId(habit.id); }
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

  const handleDelete = (id: string, name: string) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`Are you sure you want to delete "${name}"? This cannot be undone.`)) {
        deleteHabit(id);
        setSelectedHabitId(null);
      }
      return;
    }
    Alert.alert(
      'Delete Habit',
      `Are you sure you want to delete "${name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteHabit(id);
            setSelectedHabitId(null);
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 110 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.primaryText }]}>Habits</Text>
          <View style={styles.headerRight}>
            <TouchableOpacity
              onPress={() => setShowArchived(value => !value)}
              accessibilityRole="button"
              accessibilityLabel={showArchived ? 'Show active habits' : `Show archived habits, ${archivedHabits.length}`}
              style={[
                styles.archivePill,
                {
                  backgroundColor: showArchived ? `${colors.accent}20` : colors.secondaryBackground,
                  borderColor: showArchived ? colors.accent : colors.border,
                },
              ]}
            >
              <Text style={{ color: showArchived ? colors.accent : colors.secondaryText, fontWeight: '700', fontSize: 12 }}>
                {showArchived ? 'Active' : `Archived (${archivedHabits.length})`}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Create new habit"
              style={[styles.circleAddBtn, { backgroundColor: colors.accent }]}
              activeOpacity={0.8}
              onPress={requestCreateHabit}
            >
              <Ionicons name="add" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Pill Search Bar */}
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
            const categoryDef = HABIT_CATEGORIES.find(c => c.name === cat);
            return (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: isActive ? colors.primaryText : colors.card,
                    borderColor: isActive ? colors.primaryText : colors.border,
                  },
                ]}
                onPress={() => setSelectedCategory(cat)}
                activeOpacity={0.7}
              >
                {categoryDef && (
                  <Ionicons
                    name={categoryDef.icon}
                    size={13}
                    color={isActive ? colors.background : categoryDef.color}
                    style={{ marginRight: 5 }}
                  />
                )}
                <Text style={[styles.filterChipText, { color: isActive ? colors.background : colors.secondaryText }]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Habit Cards */}
        <View style={styles.habitList}>
          {filteredHabits.map(habit => {
            const isCompleted = getHabitDayStatus(habit, todayDateStr, todayReferenceDate) === 'completed';
            const enabledReminders = (habit.reminders ?? []).filter(r => r.enabled);
            return (
              <TouchableOpacity
                key={habit.id}
                style={[
                  styles.habitRow,
                  {
                    backgroundColor: colors.card,
                    borderColor: isCompleted ? `${habit.color}45` : colors.border,
                  },
                ]}
                activeOpacity={0.8}
                onPress={() => setSelectedHabitId(habit.id)}
              >
                <View style={[styles.iconSquircle, { backgroundColor: `${habit.color}20` }]}>
                  <Ionicons name={habit.icon} size={20} color={habit.color} />
                </View>

                <View style={styles.habitInfo}>
                  <Text style={[styles.habitName, { color: colors.primaryText }]} numberOfLines={1}>{habit.name}</Text>
                  <View style={styles.streakBadge}>
                    <Text style={[styles.scheduleText, { color: colors.secondaryText }]}>
                      {habit.category} · 🔥 {habit.streak}d · {habit.targetFrequency}
                    </Text>
                  </View>
                  {enabledReminders.length > 0 && (
                    <View style={[styles.reminderPill, { backgroundColor: `${habit.color}18`, opacity: isCompleted ? 0.6 : 1 }]}>
                      <Ionicons name="notifications-outline" size={11} color={habit.color} />
                      <Text style={[styles.reminderText, { color: habit.color }]} numberOfLines={2}>
                        {enabledReminders.length > 1
                          ? `${enabledReminders.length}x/day${enabledReminders[0]?.intervalMinutes ? ` (${formatGapLabel(enabledReminders[0].intervalMinutes)})` : ''} · ${enabledReminders.slice(0, 3).map(r => formatReminderTime(r.hour, r.minute)).join(', ')}${enabledReminders.length > 3 ? ` +${enabledReminders.length - 3}` : ''}`
                          : enabledReminders.map(r => formatReminderTime(r.hour, r.minute)).join(', ')}
                      </Text>
                    </View>
                  )}
                </View>

                <AnimatedPopTouchable
                  pressScale={0.86}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={[
                    styles.checkButton,
                    {
                      borderColor: isCompleted ? habit.color : colors.border,
                      backgroundColor: isCompleted ? habit.color : colors.secondaryBackground,
                    },
                  ]}
                  activeOpacity={0.75}
                  onPress={() => {
                    toggleHabit(habit.id);
                  }}
                >
                  <Ionicons name="checkmark" size={18} color={isCompleted ? '#FFFFFF' : colors.mutedText} />
                </AnimatedPopTouchable>
              </TouchableOpacity>
            );
          })}

          {filteredHabits.length === 0 && (
            <View style={[styles.emptyContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="search" size={34} color={colors.secondaryText} />
              <Text style={[styles.emptyText, { color: colors.secondaryText }]}>No matching habits</Text>
              <TouchableOpacity
                style={[styles.emptyAddBtn, { backgroundColor: colors.accent }]}
                onPress={requestCreateHabit}
              >
                <Text style={styles.emptyAddBtnText}>+ New Habit</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Interactive Habit Detail Modal (Heatmap + Full-Month Calendar + Notes) */}
      <HabitDetailModal
        habit={selectedHabit}
        todayDateStr={todayDateStr}
        showArchived={showArchived}
        onClose={() => setSelectedHabitId(null)}
        onEdit={habit => {
          setEditingHabit(habit);
          setCreateModalVisible(true);
        }}
        onDelete={handleDelete}
        onToggleDate={(habitId, dateStr) => toggleHabit(habitId, dateStr)}
        onRecordLog={recordHabitLog}
        onPause={habit => setPauseModalHabit(habit)}
        onResume={id => {
          resumeHabit(id);
          setSelectedHabitId(null);
        }}
        onArchive={id => {
          archiveHabit(id);
          setSelectedHabitId(null);
        }}
        onRestore={id => {
          restoreHabit(id);
          setSelectedHabitId(null);
        }}
      />

      {/* Pause Habit Modal */}
      <PauseHabitModal
        visible={Boolean(pauseModalHabit)}
        habit={pauseModalHabit}
        todayDateStr={todayDateStr}
        onClose={() => setPauseModalHabit(null)}
        onConfirmPause={(id, startDate, endDate) => {
          pauseHabit(id, startDate, endDate);
          setPauseModalHabit(null);
          setSelectedHabitId(null);
        }}
      />

      {/* Create / Edit Habit Modal */}
      {createModalVisible && <CreateHabitModal
        key={editingHabit ? `edit_${editingHabit.id}` : 'create_habit'}
        visible={createModalVisible}
        onClose={() => { setCreateModalVisible(false); setEditingHabit(null); }}
        onAddHabit={addHabit}
        initialHabit={editingHabit}
        onUpdateHabit={updateHabit}
        onDeleteHabit={id => {
          deleteHabit(id);
          setCreateModalVisible(false);
          setEditingHabit(null);
          setSelectedHabitId(null);
        }}
        onPauseHabit={(id, startDate, endDate) => {
          pauseHabit(id, startDate, endDate);
          setCreateModalVisible(false);
          setEditingHabit(null);
          setSelectedHabitId(null);
        }}
        onResumeHabit={id => {
          resumeHabit(id);
          setCreateModalVisible(false);
          setEditingHabit(null);
          setSelectedHabitId(null);
        }}
      />}
      <PaywallModal visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.lg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.4 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  archivePill: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: radii.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleAddBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  searchInput: { flex: 1, height: 44, fontSize: 14, marginLeft: spacing.sm },
  filterRow: { gap: 8, marginBottom: spacing.md },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.full,
    borderWidth: 1,
  },
  filterChipText: { fontSize: 12, fontWeight: '600' },
  habitList: { gap: spacing.sm },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
  },
  iconSquircle: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  habitInfo: { flex: 1, paddingRight: 8 },
  habitName: { fontSize: 16, fontWeight: '700' },
  streakBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  scheduleText: { fontSize: 12 },
  reminderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  reminderText: { fontSize: 11, fontWeight: '600' },
  checkButton: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    paddingVertical: 42,
    borderRadius: radii.xl,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  emptyText: { fontSize: 15, fontWeight: '600', marginTop: 10 },
  emptyAddBtn: {
    marginTop: 14,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: radii.full,
  },
  emptyAddBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  modalBody: {
    width: '100%',
    maxWidth: 460,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    maxHeight: '92%',
  },
  detailScroll: { paddingBottom: spacing.md },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modalHeaderActions: { flexDirection: 'row', gap: 8 },
  modalCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: spacing.md,
  },
  modalIcon: {
    width: 50,
    height: 50,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHabitName: { fontSize: 22, fontWeight: '800' },
  modalCategoryText: { fontSize: 13, marginTop: 2 },
  detailHeatmapCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: 14,
    marginBottom: spacing.md,
  },
  detailBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.md,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: radii.full,
  },
  statPillText: { fontSize: 12, fontWeight: '700' },
  modalStatsRow: { flexDirection: 'row', gap: 10, marginBottom: spacing.md },
  modalStatCard: {
    flex: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
  },
  statNumber: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  detailMetadata: { fontSize: 12, marginBottom: spacing.md, lineHeight: 18 },
  toggleActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: radii.full,
    marginBottom: spacing.md,
  },
  toggleActionText: { fontSize: 15, fontWeight: '700' },
  detailActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  detailActionPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: radii.full,
  },
  detailActionText: { fontSize: 13, fontWeight: '700' },
});
