import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { HabitReminder } from '../domain/habitTypes';
import {
  buildRepeatedDailyReminders,
  formatGapLabel,
  formatReminderTime,
  inferRepeatConfigFromReminders,
} from '../services/localReminders';
import { radii, spacing } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { MinimalModalHeader } from './MinimalModalHeader';
import { ClockTimePickerModal } from './ClockTimePickerModal';

interface HabitReminderModalProps {
  visible: boolean;
  reminders: HabitReminder[];
  defaultWeekdays: number[];
  accentColor: string;
  onClose: (updatedReminders: HabitReminder[]) => void;
}

const WEEKDAYS = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
  { label: 'Sun', value: 7 },
];

const MAX_REMINDERS = 12;

export const HabitReminderModal: React.FC<HabitReminderModalProps> = ({
  visible,
  reminders,
  defaultWeekdays,
  accentColor,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [draft, setDraft] = useState<HabitReminder[]>(reminders);
  const [clockIndex, setClockIndex] = useState<number | null>(null);
  const [showRepeatHelper, setShowRepeatHelper] = useState(false);

  const inferred = inferRepeatConfigFromReminders(reminders);
  const [repeatCount, setRepeatCount] = useState(inferred.repeatCount);
  const [gapUnit, setGapUnit] = useState<'min' | 'hr'>(
    inferred.intervalMinutes >= 60 && inferred.intervalMinutes % 60 === 0 ? 'hr' : 'min',
  );
  const [gapValueInput, setGapValueInput] = useState(
    inferred.intervalMinutes >= 60 && inferred.intervalMinutes % 60 === 0
      ? String(inferred.intervalMinutes / 60)
      : String(inferred.intervalMinutes),
  );
  const [repeatError, setRepeatError] = useState('');

  useEffect(() => {
    if (!visible) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(reminders);
    setClockIndex(null);
    const nextInferred = inferRepeatConfigFromReminders(reminders);
    setRepeatCount(nextInferred.repeatCount);
    setGapUnit(nextInferred.intervalMinutes >= 60 && nextInferred.intervalMinutes % 60 === 0 ? 'hr' : 'min');
    setGapValueInput(
      nextInferred.intervalMinutes >= 60 && nextInferred.intervalMinutes % 60 === 0
        ? String(nextInferred.intervalMinutes / 60)
        : String(nextInferred.intervalMinutes),
    );
    setRepeatError('');
  }, [visible, reminders]);

  const safeDefaultDays = defaultWeekdays.length > 0 ? defaultWeekdays : [1, 2, 3, 4, 5, 6, 7];

  const handleAddReminder = () => {
    if (draft.length >= MAX_REMINDERS) return;
    const last = draft[draft.length - 1];
    let nextHour = 10;
    let nextMinute = 0;
    if (last) {
      const total = Math.min(23 * 60 + 45, last.hour * 60 + last.minute + 120);
      nextHour = Math.floor(total / 60);
      nextMinute = total % 60;
    }
    const next: HabitReminder = {
      id: `reminder_${Date.now()}_${draft.length}`,
      hour: nextHour,
      minute: nextMinute,
      weekdays: safeDefaultDays,
      enabled: true,
    };
    setDraft(curr => [...curr, next]);
  };

  const handleDeleteReminder = (index: number) => {
    setDraft(curr => curr.filter((_, idx) => idx !== index));
  };

  const handleToggleWeekday = (index: number, dayValue: number) => {
    setDraft(curr =>
      curr.map((item, idx) => {
        if (idx !== index) return item;
        const exists = item.weekdays.includes(dayValue);
        const nextDays = exists ? item.weekdays.filter(d => d !== dayValue) : [...item.weekdays, dayValue].sort();
        if (nextDays.length === 0) return item; // keep at least 1 weekday selected
        return { ...item, weekdays: nextDays };
      }),
    );
  };

  const handleConfirmClockTime = (hour: number, minute: number) => {
    if (clockIndex === null) return;
    setDraft(curr => curr.map((item, idx) => (idx === clockIndex ? { ...item, hour, minute, enabled: true } : item)));
    setClockIndex(null);
  };

  const applyRepeatSchedule = () => {
    const raw = Number(gapValueInput.trim());
    if (!Number.isFinite(raw) || raw <= 0) {
      setRepeatError('Enter a valid gap between 5 min and 12 hr.');
      return;
    }
    const gapMins = Math.round(gapUnit === 'hr' ? raw * 60 : raw);
    if (gapMins < 5 || gapMins > 720) {
      setRepeatError('Time gap must be between 5 minutes and 12 hours.');
      return;
    }
    setRepeatError('');
    const anchor = draft[0] ?? { hour: 8, minute: 0, weekdays: safeDefaultDays };
    const built = buildRepeatedDailyReminders({
      startHour: anchor.hour,
      startMinute: anchor.minute,
      repeatCount,
      intervalMinutes: gapMins,
      weekdays: anchor.weekdays.length ? anchor.weekdays : safeDefaultDays,
      enabled: true,
      baseId: draft[0]?.id,
    });
    setDraft(built.reminders);
    setShowRepeatHelper(false);
  };

  const activeCount = draft.filter(r => r.enabled).length;
  const activeClockReminder = clockIndex !== null ? draft[clockIndex] : null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => onClose(draft)}>
      <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <MinimalModalHeader
          title="Reminder"
          subtitle={`${activeCount}/${draft.length}`}
          colors={colors}
          onClose={() => onClose(draft)}
          closeIcon="chevron-back"
          closeAccessibilityLabel="Save and close reminders"
          showHandle
        />

        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.helperCaption, { color: colors.secondaryText }]}>
            Reminders repeat at these times and stay quiet once the habit is done for the day.
          </Text>

          {draft.map((reminder, idx) => (
            <View
              key={reminder.id}
              style={[styles.reminderCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Text style={[styles.cardTitle, { color: colors.primaryText }]}>Reminder #{idx + 1}</Text>

              {/* Weekday Pills Row */}
              <View style={styles.weekdayRow}>
                {WEEKDAYS.map(day => {
                  const selected = reminder.weekdays.includes(day.value);
                  return (
                    <TouchableOpacity
                      key={day.value}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`Reminder ${idx + 1} ${day.label}`}
                      onPress={() => handleToggleWeekday(idx, day.value)}
                      style={[
                        styles.weekdayPill,
                        {
                          backgroundColor: selected ? accentColor : colors.secondaryBackground,
                          borderColor: selected ? accentColor : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.weekdayText,
                          { color: selected ? '#FFFFFF' : colors.secondaryText },
                        ]}
                      >
                        {day.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Time Display Button + Trash */}
              <View style={styles.timeActionRow}>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Edit time for Reminder ${idx + 1}`}
                  onPress={() => setClockIndex(idx)}
                  style={[
                    styles.timePickerBtn,
                    { backgroundColor: colors.secondaryBackground, borderColor: colors.border },
                  ]}
                >
                  <Ionicons name="time-outline" size={18} color={colors.secondaryText} />
                  <Text style={[styles.timePickerText, { color: colors.primaryText }]}>
                    {formatReminderTime(reminder.hour, reminder.minute)}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Delete Reminder ${idx + 1}`}
                  onPress={() => handleDeleteReminder(idx)}
                  style={[
                    styles.deleteBtn,
                    { backgroundColor: colors.secondaryBackground, borderColor: colors.border },
                  ]}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.secondaryText} />
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {draft.length < MAX_REMINDERS && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Add reminder"
              onPress={handleAddReminder}
              style={[styles.addBtn, { backgroundColor: accentColor }]}
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={20} color="#FFFFFF" />
              <Text style={styles.addBtnText}>Add Reminder</Text>
            </TouchableOpacity>
          )}

          {/* Optional Auto-Repeat Generator (Times per day + Gap) */}
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => setShowRepeatHelper(prev => !prev)}
            style={[styles.repeatHeaderBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={styles.repeatHeaderLeft}>
              <Ionicons name="repeat-outline" size={18} color={accentColor} />
              <View>
                <Text style={[styles.repeatHeaderTitle, { color: colors.primaryText }]}>
                  Repeat multiple times per day
                </Text>
                <Text style={[styles.repeatHeaderSub, { color: colors.secondaryText }]}>
                  Auto-space reminders by custom time gap
                </Text>
              </View>
            </View>
            <Ionicons name={showRepeatHelper ? 'chevron-up' : 'chevron-down'} size={18} color={colors.secondaryText} />
          </TouchableOpacity>

          {showRepeatHelper && (
            <View style={[styles.repeatPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.panelLabel, { color: colors.secondaryText }]}>TIMES PER DAY</Text>
              <View style={styles.chipsWrap}>
                {[1, 2, 3, 4, 6, 8, 12].map(cnt => {
                  const active = repeatCount === cnt;
                  return (
                    <TouchableOpacity
                      key={cnt}
                      onPress={() => setRepeatCount(cnt)}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: active ? accentColor : colors.secondaryBackground,
                          borderColor: active ? accentColor : colors.border,
                        },
                      ]}
                    >
                      <Text style={{ color: active ? '#FFFFFF' : colors.secondaryText, fontSize: 12, fontWeight: '700' }}>
                        {cnt}x
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {repeatCount > 1 && (
                <>
                  <Text style={[styles.panelLabel, { color: colors.secondaryText, marginTop: 14 }]}>
                    TIME GAP BETWEEN ALERTS
                  </Text>
                  <View style={styles.gapRow}>
                    <TextInput
                      accessibilityLabel="Gap duration"
                      value={gapValueInput}
                      onChangeText={setGapValueInput}
                      keyboardType="numeric"
                      placeholder="2"
                      placeholderTextColor={colors.mutedText}
                      style={[
                        styles.gapInput,
                        { color: colors.primaryText, backgroundColor: colors.secondaryBackground, borderColor: colors.border },
                      ]}
                    />
                    <View style={[styles.unitToggle, { borderColor: colors.border }]}>
                      {(['min', 'hr'] as const).map(unitOpt => {
                        const selected = gapUnit === unitOpt;
                        return (
                          <TouchableOpacity
                            key={unitOpt}
                            onPress={() => setGapUnit(unitOpt)}
                            style={[
                              styles.unitBtn,
                              { backgroundColor: selected ? accentColor : colors.secondaryBackground },
                            ]}
                          >
                            <Text style={{ color: selected ? '#FFFFFF' : colors.secondaryText, fontSize: 12, fontWeight: '700' }}>
                              {unitOpt}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                  <Text style={[styles.gapHint, { color: colors.mutedText }]}>
                    Starts from {draft[0] ? formatReminderTime(draft[0].hour, draft[0].minute) : '8:00 AM'} · every{' '}
                    {Number(gapValueInput) > 0
                      ? formatGapLabel(gapUnit === 'hr' ? Number(gapValueInput) * 60 : Number(gapValueInput))
                      : '—'}
                  </Text>
                </>
              )}

              {!!repeatError && <Text style={[styles.errorText, { color: colors.error }]}>{repeatError}</Text>}

              <TouchableOpacity
                accessibilityRole="button"
                onPress={applyRepeatSchedule}
                style={[styles.applyBtn, { backgroundColor: `${accentColor}22`, borderColor: `${accentColor}66` }]}
              >
                <Text style={[styles.applyBtnText, { color: accentColor }]}>Generate {repeatCount} Reminders</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        <ClockTimePickerModal
          visible={clockIndex !== null}
          initialHour={activeClockReminder?.hour ?? 10}
          initialMinute={activeClockReminder?.minute ?? 0}
          onCancel={() => setClockIndex(null)}
          onConfirm={handleConfirmClockTime}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, gap: 14 },
  helperCaption: { fontSize: 13, lineHeight: 19, marginBottom: 2 },
  reminderCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  weekdayRow: {
    flexDirection: 'row',
    gap: 6,
  },
  weekdayPill: {
    flex: 1,
    height: 36,
    borderRadius: radii.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayText: { fontSize: 12, fontWeight: '700' },
  timeActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  timePickerBtn: {
    flex: 1,
    height: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  timePickerText: { fontSize: 15, fontWeight: '700', letterSpacing: 0.4 },
  deleteBtn: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    height: 52,
    borderRadius: radii.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  repeatHeaderBtn: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  repeatHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  repeatHeaderTitle: { fontSize: 14, fontWeight: '700' },
  repeatHeaderSub: { fontSize: 12, marginTop: 2 },
  repeatPanel: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  panelLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.full,
    borderWidth: 1,
  },
  gapRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  gapInput: {
    width: 76,
    height: 42,
    borderRadius: radii.md,
    borderWidth: 1,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
  },
  unitToggle: {
    flexDirection: 'row',
    height: 42,
    borderRadius: radii.full,
    borderWidth: 1,
    overflow: 'hidden',
  },
  unitBtn: {
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gapHint: { fontSize: 12, marginTop: 8 },
  errorText: { fontSize: 12, marginTop: 8 },
  applyBtn: {
    height: 44,
    borderRadius: radii.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  applyBtnText: { fontSize: 13, fontWeight: '700' },
});
