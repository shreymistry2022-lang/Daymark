import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing, radii } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useSubscription } from '../services/SubscriptionProvider';
import { canAccessFeature } from '../services/subscriptionEntitlements';
import { PaywallModal } from '../components/PaywallModal';
import { useHabits } from '../services/HabitContext';
import { Goal, GoalMilestone, calculateGoalProgress } from '../domain/goalEngine';
import { parseLocalDate, toLocalDateString } from '../domain/habitEngine';
import { useGoals } from '../services/GoalsContext';

const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => { const random = Math.floor(Math.random() * 16); return (char === 'x' ? random : (random & 3) | 8).toString(16); });
interface Props { onClose?: () => void; initialGoalId?: string | null; onInitialGoalHandled?: () => void }

export const GoalsScreen = ({ onClose, initialGoalId, onInitialGoalHandled }: Props) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { isPro } = useSubscription();
  const { habits, todayDateStr } = useHabits();
  const { goals, isLoadingGoals, goalError, createGoal, updateGoal, archiveGoal, restoreGoal, deleteGoal, completeGoal, reopenGoal, markMilestoneReached } = useGoals();
  const [showArchived, setShowArchived] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Personal');
  const [startDate, setStartDate] = useState(toLocalDateString(new Date()));
  const [targetDate, setTargetDate] = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [unit, setUnit] = useState('');
  const [habitIds, setHabitIds] = useState<string[]>([]);
  const [milestones, setMilestones] = useState<{ id: string; title: string; value: string }[]>([]);
  const [milestoneTitle, setMilestoneTitle] = useState('');
  const [milestoneTarget, setMilestoneTarget] = useState('');
  const [formError, setFormError] = useState('');
  const allowed = canAccessFeature('goals', isPro);
  const list = goals.filter(goal => showArchived ? Boolean(goal.archivedAt) : !goal.archivedAt);

  const openEditor = useCallback((goal?: Goal) => {
    if (!allowed) { setPaywallVisible(true); return; }
    setEditing(goal ?? null);
    setName(goal?.name ?? '');
    setDescription(goal?.description ?? '');
    setCategory(goal?.category ?? 'Personal');
    setStartDate(goal?.startDate ?? toLocalDateString(new Date()));
    setTargetDate(goal?.targetDate ?? '');
    setTargetValue(goal?.targetValue == null ? '' : String(goal.targetValue));
    setUnit(goal?.unit ?? '');
    setHabitIds(goal?.habitIds ?? []);
    setMilestones((goal?.milestones ?? []).map(milestone => ({ id: milestone.id, title: milestone.title, value: milestone.targetValue == null ? '' : String(milestone.targetValue) })));
    setMilestoneTitle('');
    setMilestoneTarget('');
    setFormError('');
    setEditorVisible(true);
  }, [allowed]);

  useEffect(() => {
    if (!initialGoalId || isLoadingGoals) return;
    const timeout = setTimeout(() => {
      const goal = goals.find(item => item.id === initialGoalId);
      if (goal) openEditor(goal);
      onInitialGoalHandled?.();
    }, 0);
    return () => clearTimeout(timeout);
  }, [initialGoalId, isLoadingGoals, goals, onInitialGoalHandled, openEditor]);

  const saveGoal = () => {
    const numericTarget = targetValue.trim() ? Number(targetValue) : null;
    if (!name.trim()) { setFormError('Enter a goal name.'); return; }
    if (!parseLocalDate(startDate) || (targetDate && !parseLocalDate(targetDate))) { setFormError('Use valid YYYY-MM-DD dates.'); return; }
    if (targetDate && targetDate < startDate) { setFormError('Target date must be on or after the start date.'); return; }
    if (numericTarget !== null && (!Number.isFinite(numericTarget) || numericTarget <= 0)) { setFormError('Target value must be a number greater than zero.'); return; }
    if (!habitIds.length) { setFormError('Link at least one habit to track this goal.'); return; }
    const milestoneRows: GoalMilestone[] = milestones.map(milestone => ({ id: milestone.id, title: milestone.title.trim(), targetValue: milestone.value ? Number(milestone.value) : null, reachedAt: editing?.milestones.find(item => item.id === milestone.id)?.reachedAt ?? null }));
    if (milestoneRows.some(item => !item.title || item.targetValue == null || !Number.isFinite(item.targetValue) || item.targetValue <= 0)) { setFormError('Each milestone needs a title and positive target value.'); return; }
    const input = { name, description, category, startDate, targetDate: targetDate || null, targetValue: numericTarget, unit, habitIds, milestones: milestoneRows };
    const result = editing ? updateGoal(editing.id, input) : createGoal(input);
    if (result.error) { setFormError(result.error); return; }
    setEditorVisible(false);
  };

  const confirmDelete = (goal: Goal) => Alert.alert('Delete goal?', `“${goal.name}” and its milestones will be deleted. Habit records remain unchanged.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete goal', style: 'destructive', onPress: () => deleteGoal(goal.id) },
  ]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.headingGroup}>{onClose && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close goals" onPress={onClose} style={styles.back}><Ionicons name="arrow-back" size={21} color={colors.primaryText} /></TouchableOpacity>}<View><Text style={[styles.eyebrow, { color: colors.accent }]}>LONG-TERM DIRECTION</Text><Text style={[styles.title, { color: colors.primaryText }]}>Goals</Text></View></View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Create goal" style={[styles.addButton, { backgroundColor: colors.accent }]} onPress={() => openEditor()}><Ionicons name="add" size={20} color="#000" /><Text style={styles.addText}>New</Text></TouchableOpacity>
        </View>
        {!allowed && <View style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.border }]}><Ionicons name="lock-closed-outline" size={18} color={colors.accent} /><Text style={[styles.noticeText, { color: colors.secondaryText }]}>Goal tracking is included with Daymark Pro. Your saved goals remain visible.</Text><TouchableOpacity onPress={() => setPaywallVisible(true)}><Text style={{ color: colors.accent, fontWeight: '700' }}>See Pro</Text></TouchableOpacity></View>}
        <TouchableOpacity accessibilityRole="button" onPress={() => setShowArchived(value => !value)} style={styles.archiveToggle}><Text style={{ color: colors.accent, fontWeight: '700' }}>{showArchived ? 'Show active goals' : `Archive (${goals.filter(goal => goal.archivedAt).length})`}</Text></TouchableOpacity>
        {goalError && <Text accessibilityRole="alert" style={[styles.error, { color: colors.error }]}>{goalError}</Text>}
        {isLoadingGoals ? <View style={styles.loading}><ActivityIndicator color={colors.accent} /><Text style={{ color: colors.secondaryText, marginTop: 10 }}>Loading goals…</Text></View> : list.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.emptyIcon, { backgroundColor: `${colors.accent}1A` }]}><Ionicons name="flag-outline" size={27} color={colors.accent} /></View><Text style={[styles.emptyTitle, { color: colors.primaryText }]}>{showArchived ? 'No archived goals' : 'Choose a direction'}</Text><Text style={[styles.emptyText, { color: colors.secondaryText }]}>Link a goal to your habits and watch progress build from your actual completed records.</Text>{!showArchived && <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.accent }]} onPress={() => openEditor()}><Text style={styles.primaryText}>Create a goal</Text></TouchableOpacity>}</View>
        ) : list.map(goal => {
            const progress = calculateGoalProgress(goal, habits, todayDateStr, parseLocalDate(todayDateStr) ?? new Date());
          const linked = goal.habitIds.map(id => habits.find(habit => habit.id === id)).filter(Boolean);
          return <View key={goal.id} style={[styles.goalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.goalHead}><View style={{ flex: 1 }}><Text style={[styles.goalName, { color: colors.primaryText }]}>{goal.name}</Text><Text style={[styles.goalMeta, { color: colors.secondaryText }]}>{goal.category} · {goal.startDate}{goal.targetDate ? ` → ${goal.targetDate}` : ''}</Text></View>{goal.completedAt && <Ionicons name="checkmark-circle" size={23} color={colors.accent} />}</View>
            {!!goal.description && <Text style={[styles.description, { color: colors.secondaryText }]}>{goal.description}</Text>}
            <View style={styles.progressSummary}><Text style={[styles.progressValue, { color: colors.primaryText }]}>{progress.currentValue.toLocaleString()}{goal.targetValue != null ? ` / ${goal.targetValue.toLocaleString()}` : ''} {goal.unit || (goal.targetValue == null ? 'successful habit days' : '')}</Text><Text style={[styles.goalMeta, { color: colors.accent }]}>{progress.percentage == null ? `${progress.linkedHabits} linked habits` : `${progress.percentage}%`}</Text></View>
            {progress.percentage != null && <View style={[styles.progressTrack, { backgroundColor: colors.secondaryBackground }]}><View style={[styles.progressFill, { width: `${progress.percentage}%`, backgroundColor: colors.accent }]} /></View>}
            <View style={styles.habitChips}>{linked.length ? linked.map(habit => habit && <View key={habit.id} style={[styles.habitChip, { backgroundColor: colors.secondaryBackground }]}><View style={[styles.habitDot, { backgroundColor: habit.color }]} /><Text numberOfLines={1} style={[styles.habitChipText, { color: colors.secondaryText }]}>{habit.name}</Text></View>) : <Text style={[styles.goalMeta, { color: colors.mutedText }]}>No active linked habits</Text>}</View>
            {!!goal.milestones.length && <View style={styles.milestoneSection}><Text style={[styles.milestoneHeading, { color: colors.secondaryText }]}>MILESTONES</Text>{goal.milestones.map(milestone => { const reached = Boolean(milestone.reachedAt); const eligible = milestone.targetValue != null && progress.currentValue >= milestone.targetValue; return <View key={milestone.id} style={styles.milestoneRow}><Ionicons name={reached ? 'checkmark-circle' : 'ellipse-outline'} size={17} color={reached ? colors.accent : colors.mutedText} /><Text style={[styles.milestoneText, { color: colors.primaryText }]}>{milestone.title} · {milestone.targetValue}{goal.unit ? ` ${goal.unit}` : ''}</Text>{!reached && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Mark milestone ${milestone.title} reached`} disabled={!allowed || !eligible} onPress={() => { const result = markMilestoneReached(goal.id, milestone.id); if (result.error) Alert.alert('Milestone not reached yet', result.error); }}><Text style={{ color: eligible ? colors.accent : colors.mutedText, fontSize: 11, fontWeight: '700' }}>Mark</Text></TouchableOpacity>}</View>; })}</View>}
            {showArchived ? <View style={styles.actions}><TouchableOpacity style={styles.action} onPress={() => restoreGoal(goal.id)} disabled={!allowed}><Ionicons name="refresh-outline" size={17} color={colors.accent} /><Text style={[styles.actionText, { color: colors.accent }]}>Restore</Text></TouchableOpacity><TouchableOpacity style={styles.action} onPress={() => confirmDelete(goal)} disabled={!allowed}><Ionicons name="trash-outline" size={17} color={colors.error} /><Text style={[styles.actionText, { color: colors.error }]}>Delete</Text></TouchableOpacity></View> : <View style={styles.actions}>
              {goal.completedAt ? <TouchableOpacity style={styles.action} onPress={() => reopenGoal(goal.id)} disabled={!allowed}><Ionicons name="refresh-outline" size={17} color={colors.secondaryText} /><Text style={[styles.actionText, { color: colors.secondaryText }]}>Reopen</Text></TouchableOpacity> : progress.canComplete ? <TouchableOpacity style={styles.action} onPress={() => { const result = completeGoal(goal.id); if (result.error) Alert.alert('Goal not complete', result.error); }} disabled={!allowed}><Ionicons name="checkmark-circle-outline" size={17} color={colors.accent} /><Text style={[styles.actionText, { color: colors.accent }]}>Mark complete</Text></TouchableOpacity> : <Text style={[styles.goalMeta, { color: colors.mutedText }]}>Complete once the configured target is reached</Text>}
              <TouchableOpacity style={styles.action} onPress={() => openEditor(goal)} disabled={!allowed}><Ionicons name="create-outline" size={17} color={colors.secondaryText} /><Text style={[styles.actionText, { color: colors.secondaryText }]}>Edit</Text></TouchableOpacity><TouchableOpacity style={styles.action} onPress={() => archiveGoal(goal.id)} disabled={!allowed}><Ionicons name="archive-outline" size={17} color={colors.secondaryText} /><Text style={[styles.actionText, { color: colors.secondaryText }]}>Archive</Text></TouchableOpacity>
            </View>}
          </View>;
        })}
      </ScrollView>

      <Modal visible={editorVisible} animationType="slide" transparent onRequestClose={() => setEditorVisible(false)}><View style={styles.modalBackdrop}><View style={[styles.editor, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + spacing.md }]}><View style={styles.editorHeader}><View><Text style={[styles.eyebrow, { color: colors.accent }]}>GOAL BUILDER</Text><Text style={[styles.editorTitle, { color: colors.primaryText }]}>{editing ? 'Edit goal' : 'New goal'}</Text></View><TouchableOpacity accessibilityLabel="Close goal editor" onPress={() => setEditorVisible(false)}><Ionicons name="close" size={22} color={colors.secondaryText} /></TouchableOpacity></View><ScrollView keyboardShouldPersistTaps="handled">
        <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>NAME</Text><TextInput accessibilityLabel="Goal name" value={name} onChangeText={setName} maxLength={80} placeholder="Run 100 kilometres" placeholderTextColor={colors.mutedText} style={[styles.input, { color: colors.primaryText, backgroundColor: colors.secondaryBackground, borderColor: colors.border }]} />
        <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>DESCRIPTION</Text><TextInput accessibilityLabel="Goal description" value={description} onChangeText={setDescription} maxLength={1000} multiline placeholder="Why this matters to you" placeholderTextColor={colors.mutedText} style={[styles.input, styles.textArea, { color: colors.primaryText, backgroundColor: colors.secondaryBackground, borderColor: colors.border }]} />
        <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>CATEGORY</Text><TextInput accessibilityLabel="Goal category" value={category} onChangeText={setCategory} maxLength={50} placeholder="Personal" placeholderTextColor={colors.mutedText} style={[styles.input, { color: colors.primaryText, backgroundColor: colors.secondaryBackground, borderColor: colors.border }]} />
        <View style={styles.dateRow}><View style={{ flex: 1 }}><Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>START DATE</Text><TextInput accessibilityLabel="Goal start date" value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.mutedText} style={[styles.input, { color: colors.primaryText, backgroundColor: colors.secondaryBackground, borderColor: colors.border }]} /></View><View style={{ flex: 1 }}><Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>TARGET DATE</Text><TextInput accessibilityLabel="Goal target date" value={targetDate} onChangeText={setTargetDate} placeholder="Optional" placeholderTextColor={colors.mutedText} style={[styles.input, { color: colors.primaryText, backgroundColor: colors.secondaryBackground, borderColor: colors.border }]} /></View></View>
        <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>TARGET CRITERIA</Text><View style={styles.dateRow}><TextInput accessibilityLabel="Goal target value" value={targetValue} onChangeText={setTargetValue} keyboardType="decimal-pad" placeholder="e.g. 100" placeholderTextColor={colors.mutedText} style={[styles.input, { flex: 1, color: colors.primaryText, backgroundColor: colors.secondaryBackground, borderColor: colors.border }]} /><TextInput accessibilityLabel="Goal target unit" value={unit} onChangeText={setUnit} maxLength={30} placeholder="km, books, sessions" placeholderTextColor={colors.mutedText} style={[styles.input, { flex: 1, color: colors.primaryText, backgroundColor: colors.secondaryBackground, borderColor: colors.border }]} /></View>
        <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>LINK HABITS</Text>{habits.length ? habits.map(habit => { const selected = habitIds.includes(habit.id); return <TouchableOpacity key={habit.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} style={[styles.habitOption, { borderColor: selected ? habit.color : colors.border, backgroundColor: selected ? `${habit.color}12` : colors.secondaryBackground }]} onPress={() => setHabitIds(current => selected ? current.filter(id => id !== habit.id) : [...current, habit.id])}><View style={[styles.habitDot, { backgroundColor: habit.color }]} /><Text style={[styles.habitOptionText, { color: colors.primaryText }]}>{habit.name}</Text><Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={selected ? habit.color : colors.mutedText} /></TouchableOpacity>; }) : <Text style={[styles.goalMeta, { color: colors.secondaryText }]}>Create an active habit first.</Text>}
        <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>MILESTONES</Text>{milestones.map(milestone => <View key={milestone.id} style={styles.milestoneEditRow}><Text style={[styles.milestoneText, { color: colors.primaryText }]}>{milestone.title} · {milestone.value}</Text><TouchableOpacity accessibilityLabel="Remove milestone" onPress={() => setMilestones(current => current.filter(item => item.id !== milestone.id))}><Ionicons name="close-circle-outline" size={19} color={colors.secondaryText} /></TouchableOpacity></View>)}<View style={styles.dateRow}><TextInput accessibilityLabel="Milestone title" value={milestoneTitle} onChangeText={setMilestoneTitle} placeholder="Milestone" placeholderTextColor={colors.mutedText} style={[styles.input, { flex: 1, color: colors.primaryText, backgroundColor: colors.secondaryBackground, borderColor: colors.border }]} /><TextInput accessibilityLabel="Milestone target value" value={milestoneTarget} onChangeText={setMilestoneTarget} keyboardType="decimal-pad" placeholder="Value" placeholderTextColor={colors.mutedText} style={[styles.input, { width: 86, color: colors.primaryText, backgroundColor: colors.secondaryBackground, borderColor: colors.border }]} /><TouchableOpacity style={[styles.option, { borderColor: colors.border }]} onPress={() => { if (!milestoneTitle.trim() || !milestoneTarget || !Number.isFinite(Number(milestoneTarget)) || Number(milestoneTarget) <= 0) { setFormError('Add a milestone title and positive target value.'); return; } setMilestones(current => [...current, { id: uuid(), title: milestoneTitle.trim(), value: milestoneTarget }]); setMilestoneTitle(''); setMilestoneTarget(''); setFormError(''); }}><Text style={[styles.optionText, { color: colors.primaryText }]}>Add</Text></TouchableOpacity></View>
        {formError ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.error }]}>{formError}</Text> : null}<TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.accent }]} onPress={saveGoal}><Text style={styles.primaryText}>{editing ? 'Save changes' : 'Create goal'}</Text></TouchableOpacity>
      </ScrollView></View></View></Modal>
      <PaywallModal visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 }, content: { paddingHorizontal: spacing.lg }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md, marginBottom: spacing.md }, headingGroup: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, back: { padding: 6 }, eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4 }, title: { fontSize: 30, fontWeight: '800', marginTop: 2 }, addButton: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radii.full, paddingHorizontal: 14, paddingVertical: 9 }, addText: { color: '#000', fontWeight: '800' },
  notice: { borderWidth: 1, borderRadius: radii.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: spacing.md }, noticeText: { flex: 1, fontSize: 12, lineHeight: 17 }, archiveToggle: { paddingVertical: spacing.sm, alignSelf: 'flex-end' }, error: { fontSize: 12, marginBottom: spacing.sm }, loading: { alignItems: 'center', paddingVertical: 70 }, empty: { borderWidth: 1, borderRadius: radii.lg, padding: spacing.xl, alignItems: 'center', marginTop: spacing.xl }, emptyIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md }, emptyTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' }, emptyText: { fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8, marginBottom: spacing.lg },
  goalCard: { borderWidth: 1, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.md }, goalHead: { flexDirection: 'row', alignItems: 'center' }, goalName: { fontSize: 17, fontWeight: '800' }, goalMeta: { fontSize: 11, marginTop: 4 }, description: { fontSize: 12, lineHeight: 18, marginTop: 8 }, progressSummary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md, marginBottom: 6 }, progressValue: { fontSize: 14, fontWeight: '700' }, progressTrack: { height: 6, borderRadius: radii.full, overflow: 'hidden' }, progressFill: { height: '100%', borderRadius: radii.full }, habitChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.md }, habitChip: { flexDirection: 'row', alignItems: 'center', borderRadius: radii.full, paddingHorizontal: 9, paddingVertical: 6, maxWidth: '100%' }, habitDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 }, habitChipText: { fontSize: 11, maxWidth: 180 },
  milestoneSection: { marginTop: spacing.md }, milestoneHeading: { fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 5 }, milestoneRow: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 30 }, milestoneText: { flex: 1, fontSize: 12 }, milestoneEditRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 }, actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16, marginTop: spacing.md }, action: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 36 }, actionText: { fontSize: 12, fontWeight: '700' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.65)' }, editor: { maxHeight: '94%', borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, borderWidth: 1, padding: spacing.lg }, editorHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }, editorTitle: { fontSize: 23, fontWeight: '800', marginTop: 3 }, fieldLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1, marginTop: spacing.md, marginBottom: 6 }, input: { borderWidth: 1, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 14 }, textArea: { minHeight: 65, textAlignVertical: 'top' }, dateRow: { flexDirection: 'row', gap: 8, alignItems: 'center' }, habitOption: { borderWidth: 1, borderRadius: radii.md, paddingHorizontal: 10, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', marginBottom: 7 }, habitOptionText: { flex: 1, fontSize: 13 }, option: { borderWidth: 1, borderRadius: radii.md, paddingHorizontal: 12, paddingVertical: 10 }, optionText: { fontSize: 12, fontWeight: '700' }, primaryButton: { borderRadius: radii.md, paddingVertical: 13, alignItems: 'center', marginTop: spacing.md }, primaryText: { color: '#000', fontSize: 14, fontWeight: '800' },
});
