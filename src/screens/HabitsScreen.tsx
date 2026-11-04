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
import { spacing, radii } from '../theme/tokens';
import { useHabits, Habit } from '../services/HabitContext';
import { useTheme } from '../theme/ThemeProvider';
import { CreateHabitModal } from '../components/CreateHabitModal';
import { PauseHabitModal } from '../components/PauseHabitModal';
import { HABIT_CATEGORIES } from '../constants/categories';
import { useSubscription } from '../services/SubscriptionProvider';
import { canCreateHabit } from '../services/subscriptionEntitlements';
import { PaywallModal } from '../components/PaywallModal';
import { addLocalDays, calculateCompletionStats, calculateStreakStats, getHabitDayStatus, isPausedOnDate, isTrackableOnDate, parseLocalDate } from '../domain/habitEngine';
import { HabitTrackingControl } from '../components/HabitTrackingControl';
import { useNavigation, useRoute } from '@react-navigation/native';

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

  // Available categories: 'All' + all 14 standard categories
  const categoriesList = ['All', ...HABIT_CATEGORIES.map(c => c.name)];
  const todayReferenceDate = useMemo(() => parseLocalDate(todayDateStr) ?? new Date(), [todayDateStr]);

  const filteredHabits = (showArchived ? archivedHabits : habits).filter(h => {
    const matchesSearch = h.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = selectedCategory === 'All' || h.category === selectedCategory;
    return matchesSearch && matchesCat;
  });
  const selectedHabitStats = selectedHabit ? calculateStreakStats(selectedHabit) : null;
  const selectedHabitRecentRate = selectedHabit ? calculateCompletionStats(selectedHabit, addLocalDays(todayDateStr, -29), todayDateStr).percentage : 0;

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
          <View>
            <Text style={[styles.eyebrow, { color: colors.accent }]}>CATALOG & TRACKING</Text>
            <Text style={[styles.title, { color: colors.primaryText }]}>All Habits</Text>
          <TouchableOpacity onPress={() => setShowArchived(value => !value)} accessibilityRole="button" accessibilityLabel={showArchived ? 'Show active habits' : `Show archived habits, ${archivedHabits.length}`}>
            <Text style={{ color: colors.accent, fontWeight: '600', marginTop: 6 }}>{showArchived ? 'Active' : `Archived (${archivedHabits.length})`}</Text>
          </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.newHabitBtn, { backgroundColor: colors.accent }]}
            activeOpacity={0.7}
            onPress={requestCreateHabit}
          >
            <Ionicons name="add" size={20} color="#000" />
            <Text style={styles.newHabitBtnText}>New Habit</Text>
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={20} color={colors.secondaryText} />
          <TextInput
            style={[styles.searchInput, { color: colors.primaryText }]}
            placeholder="Search habits by name..."
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

        {/* Filter Chips (14 categories) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
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
                    size={14}
                    color={isActive ? colors.background : categoryDef.color}
                    style={{ marginRight: 6 }}
                  />
                )}
                <Text
                  style={[
                    styles.filterChipText,
                    { color: isActive ? colors.background : colors.secondaryText },
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Habit Rows */}
        <View style={styles.habitList}>
          {filteredHabits.map(habit => {
            const isCompleted = getHabitDayStatus(habit, todayDateStr, todayReferenceDate) === 'completed';
            return (
              <TouchableOpacity
                key={habit.id}
                style={[
                  styles.habitRow,
                  {
                    backgroundColor: colors.card,
                    borderColor: isCompleted ? `${colors.accent}40` : colors.border,
                  },
                ]}
                activeOpacity={0.7}
                onPress={() => setSelectedHabitId(habit.id)}
              >
                <View style={[styles.iconCircle, { backgroundColor: `${habit.color}1F` }]}>
                  <Ionicons name={habit.icon} size={22} color={habit.color} />
                </View>

                <View style={styles.habitInfo}>
                  <Text style={[styles.habitName, { color: colors.primaryText }]}>{habit.name}</Text>
                  <View style={styles.streakBadge}>
                    <Text style={[styles.categoryBadge, { color: colors.secondaryText }]}>{habit.category}</Text>
                    <Text style={[styles.scheduleText, { color: colors.accent }]}>• 🔥 {habit.streak}d streak</Text>
                    <Text style={[styles.scheduleText, { color: colors.mutedText }]}>• {habit.targetFrequency}</Text>
                  </View>
                </View>

                {/* Interactive checkmark button */}
                <TouchableOpacity
                  style={[
                    styles.checkButton,
                    {
                      borderColor: isCompleted ? habit.color : colors.border,
                      backgroundColor: isCompleted ? habit.color : colors.secondaryBackground,
                    },
                  ]}
                  activeOpacity={0.6}
                  onPress={() => toggleHabit(habit.id)}
                >
                  <Ionicons
                    name={isCompleted ? 'checkmark' : 'checkmark-outline'}
                    size={18}
                    color={isCompleted ? '#000' : colors.mutedText}
                  />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}

          {filteredHabits.length === 0 && (
            <View style={styles.emptyContainer}>
              <Ionicons name="search" size={40} color={colors.secondaryText} />
              <Text style={[styles.emptyText, { color: colors.secondaryText }]}>No matching habits</Text>
              <TouchableOpacity
                style={[styles.emptyAddBtn, { backgroundColor: colors.card, borderColor: colors.accent }]}
                onPress={() => setCreateModalVisible(true)}
              >
                <Text style={[styles.emptyAddBtnText, { color: colors.accent }]}>+ Create New Habit</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Floating Action Button */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.accent, bottom: insets.bottom + 80 }]}
        activeOpacity={0.8}
        onPress={() => setCreateModalVisible(true)}
      >
        <Ionicons name="add" size={28} color="#000" />
      </TouchableOpacity>

      {/* Habit Detail Modal */}
      {selectedHabit && (
        <Modal
          animationType="fade"
          transparent={true}
          visible={!!selectedHabit}
          onRequestClose={() => setSelectedHabitId(null)}
        >
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalBody, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.detailScroll}>
              <View style={styles.modalHeader}>
                <View style={[styles.modalIcon, { backgroundColor: `${selectedHabit.color}25` }]}>
                  <Ionicons name={selectedHabit.icon} size={28} color={selectedHabit.color} />
                </View>
                <TouchableOpacity onPress={() => setSelectedHabitId(null)}>
                  <Ionicons name="close" size={24} color={colors.secondaryText} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.modalHabitName, { color: colors.primaryText }]}>{selectedHabit.name}</Text>
              <Text style={[styles.modalCategoryText, { color: colors.secondaryText }]}>
                Category: <Text style={{ color: selectedHabit.color }}>{selectedHabit.category}</Text>
                {'  '}•{'  '}Frequency: {selectedHabit.targetFrequency}
              </Text>
              {!!selectedHabit.description && <Text style={{ color: colors.secondaryText, marginTop: 8 }}>{selectedHabit.description}</Text>}
              <Text style={[styles.detailMetadata, { color: colors.secondaryText }]}>{selectedHabit.habitKind === 'quit' ? 'Quit habit' : 'Positive habit'} · {selectedHabit.trackingMethod ?? 'yes_no'}{selectedHabit.trackingMethod !== 'yes_no' ? ` · Target ${selectedHabit.targetValue ?? 1} ${selectedHabit.unit ?? ''}` : ''}</Text>
              <Text style={[styles.detailMetadata, { color: colors.secondaryText }]}>Since {selectedHabit.startDate ?? '—'}{selectedHabit.endDate ? ` · Ends ${selectedHabit.endDate}` : ''}</Text>
              {isPausedOnDate(selectedHabit, todayDateStr) && <Text style={{ color: colors.accent, marginTop: 8 }}>Paused today · streaks are protected</Text>}
              {!!selectedHabit.pausedPeriods?.length && <Text style={{ color: colors.mutedText, marginTop: 6, fontSize: 12 }}>Pause history: {selectedHabit.pausedPeriods.map(period => `${period.startDate}–${period.endDate ?? 'ongoing'}`).join(', ')}</Text>}

              <View style={styles.modalStatsRow}>
                <View style={[styles.modalStatCard, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}>
                  <Text style={[styles.statNumber, { color: colors.accent }]}>{selectedHabit.streak}</Text>
                  <Text style={[styles.statLabel, { color: colors.secondaryText }]}>Current streak</Text>
                </View>
                <View style={[styles.modalStatCard, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}>
                  <Text style={[styles.statNumber, { color: colors.accent }]}>{selectedHabitStats?.bestStreak ?? 0}</Text>
                  <Text style={[styles.statLabel, { color: colors.secondaryText }]}>Best streak</Text>
                </View>
                <View style={[styles.modalStatCard, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}>
                  <Text style={[styles.statNumber, { color: colors.accent }]}>{selectedHabitRecentRate}%</Text>
                  <Text style={[styles.statLabel, { color: colors.secondaryText }]}>Last 30 days</Text>
                </View>
              </View>
              <Text style={[styles.detailMetadata, { color: colors.secondaryText }]}>{selectedHabitStats?.totalSuccessfulScheduledDays ?? 0} successful scheduled days recorded</Text>

              {isTrackableOnDate(selectedHabit, todayDateStr) ? selectedHabit.habitKind === 'quit' || selectedHabit.trackingMethod === 'count' || selectedHabit.trackingMethod === 'measurable' ? (
                <HabitTrackingControl habit={selectedHabit} date={todayDateStr} onSave={recordHabitLog} />
              ) : (
                (() => {
                  const isSelectedDone = getHabitDayStatus(selectedHabit, todayDateStr, todayReferenceDate) === 'completed';
                  return (
                    <TouchableOpacity
                      style={[
                        styles.toggleActionBtn,
                        { backgroundColor: colors.secondaryBackground },
                        isSelectedDone && styles.toggleActionBtnDone,
                      ]}
                      activeOpacity={0.8}
                      onPress={() => {
                        toggleHabit(selectedHabit.id);
                      }}
                    >
                      <Ionicons
                        name={
                          isSelectedDone
                            ? 'checkmark-circle'
                            : 'ellipse-outline'
                        }
                        size={20}
                        color="#FFF"
                      />
                      <Text style={styles.toggleActionText}>
                        {isSelectedDone
                          ? 'Completed Today'
                          : 'Mark Completed for Today'}
                      </Text>
                    </TouchableOpacity>
                  );
                })()
              ) : <Text style={[styles.detailMetadata, { color: colors.secondaryText, marginBottom: spacing.md }]}>{selectedHabit.archivedAt ? 'Archived habits are read-only.' : isPausedOnDate(selectedHabit, todayDateStr) ? 'Paused today. Tracking resumes after the pause.' : 'This habit is not scheduled today.'}</Text>}
              {!!selectedHabit.reminders?.length && <Text style={[styles.detailMetadata, { color: colors.secondaryText }]}>Reminders: {selectedHabit.reminders.filter(reminder => reminder.enabled).map(reminder => `${String(reminder.hour).padStart(2, '0')}:${String(reminder.minute).padStart(2, '0')}`).join(', ') || 'All disabled'}</Text>}

              <TouchableOpacity
                style={styles.deleteButton}
                activeOpacity={0.7}
                onPress={() => handleDelete(selectedHabit.id, selectedHabit.name)}
              >
                <Ionicons name="trash-outline" size={18} color={colors.error} />
                <Text style={[styles.deleteText, { color: colors.error }]}>Delete Habit</Text>
              </TouchableOpacity>
              {showArchived ? (
                <TouchableOpacity style={styles.deleteButton} onPress={() => { restoreHabit(selectedHabit.id); setSelectedHabitId(null); }}>
                  <Ionicons name="refresh-outline" size={18} color={colors.accent} />
                  <Text style={[styles.deleteText, { color: colors.accent }]}>Restore Habit</Text>
                </TouchableOpacity>
              ) : (
                <>
                  {isPausedOnDate(selectedHabit, todayDateStr) ? (
                    <TouchableOpacity style={styles.deleteButton} onPress={() => { resumeHabit(selectedHabit.id); setSelectedHabitId(null); }}>
                      <Ionicons name="play-outline" size={18} color={colors.accent} />
                      <Text style={[styles.deleteText, { color: colors.accent }]}>Resume Habit</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.deleteButton}
                      activeOpacity={0.7}
                      onPress={() => setPauseModalHabit(selectedHabit)}
                    >
                      <Ionicons name="pause-outline" size={18} color={colors.secondaryText} />
                      <Text style={[styles.deleteText, { color: colors.secondaryText }]}>Pause Habit</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.deleteButton} onPress={() => { setEditingHabit(selectedHabit); setCreateModalVisible(true); }}>
                    <Ionicons name="create-outline" size={18} color={colors.accent} />
                    <Text style={[styles.deleteText, { color: colors.accent }]}>Edit Habit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.deleteButton} onPress={() => { archiveHabit(selectedHabit.id); setSelectedHabitId(null); }}>
                    <Ionicons name="archive-outline" size={18} color={colors.secondaryText} />
                    <Text style={[styles.deleteText, { color: colors.secondaryText }]}>Archive Habit</Text>
                  </TouchableOpacity>
                </>
              )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

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
  screen: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
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
  newHabitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.full,
    gap: 4,
  },
  newHabitBtnText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 13,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    height: 46,
    fontSize: 15,
    marginLeft: spacing.sm,
  },
  filterRow: {
    gap: 8,
    marginBottom: spacing.lg,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.full,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  habitList: {
    gap: spacing.sm,
  },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  habitInfo: {
    flex: 1,
  },
  habitName: {
    fontSize: 16,
    fontWeight: '600',
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    flexWrap: 'wrap',
    gap: 4,
  },
  categoryBadge: {
    fontSize: 12,
  },
  scheduleText: {
    fontSize: 12,
  },
  checkButton: {
    width: 34,
    height: 34,
    borderRadius: radii.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    marginTop: 12,
  },
  emptyAddBtn: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radii.full,
    borderWidth: 1,
  },
  emptyAddBtnText: {
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalBody: {
    width: '100%',
    maxWidth: 380,
    borderRadius: radii.xl,
    padding: spacing.xl,
    borderWidth: 1,
    maxHeight: '90%',
  },
  detailScroll: { paddingBottom: spacing.sm },
  detailMetadata: { fontSize: 12, marginTop: 7, lineHeight: 18 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  modalIcon: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHabitName: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  modalCategoryText: {
    fontSize: 13,
    marginBottom: spacing.lg,
  },
  modalStatsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: spacing.lg,
  },
  modalStatCard: {
    flex: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  toggleActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: radii.md,
    marginBottom: spacing.md,
  },
  toggleActionBtnDone: {
    backgroundColor: '#059669',
  },
  toggleActionText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  deleteText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
