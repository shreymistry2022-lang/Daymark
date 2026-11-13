import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useHabits } from '../services/HabitContext';
import { Routine, getRoutineProgress } from '../domain/routineEngine';
import { HabitSchedule } from '../domain/habitTypes';
import { addLocalDays, isTrackableOnDate, parseLocalDate } from '../domain/habitEngine';
import { ensureLocalReminderPermission, formatReminderTime, parseTimeString } from '../services/localReminders';
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
const weekdaysFor = (frequency: HabitSchedule['frequency']) => frequency === 'weekdays' ? [1, 2, 3, 4, 5] : frequency === 'weekends' ? [6, 7] : [1, 2, 3, 4, 5, 6, 7];

interface Props { onClose?: () => void; initialRoutineId?: string | null; onInitialRoutineHandled?: () => void }

export const RoutinesScreen = ({ onClose, initialRoutineId, onInitialRoutineHandled }: Props) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { isPro } = useSubscription();
  const { habits, todayDateStr } = useHabits();
  const { routines, isLoadingRoutines, routineError, createRoutine, updateRoutine, deleteRoutine, reorderRoutine, toggleRoutineLog } = useRoutines();
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [schedule, setSchedule] = useState<HabitSchedule['frequency']>('daily');
  const [selectedHabitIds, setSelectedHabitIds] = useState<string[]>([]);
  const [reminders, setReminders] = useState<Routine['reminders']>([]);
  const [reminderTime, setReminderTime] = useState('8:00');
  const [reminderAmPm, setReminderAmPm] = useState<'AM' | 'PM'>('AM');
  const [formError, setFormError] = useState('');
  const allowed = canAccessFeature('routines', isPro);
  const activeRoutines = routines.filter(routine => !routine.archivedAt);

  const openEditor = useCallback((routine?: Routine) => {
    if (!allowed) { setPaywallVisible(true); return; }
    setEditingRoutine(routine ?? null);
    setName(routine?.name ?? '');
    setDescription(routine?.description ?? '');
    setSchedule(routine?.schedule.frequency ?? 'daily');
    setSelectedHabitIds(routine?.habitIds ?? []);
    setReminders(routine?.reminders ?? []);
    setReminderTime('8:00');
    setReminderAmPm('AM');
    setFormError('');
    setEditorVisible(true);
  }, [allowed]);

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
      setFormError('Notification permission is off. Allow notifications in device settings, or remove the routine reminders.');
      return;
    }
    const values = { name, description, schedule: { frequency: schedule } as HabitSchedule, habitIds: selectedHabitIds, reminders };
    const result = editingRoutine
      ? updateRoutine(editingRoutine.id, values)
      : createRoutine(values);
    if (result.error) { setFormError(result.error); return; }
    setEditorVisible(false);
  };

  const confirmDelete = (routine: Routine) => Alert.alert('Delete routine?', `“${routine.name}” and its routine history will be deleted. Habit logs remain unchanged.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete routine', style: 'destructive', onPress: () => deleteRoutine(routine.id) },
  ]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.headingGroup}>
            {onClose && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close routines" onPress={onClose} style={styles.backButton}><Ionicons name="arrow-back" size={21} color={colors.primaryText} /></TouchableOpacity>}
            <View>
              <Text style={[styles.eyebrow, { color: colors.accent }]}>STRUCTURE YOUR DAY</Text>
              <Text style={[styles.title, { color: colors.primaryText }]}>Routines</Text>
            </View>
          </View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Create routine" style={[styles.addButton, { backgroundColor: colors.accent }]} onPress={() => openEditor()}>
            <Ionicons name="add" size={20} color="#000" /><Text style={styles.addText}>New</Text>
          </TouchableOpacity>
        </View>

        {!allowed && <View style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.border }]}><Ionicons name="lock-closed-outline" size={18} color={colors.accent} /><Text style={[styles.noticeText, { color: colors.secondaryText }]}>Routines are included with Daymark Pro. Existing routines are still visible.</Text><TouchableOpacity onPress={() => setPaywallVisible(true)}><Text style={{ color: colors.accent, fontWeight: '700' }}>See Pro</Text></TouchableOpacity></View>}
        {routineError && <Text accessibilityRole="alert" style={[styles.errorBanner, { color: colors.error }]}>{routineError}</Text>}

        {isLoadingRoutines ? <View style={styles.loading}><ActivityIndicator color={colors.accent} /><Text style={{ color: colors.secondaryText, marginTop: 10 }}>Loading routines…</Text></View> : activeRoutines.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.emptyIcon, { backgroundColor: `${colors.accent}1A` }]}><Ionicons name="layers-outline" size={27} color={colors.accent} /></View>
            <Text style={[styles.emptyTitle, { color: colors.primaryText }]}>Give your habits a sequence</Text>
            <Text style={[styles.emptyText, { color: colors.secondaryText }]}>Group existing habits into a morning, evening, or custom routine. Tracking a routine keeps its own history and never creates duplicate habit logs.</Text>
            <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.accent }]} onPress={() => openEditor()}><Text style={styles.primaryText}>Create a routine</Text></TouchableOpacity>
          </View>
        ) : activeRoutines.map((routine, index) => {
          const progress = getRoutineProgress(routine, habits, todayDateStr, parseLocalDate(todayDateStr) ?? new Date());
          const logged = progress.loggedComplete;
          const routineScheduledToday = isTrackableOnDate(routine, todayDateStr);
          const linkedHabits = routine.habitIds.map(id => habits.find(habit => habit.id === id)).filter(Boolean);
          const routineHistory = Array.from({ length: 7 }, (_, offset) => addLocalDays(todayDateStr, offset - 6));
          return (
            <View key={routine.id} style={[styles.routineCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.routineTop}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.routineName, { color: colors.primaryText }]}>{routine.name}</Text>
                  <Text style={[styles.routineSchedule, { color: colors.secondaryText }]}>{routine.schedule.frequency.replace('_', ' ')} · {linkedHabits.length} habit{linkedHabits.length === 1 ? '' : 's'}{routine.reminders.some(reminder => reminder.enabled) ? ` · ${routine.reminders.filter(reminder => reminder.enabled).map(reminder => formatReminderTime(reminder.hour, reminder.minute)).join(', ')}` : ''}</Text>
                </View>
                <View style={styles.orderButtons}>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Move ${routine.name} up`} disabled={index === 0 || !allowed} onPress={() => reorderRoutine(routine.id, -1)}><Ionicons name="chevron-up" size={20} color={index === 0 ? colors.mutedText : colors.secondaryText} /></TouchableOpacity>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Move ${routine.name} down`} disabled={index === activeRoutines.length - 1 || !allowed} onPress={() => reorderRoutine(routine.id, 1)}><Ionicons name="chevron-down" size={20} color={index === activeRoutines.length - 1 ? colors.mutedText : colors.secondaryText} /></TouchableOpacity>
                </View>
              </View>
              {!!routine.description && <Text style={[styles.routineDescription, { color: colors.secondaryText }]}>{routine.description}</Text>}
              <View style={styles.habitChips}>
                {linkedHabits.length ? linkedHabits.map(habit => habit && <View key={habit.id} style={[styles.habitChip, { backgroundColor: colors.secondaryBackground }]}><View style={[styles.habitDot, { backgroundColor: habit.color }]} /><Text numberOfLines={1} style={[styles.habitChipText, { color: colors.secondaryText }]}>{habit.name}</Text></View>) : <Text style={[styles.routineDescription, { color: colors.mutedText }]}>No active habits linked yet.</Text>}
              </View>
              <View style={styles.progressLine}>
                <View style={[styles.progressTrack, { backgroundColor: colors.secondaryBackground }]}><View style={[styles.progressFill, { width: `${progress.percentage}%`, backgroundColor: colors.accent }]} /></View>
                <Text style={[styles.progressLabel, { color: colors.secondaryText }]}>{routineScheduledToday ? `${progress.completedHabits}/${progress.scheduledHabits}` : 'Not today'}</Text>
              </View>
              <View style={styles.historyRow}>
                {routineHistory.map(date => {
                  const entry = routine.logs.find(log => log.date === date && Boolean(log.completedAt));
                  const weekday = new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 1);
                  const trackable = isTrackableOnDate(routine, date);
                  return <TouchableOpacity key={date} accessibilityRole="button" accessibilityLabel={`${weekday}, ${date}: ${entry ? 'routine complete' : 'not completed'}${date === todayDateStr ? ', today' : ''}`} disabled={!allowed || !trackable} onPress={() => { const result = toggleRoutineLog(routine.id, date); if (result.error) Alert.alert('Could not update routine history', result.error); }} style={[styles.historyDay, { borderColor: entry ? colors.accent : colors.border, backgroundColor: entry ? `${colors.accent}22` : colors.secondaryBackground, opacity: trackable ? 1 : 0.5 }]}><Text style={[styles.historyDayText, { color: entry ? colors.accent : colors.secondaryText }]}>{weekday}</Text></TouchableOpacity>;
                })}
              </View>
              <View style={styles.actions}>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={logged ? `Undo ${routine.name} completion today` : `Mark ${routine.name} complete today`} disabled={!allowed || !routineScheduledToday} style={[styles.completeButton, { borderColor: logged ? colors.accent : colors.border, backgroundColor: logged ? `${colors.accent}1A` : colors.secondaryBackground, opacity: routineScheduledToday ? 1 : 0.5 }]} onPress={() => { const result = toggleRoutineLog(routine.id, todayDateStr); if (result.error) Alert.alert('Could not log routine', result.error); }}>
                  <Ionicons name={logged ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={logged ? colors.accent : colors.secondaryText} /><Text style={[styles.completeText, { color: logged ? colors.accent : colors.secondaryText }]}>{logged ? 'Routine complete' : 'Mark routine complete'}</Text>
                </TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Edit ${routine.name}`} onPress={() => openEditor(routine)} disabled={!allowed} style={styles.iconAction}><Ionicons name="create-outline" size={19} color={colors.secondaryText} /></TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Delete ${routine.name}`} onPress={() => confirmDelete(routine)} disabled={!allowed} style={styles.iconAction}><Ionicons name="trash-outline" size={18} color={colors.error} /></TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={editorVisible} animationType="slide" transparent onRequestClose={() => setEditorVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.editor, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + spacing.md }]}>
            <View style={styles.editorHeader}><View><Text style={[styles.eyebrow, { color: colors.accent }]}>ROUTINE BUILDER</Text><Text style={[styles.editorTitle, { color: colors.primaryText }]}>{editingRoutine ? 'Edit routine' : 'New routine'}</Text></View><TouchableOpacity accessibilityLabel="Close editor" onPress={() => setEditorVisible(false)}><Ionicons name="close" size={22} color={colors.secondaryText} /></TouchableOpacity></View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>NAME</Text>
              <TextInput accessibilityLabel="Routine name" value={name} onChangeText={setName} placeholder="Morning routine" placeholderTextColor={colors.mutedText} maxLength={70} style={[styles.input, { color: colors.primaryText, backgroundColor: colors.secondaryBackground, borderColor: colors.border }]} />
              <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>DESCRIPTION</Text>
              <TextInput accessibilityLabel="Routine description" value={description} onChangeText={setDescription} placeholder="A short description (optional)" placeholderTextColor={colors.mutedText} maxLength={500} multiline style={[styles.input, styles.descriptionInput, { color: colors.primaryText, backgroundColor: colors.secondaryBackground, borderColor: colors.border }]} />
              <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>SCHEDULE</Text>
              <View style={styles.scheduleOptions}>{SCHEDULES.map(option => <TouchableOpacity key={option.value} accessibilityRole="radio" accessibilityState={{ selected: schedule === option.value }} style={[styles.option, { backgroundColor: schedule === option.value ? `${colors.accent}18` : colors.secondaryBackground, borderColor: schedule === option.value ? colors.accent : colors.border }]} onPress={() => { setSchedule(option.value); setReminders(current => current.map(reminder => ({ ...reminder, weekdays: weekdaysFor(option.value) }))); }}><Text style={[styles.optionText, { color: schedule === option.value ? colors.accent : colors.secondaryText }]}>{option.label}</Text></TouchableOpacity>)}</View>
              <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>REMINDERS</Text>
              {reminders.map(reminder => (
                <View key={reminder.id} style={styles.reminderRow}>
                  <Text style={[styles.reminderLabel, { color: colors.primaryText }]}>
                    {formatReminderTime(reminder.hour, reminder.minute)} · {reminder.weekdays.length === 7 ? 'Every day' : schedule === 'weekends' ? 'Weekends' : 'Weekdays'}
                  </Text>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Remove routine reminder" onPress={() => setReminders(current => current.filter(item => item.id !== reminder.id))}>
                    <Ionicons name="close-circle-outline" size={20} color={colors.secondaryText} />
                  </TouchableOpacity>
                </View>
              ))}
              <View style={styles.reminderEntry}>
                <TextInput
                  accessibilityLabel="Routine reminder time"
                  value={reminderTime}
                  onChangeText={setReminderTime}
                  keyboardType="numbers-and-punctuation"
                  placeholder="8:00"
                  placeholderTextColor={colors.mutedText}
                  style={[styles.reminderInput, { color: colors.primaryText, backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}
                />
                <View style={[styles.ampmToggle, { borderColor: colors.border }]}>
                  {(['AM', 'PM'] as const).map(p => {
                    const isSelected = reminderAmPm === p;
                    return (
                      <TouchableOpacity
                        key={p}
                        onPress={() => setReminderAmPm(p)}
                        style={[styles.ampmBtn, { backgroundColor: isSelected ? colors.accent : colors.secondaryBackground }]}
                      >
                        <Text style={[styles.ampmBtnText, { color: isSelected ? '#FFFFFF' : colors.secondaryText }]}>{p}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TouchableOpacity
                  style={[styles.addReminderButton, { borderColor: colors.accent, backgroundColor: `${colors.accent}1A` }]}
                  onPress={() => {
                    const parsed = parseTimeString(reminderTime, reminderAmPm);
                    if (!parsed) {
                      setFormError('Enter a valid time like 8:00 AM or 14:30.');
                      return;
                    }
                    const { hour, minute } = parsed;
                    if (reminders.some(item => item.hour === hour && item.minute === minute)) {
                      setFormError('That reminder already exists.');
                      return;
                    }
                    setFormError('');
                    setReminders(current => [...current, { id: `routine_reminder_${Date.now()}`, hour, minute, weekdays: weekdaysFor(schedule), enabled: true }]);
                  }}
                >
                  <Ionicons name="add" size={16} color={colors.accent} />
                  <Text style={[styles.addReminderButtonText, { color: colors.accent }]}>Add</Text>
                </TouchableOpacity>
              </View>
              <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>INCLUDE HABITS</Text>
              {habits.length === 0 ? <Text style={{ color: colors.secondaryText, marginBottom: spacing.md }}>Create a habit before linking it to a routine.</Text> : habits.map(habit => {
                const selected = selectedHabitIds.includes(habit.id);
                return <TouchableOpacity key={habit.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} style={[styles.habitOption, { borderColor: selected ? habit.color : colors.border, backgroundColor: selected ? `${habit.color}12` : colors.secondaryBackground }]} onPress={() => setSelectedHabitIds(current => selected ? current.filter(id => id !== habit.id) : [...current, habit.id])}><View style={[styles.habitDot, { backgroundColor: habit.color }]} /><Text style={[styles.habitOptionText, { color: colors.primaryText }]}>{habit.name}</Text><Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={selected ? habit.color : colors.mutedText} /></TouchableOpacity>;
              })}
              {formError ? <Text accessibilityRole="alert" style={[styles.formError, { color: colors.error }]}>{formError}</Text> : null}
              <TouchableOpacity accessibilityRole="button" style={[styles.primaryButton, { backgroundColor: colors.accent }]} onPress={saveRoutine}><Text style={styles.primaryText}>{editingRoutine ? 'Save changes' : 'Create routine'}</Text></TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
      <PaywallModal visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 }, content: { paddingHorizontal: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md, marginBottom: spacing.lg },
  headingGroup: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, backButton: { padding: 6 },
  eyebrow: { fontSize: 11, letterSpacing: 1.4, fontWeight: '800' }, title: { fontSize: 30, fontWeight: '800', marginTop: 2 },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radii.full, paddingHorizontal: 14, paddingVertical: 9 }, addText: { color: '#000', fontWeight: '800' },
  notice: { borderWidth: 1, borderRadius: radii.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: spacing.md }, noticeText: { flex: 1, fontSize: 12, lineHeight: 17 },
  errorBanner: { fontSize: 12, marginBottom: spacing.md }, loading: { alignItems: 'center', paddingVertical: 70 },
  empty: { borderWidth: 1, borderRadius: radii.lg, padding: spacing.xl, alignItems: 'center', marginTop: spacing.xl }, emptyIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md }, emptyTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' }, emptyText: { fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8, marginBottom: spacing.lg },
  routineCard: { borderWidth: 1, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.md }, routineTop: { flexDirection: 'row', alignItems: 'center' }, routineName: { fontSize: 17, fontWeight: '800' }, routineSchedule: { fontSize: 11, marginTop: 4, textTransform: 'capitalize' }, routineDescription: { fontSize: 12, lineHeight: 18, marginTop: 8 }, orderButtons: { flexDirection: 'row', gap: 8 },
  habitChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.md }, habitChip: { flexDirection: 'row', alignItems: 'center', borderRadius: radii.full, paddingHorizontal: 9, paddingVertical: 6, maxWidth: '100%' }, habitDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 }, habitChipText: { fontSize: 11, maxWidth: 170 },
  progressLine: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: spacing.md }, progressTrack: { flex: 1, height: 6, borderRadius: radii.full, overflow: 'hidden' }, progressFill: { height: '100%', borderRadius: radii.full }, progressLabel: { fontSize: 11, fontWeight: '700' },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md }, historyDay: { width: 30, height: 30, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, historyDayText: { fontSize: 11, fontWeight: '700' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.md }, completeButton: { flex: 1, minHeight: 42, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7 }, completeText: { fontSize: 12, fontWeight: '700' }, iconAction: { minWidth: 40, minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.65)' }, editor: { maxHeight: '92%', borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, borderWidth: 1, padding: spacing.lg }, editorHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }, editorTitle: { fontSize: 23, fontWeight: '800', marginTop: 3 }, fieldLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1, marginTop: spacing.md, marginBottom: 6 }, input: { borderWidth: 1, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 14 }, descriptionInput: { minHeight: 70, textAlignVertical: 'top' }, scheduleOptions: { flexDirection: 'row', gap: 8 }, option: { borderWidth: 1, borderRadius: radii.md, paddingHorizontal: 12, paddingVertical: 9 }, optionText: { fontSize: 12, fontWeight: '700' },
  habitOption: { borderWidth: 1, borderRadius: radii.md, paddingHorizontal: 10, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', marginBottom: 7 }, habitOptionText: { flex: 1, fontSize: 13 }, reminderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 7 }, reminderLabel: { flex: 1, fontSize: 12, fontWeight: '600' },
  reminderEntry: { flexDirection: 'row', gap: 8, alignItems: 'center', width: '100%', marginTop: 6 },
  reminderInput: { width: 78, height: 40, borderWidth: 1, borderRadius: radii.md, paddingHorizontal: 8, textAlign: 'center', fontSize: 14, fontWeight: '600' },
  ampmToggle: { height: 40, flexDirection: 'row', borderWidth: 1, borderRadius: radii.md, overflow: 'hidden' },
  ampmBtn: { height: '100%', paddingHorizontal: 10, justifyContent: 'center', alignItems: 'center', minWidth: 36 },
  ampmBtnText: { fontSize: 12, fontWeight: '700' },
  addReminderButton: { flex: 1, height: 40, borderWidth: 1, borderRadius: radii.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 10 },
  addReminderButtonText: { fontSize: 13, fontWeight: '700' },
  formError: { fontSize: 12, marginTop: 10 }, primaryButton: { borderRadius: radii.md, paddingVertical: 13, alignItems: 'center', marginTop: spacing.md }, primaryText: { color: '#000', fontSize: 14, fontWeight: '800' },
});
