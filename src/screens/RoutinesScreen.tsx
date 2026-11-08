import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useHabits } from '../services/HabitContext';
import { Routine, getRoutineProgress } from '../domain/routineEngine';
import { HabitSchedule } from '../domain/habitTypes';
import { isTrackableOnDate, parseLocalDate } from '../domain/habitEngine';
import { ensureLocalReminderPermission } from '../services/localReminders';
import { useRoutines } from '../services/RoutinesContext';
import { useTheme } from '../theme/ThemeProvider';
import { useSubscription } from '../services/SubscriptionProvider';
import { canAccessFeature } from '../services/subscriptionEntitlements';
import { PaywallModal } from '../components/PaywallModal';
import { spacing, radii } from '../theme/tokens';

const SCHEDULES: { label: string; value: HabitSchedule['frequency'] }[] = [
  { label: 'Daily', value: 'daily' },
  { label: 'Weekdays', value: 'weekdays' },
  { label: 'Weekends', value: 'weekends' },
];
const weekdaysFor = (frequency: HabitSchedule['frequency']) =>
  frequency === 'weekdays' ? [1, 2, 3, 4, 5] : frequency === 'weekends' ? [6, 7] : [1, 2, 3, 4, 5, 6, 7];

interface Props {
  onClose?: () => void;
  initialRoutineId?: string | null;
  onInitialRoutineHandled?: () => void;
}

export const RoutinesScreen = ({ onClose, initialRoutineId, onInitialRoutineHandled }: Props) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { isPro } = useSubscription();
  const { habits, todayDateStr } = useHabits();
  const {
    routines,
    isLoadingRoutines,
    routineError,
    createRoutine,
    updateRoutine,
    deleteRoutine,
    toggleRoutineLog,
  } = useRoutines();

  const [editorVisible, setEditorVisible] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [schedule, setSchedule] = useState<HabitSchedule['frequency']>('daily');
  const [selectedHabitIds, setSelectedHabitIds] = useState<string[]>([]);
  const [reminders, setReminders] = useState<Routine['reminders']>([]);
  const [formError, setFormError] = useState('');
  const [cheeredRoutines, setCheeredRoutines] = useState<Record<string, boolean>>({});

  const allowed = canAccessFeature('routines', isPro);
  const activeRoutines = routines.filter(routine => !routine.archivedAt);

  const openEditor = useCallback(
    (routine?: Routine) => {
      if (!allowed) {
        setPaywallVisible(true);
        return;
      }
      setEditingRoutine(routine ?? null);
      setName(routine?.name ?? '');
      setDescription(routine?.description ?? '');
      setSchedule(routine?.schedule.frequency ?? 'daily');
      setSelectedHabitIds(routine?.habitIds ?? []);
      setReminders(routine?.reminders ?? []);
      setFormError('');
      setEditorVisible(true);
    },
    [allowed]
  );

  useEffect(() => {
    if (!initialRoutineId || isLoadingRoutines) return;
    const timeout = setTimeout(() => {
      const routine = routines.find(item => item.id === initialRoutineId);
      if (routine) openEditor(routine);
      onInitialRoutineHandled?.();
    }, 0);
    return () => clearTimeout(timeout);
  }, [initialRoutineId, isLoadingRoutines, routines, onInitialRoutineHandled, openEditor]);

  const saveRoutine = async () => {
    if (reminders.some(reminder => reminder.enabled) && !(await ensureLocalReminderPermission())) {
      setFormError('Notification permission is off. Allow notifications in device settings, or remove reminders.');
      return;
    }
    const values = {
      name,
      description,
      schedule: { frequency: schedule } as HabitSchedule,
      habitIds: selectedHabitIds,
      reminders,
    };
    const result = editingRoutine ? updateRoutine(editingRoutine.id, values) : createRoutine(values);
    if (result.error) {
      setFormError(result.error);
      return;
    }
    setEditorVisible(false);
  };

  const confirmDelete = (routine: Routine) =>
    Alert.alert('Delete routine?', `“${routine.name}” and its routine history will be deleted.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete routine', style: 'destructive', onPress: () => deleteRoutine(routine.id) },
    ]);

  const toggleCheer = (routineId: string) => {
    setCheeredRoutines(prev => ({ ...prev, [routineId]: !prev[routineId] }));
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Top Header matching screen 4.png */}
      <View style={styles.topBar}>
        {onClose ? (
          <TouchableOpacity onPress={onClose} style={styles.topIconBtn}>
            <Ionicons name="arrow-back" size={20} color={colors.primaryText} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 34 }} />
        )}

        <Text style={[styles.headerTitle, { color: colors.primaryText }]}>Group & Routines</Text>

        <TouchableOpacity
          style={styles.addCircleBtn}
          onPress={() => openEditor()}
          accessibilityRole="button"
          accessibilityLabel="Create routine"
        >
          <Ionicons name="add" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {!allowed && (
          <View style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="lock-closed-outline" size={18} color="#FF5264" />
            <Text style={[styles.noticeText, { color: colors.secondaryText }]}>
              Routines are included with Daymark Pro. Existing routines are still visible.
            </Text>
            <TouchableOpacity onPress={() => setPaywallVisible(true)}>
              <Text style={{ color: '#FF5264', fontWeight: '700' }}>See Pro</Text>
            </TouchableOpacity>
          </View>
        )}
        {routineError && (
          <Text accessibilityRole="alert" style={[styles.errorBanner, { color: colors.error }]}>
            {routineError}
          </Text>
        )}

        {isLoadingRoutines ? (
          <View style={styles.loading}>
            <ActivityIndicator color="#FF5264" />
            <Text style={{ color: colors.secondaryText, marginTop: 10 }}>Loading routines…</Text>
          </View>
        ) : activeRoutines.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: isDark ? '#1C1E28' : '#FFFFFF', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}>
            <View style={[styles.emptyIcon, { backgroundColor: 'rgba(255,82,100,0.12)' }]}>
              <Ionicons name="people-outline" size={28} color="#FF5264" />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.primaryText }]}>Build Shared Habits & Routines</Text>
            <Text style={[styles.emptyText, { color: colors.secondaryText }]}>
              Group habits into morning, evening, or shared team routines with progress bars and encouragement.
            </Text>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: '#FF5264' }]}
              onPress={() => openEditor()}
            >
              <Text style={styles.primaryText}>Create New Routine</Text>
            </TouchableOpacity>
          </View>
        ) : (
          activeRoutines.map(routine => {
            const progress = getRoutineProgress(
              routine,
              habits,
              todayDateStr,
              parseLocalDate(todayDateStr) ?? new Date()
            );
            const logged = progress.loggedComplete;
            const routineScheduledToday = isTrackableOnDate(routine, todayDateStr);
            const linkedHabits = routine.habitIds
              .map(id => habits.find(habit => habit.id === id))
              .filter(Boolean);

            return (
              <View
                key={routine.id}
                style={[
                  styles.groupCard,
                  {
                    backgroundColor: isDark ? '#1C1E28' : '#FFFFFF',
                    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                  },
                ]}
              >
                {/* Group Card Header matching screen 4.png: 🧘 Routine Name > */}
                <TouchableOpacity
                  style={styles.cardHeader}
                  activeOpacity={0.7}
                  onPress={() => openEditor(routine)}
                >
                  <View style={styles.cardHeaderLeft}>
                    <Text style={styles.cardHeaderEmoji}>🧘</Text>
                    <Text style={[styles.cardHeaderTitle, { color: colors.primaryText }]}>
                      {routine.name}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.secondaryText} />
                </TouchableOpacity>

                {/* Member / Habit Rows matching screen 4.png */}
                <View style={styles.membersList}>
                  {linkedHabits.length > 0 ? (
                    linkedHabits.map((h, hIdx) => {
                      if (!h) return null;
                      const isHabitDone = h.completedDates.includes(todayDateStr);
                      return (
                        <View key={h.id} style={styles.memberRow}>
                          <View
                            style={[
                              styles.memberAvatar,
                              { backgroundColor: `${h.color || '#FF5264'}20` },
                            ]}
                          >
                            <Ionicons name={h.icon as any} size={16} color={h.color || '#FF5264'} />
                          </View>

                          <View style={styles.memberProgressBlock}>
                            <View style={styles.memberNameAndPercent}>
                              <Text
                                numberOfLines={1}
                                style={[styles.memberName, { color: colors.primaryText }]}
                              >
                                {h.name}
                              </Text>
                              <Text style={[styles.memberPercent, { color: colors.secondaryText }]}>
                                {isHabitDone ? '100%' : '0%'}
                              </Text>
                            </View>

                            <View style={[styles.progressBarTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F2F6' }]}>
                              <View
                                style={[
                                  styles.progressBarFill,
                                  {
                                    width: isHabitDone ? '100%' : '0%',
                                    backgroundColor: h.color || '#FF5264',
                                  },
                                ]}
                              />
                            </View>
                          </View>

                          {/* Thumbs up cheer button */}
                          <TouchableOpacity
                            style={[
                              styles.cheerBtn,
                              isHabitDone && { backgroundColor: 'rgba(255,82,100,0.12)' },
                            ]}
                            onPress={() => toggleCheer(`${routine.id}_${h.id}`)}
                          >
                            <Ionicons
                              name={cheeredRoutines[`${routine.id}_${h.id}`] ? 'thumbs-up' : 'thumbs-up-outline'}
                              size={18}
                              color={cheeredRoutines[`${routine.id}_${h.id}`] ? '#FF5264' : colors.secondaryText}
                            />
                          </TouchableOpacity>
                        </View>
                      );
                    })
                  ) : (
                    <Text style={[styles.emptySubtitle, { color: colors.secondaryText }]}>
                      No habits linked yet. Tap to add habits!
                    </Text>
                  )}
                </View>

                {/* Overall Routine Progress Line */}
                <View style={styles.overallRow}>
                  <View style={[styles.progressTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F2F6' }]}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${progress.percentage}%`, backgroundColor: '#FF5264' },
                      ]}
                    />
                  </View>
                  <Text style={[styles.progressLabel, { color: colors.secondaryText }]}>
                    {progress.percentage}% Complete
                  </Text>
                </View>

                {/* Action buttons */}
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    disabled={!routineScheduledToday}
                    style={[
                      styles.completeBtn,
                      logged
                        ? { backgroundColor: '#10B981', borderColor: '#10B981' }
                        : { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F9FAFB', borderColor: colors.border },
                      !routineScheduledToday && { opacity: 0.5 },
                    ]}
                    onPress={() => toggleRoutineLog(routine.id, todayDateStr)}
                  >
                    <Ionicons
                      name={logged ? 'checkmark-circle' : 'ellipse-outline'}
                      size={18}
                      color={logged ? '#FFFFFF' : colors.secondaryText}
                    />
                    <Text
                      style={[
                        styles.completeBtnText,
                        { color: logged ? '#FFFFFF' : colors.primaryText },
                      ]}
                    >
                      {logged ? 'Completed Today' : 'Mark Completed'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.iconAction}
                    onPress={() => openEditor(routine)}
                  >
                    <Ionicons name="create-outline" size={18} color={colors.secondaryText} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.iconAction}
                    onPress={() => confirmDelete(routine)}
                  >
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Routine Editor Modal */}
      <Modal visible={editorVisible} animationType="slide" transparent onRequestClose={() => setEditorVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.editor,
              {
                backgroundColor: isDark ? '#1C1E28' : '#FFFFFF',
                borderColor: colors.border,
                paddingBottom: insets.bottom + spacing.md,
              },
            ]}
          >
            <View style={styles.editorHeader}>
              <View>
                <Text style={[styles.eyebrow, { color: '#FF5264' }]}>ROUTINE BUILDER</Text>
                <Text style={[styles.editorTitle, { color: colors.primaryText }]}>
                  {editingRoutine ? 'Edit Routine' : 'New Routine'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setEditorVisible(false)}>
                <Ionicons name="close" size={22} color={colors.secondaryText} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>NAME</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Morning Routine"
                placeholderTextColor={colors.mutedText}
                maxLength={70}
                style={[
                  styles.input,
                  { color: colors.primaryText, backgroundColor: colors.secondaryBackground, borderColor: colors.border },
                ]}
              />

              <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>DESCRIPTION</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="A short routine description"
                placeholderTextColor={colors.mutedText}
                maxLength={500}
                multiline
                style={[
                  styles.input,
                  styles.descriptionInput,
                  { color: colors.primaryText, backgroundColor: colors.secondaryBackground, borderColor: colors.border },
                ]}
              />

              <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>SCHEDULE</Text>
              <View style={styles.scheduleOptions}>
                {SCHEDULES.map(option => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.option,
                      {
                        backgroundColor: schedule === option.value ? '#FF5264' : colors.secondaryBackground,
                        borderColor: schedule === option.value ? '#FF5264' : colors.border,
                      },
                    ]}
                    onPress={() => {
                      setSchedule(option.value);
                      setReminders(current => current.map(r => ({ ...r, weekdays: weekdaysFor(option.value) })));
                    }}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        { color: schedule === option.value ? '#FFFFFF' : colors.secondaryText },
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>INCLUDE HABITS</Text>
              {habits.length === 0 ? (
                <Text style={{ color: colors.secondaryText, marginBottom: spacing.md }}>
                  Create a habit before linking it to a routine.
                </Text>
              ) : (
                habits.map(habit => {
                  const selected = selectedHabitIds.includes(habit.id);
                  return (
                    <TouchableOpacity
                      key={habit.id}
                      style={[
                        styles.habitOption,
                        {
                          borderColor: selected ? '#FF5264' : colors.border,
                          backgroundColor: selected ? 'rgba(255,82,100,0.1)' : colors.secondaryBackground,
                        },
                      ]}
                      onPress={() =>
                        setSelectedHabitIds(current =>
                          selected ? current.filter(id => id !== habit.id) : [...current, habit.id]
                        )
                      }
                    >
                      <Ionicons
                        name={habit.icon as any}
                        size={18}
                        color={habit.color || '#FF5264'}
                        style={{ marginRight: 8 }}
                      />
                      <Text style={[styles.habitOptionText, { color: colors.primaryText }]}>
                        {habit.name}
                      </Text>
                      <Ionicons
                        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={20}
                        color={selected ? '#FF5264' : colors.mutedText}
                      />
                    </TouchableOpacity>
                  );
                })
              )}

              {formError ? <Text style={[styles.formError, { color: colors.error }]}>{formError}</Text> : null}

              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: '#FF5264' }]}
                onPress={saveRoutine}
              >
                <Text style={styles.primaryText}>{editingRoutine ? 'Save Changes' : 'Create Routine'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <PaywallModal visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  topIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  addCircleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FF5264',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  notice: {
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: spacing.md,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  errorBanner: {
    fontSize: 12,
    marginBottom: spacing.md,
  },
  loading: {
    alignItems: 'center',
    paddingVertical: 70,
  },
  empty: {
    borderWidth: 1,
    borderRadius: 22,
    padding: spacing.xl,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: spacing.lg,
  },
  groupCard: {
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardHeaderEmoji: {
    fontSize: 18,
  },
  cardHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  membersList: {
    paddingVertical: 10,
    gap: 12,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  memberAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberProgressBlock: {
    flex: 1,
  },
  memberNameAndPercent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  memberName: {
    fontSize: 13,
    fontWeight: '600',
  },
  memberPercent: {
    fontSize: 12,
    fontWeight: '500',
  },
  progressBarTrack: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  cheerBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptySubtitle: {
    fontSize: 12,
    fontStyle: 'italic',
    paddingVertical: 8,
  },
  overallRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.04)',
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  completeBtn: {
    flex: 1,
    height: 38,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  completeBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  iconAction: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  editor: {
    maxHeight: '92%',
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.lg,
  },
  editorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  editorTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: 2,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: spacing.md,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 14,
  },
  descriptionInput: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  scheduleOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  option: {
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  optionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  habitOption: {
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 7,
  },
  habitOptionText: {
    flex: 1,
    fontSize: 13,
  },
  formError: {
    fontSize: 12,
    marginTop: 10,
  },
  primaryButton: {
    borderRadius: radii.md,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
