import React, { useEffect, useMemo, useState } from 'react';
import {
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
import * as Haptics from 'expo-haptics';
import { Habit } from '../services/HabitContext';
import { useTheme } from '../theme/ThemeProvider';
import { usePreferences } from '../services/PreferencesContext';
import { JournalEntry, useJournal } from '../services/JournalContext';
import {
  addLocalDays,
  calculateCompletionStats,
  calculateStreakStats,
  canLogHabitOnDate,
  getHabitDayStatus,
  isPausedOnDate,
  parseLocalDate,
} from '../domain/habitEngine';
import { formatReminderTime } from '../services/localReminders';
import { radii, spacing } from '../theme/tokens';
import { HabitDotGrid } from './HabitDotGrid';
import { HabitTrackingControl } from './HabitTrackingControl';
import { MonthYearPickerModal } from './MonthYearPickerModal';
import { AnimatedMonthContainer, AnimatedPopTouchable } from './AnimatedMonthGrid';

interface HabitDetailModalProps {
  habit: Habit | null;
  todayDateStr: string;
  showArchived: boolean;
  onClose: () => void;
  onEdit: (habit: Habit) => void;
  onDelete: (id: string, name: string) => void;
  onToggleDate: (habitId: string, dateStr: string) => void;
  onRecordLog: (id: string, log: any) => { error?: string };
  onPause: (habit: Habit) => void;
  onResume: (id: string) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
}

interface CalendarCell {
  dateStr: string;
  dayNum: number;
  inCurrentMonth: boolean;
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const createNoteUuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });

const formatYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Minimalist habit detail sheet featuring heatmap, interactive full-month calendar, and habit notes. */
export const HabitDetailModal: React.FC<HabitDetailModalProps> = ({
  habit,
  todayDateStr,
  showArchived,
  onClose,
  onEdit,
  onDelete,
  onToggleDate,
  onRecordLog,
  onPause,
  onResume,
  onArchive,
  onRestore,
}) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { preferences } = usePreferences();
  const { entries, saveEntry, deleteEntry } = useJournal();

  const todayRef = useMemo(() => parseLocalDate(todayDateStr) ?? new Date(), [todayDateStr]);
  const [viewYear, setViewYear] = useState(todayRef.getFullYear());
  const [viewMonth, setViewMonth] = useState(todayRef.getMonth());
  const [monthPickerVisible, setMonthPickerVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayDateStr);

  // Quick Note Modal State
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [editingNote, setEditingNote] = useState<JournalEntry | null>(null);
  const [noteDate, setNoteDate] = useState(todayDateStr);
  const [noteText, setNoteText] = useState('');
  const [noteError, setNoteError] = useState('');

  useEffect(() => {
    if (!habit) return;
    const ref = parseLocalDate(todayDateStr) ?? new Date();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setViewYear(ref.getFullYear());
    setViewMonth(ref.getMonth());
    setSelectedDate(todayDateStr);
  }, [habit?.id, todayDateStr]); // eslint-disable-line react-hooks/exhaustive-deps

  const weekdayHeaders = useMemo(
    () => [...WEEKDAY_NAMES.slice(preferences.weekStart), ...WEEKDAY_NAMES.slice(0, preferences.weekStart)],
    [preferences.weekStart],
  );

  const monthRows = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const startOffset = (firstOfMonth.getDay() - preferences.weekStart + 7) % 7;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

    const cells: CalendarCell[] = [];
    for (let idx = 0; idx < totalCells; idx++) {
      const dayDelta = idx - startOffset;
      const cellDate = new Date(viewYear, viewMonth, 1 + dayDelta);
      cells.push({
        dateStr: formatYmd(cellDate),
        dayNum: cellDate.getDate(),
        inCurrentMonth: cellDate.getMonth() === viewMonth && cellDate.getFullYear() === viewYear,
      });
    }

    const rows: CalendarCell[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      rows.push(cells.slice(i, i + 7));
    }
    return rows;
  }, [viewYear, viewMonth, preferences.weekStart]);

  const habitNotes = useMemo(
    () => (habit ? entries.filter(e => e.habitId === habit.id) : []),
    [entries, habit],
  );

  const notesByDate = useMemo(() => {
    const map = new Map<string, JournalEntry>();
    for (const entry of habitNotes) {
      if (!map.has(entry.date)) map.set(entry.date, entry);
    }
    return map;
  }, [habitNotes]);

  if (!habit) return null;

  const stats = calculateStreakStats(habit, todayRef);
  const recentRate = calculateCompletionStats(habit, addLocalDays(todayDateStr, -29), todayDateStr).percentage;
  const isTodayDone = getHabitDayStatus(habit, todayDateStr, todayRef) === 'completed';

  const shiftMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  const jumpToToday = () => {
    setViewYear(todayRef.getFullYear());
    setViewMonth(todayRef.getMonth());
    setSelectedDate(todayDateStr);
  };

  const openNoteEditor = (targetDate: string, existing?: JournalEntry) => {
    setEditingNote(existing ?? null);
    setNoteDate(targetDate);
    setNoteText(existing?.text ?? '');
    setNoteError('');
    setNoteModalVisible(true);
  };

  const handleSaveNote = () => {
    const result = saveEntry({
      id: editingNote?.id ?? createNoteUuid(),
      habitId: habit.id,
      date: noteDate,
      text: noteText,
    });
    if (result.error) {
      setNoteError(result.error);
      return;
    }
    setNoteModalVisible(false);
  };

  const handleDeleteNote = (entry: JournalEntry) => {
    Alert.alert('Delete note?', 'This note will be removed from your journal.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteEntry(entry.id);
          setNoteModalVisible(false);
        },
      },
    ]);
  };

  const handleTapDay = (cell: CalendarCell) => {
    if (!cell.inCurrentMonth || cell.dateStr > todayDateStr) return;
    setSelectedDate(cell.dateStr);
    if (!habit.archivedAt && habit.habitKind !== 'quit' && habit.trackingMethod === 'yes_no') {
      if (canLogHabitOnDate(habit, cell.dateStr, todayRef)) {
        onToggleDate(habit.id, cell.dateStr);
      }
    }
  };

  const handleLongPressDay = (cell: CalendarCell) => {
    if (!cell.inCurrentMonth) return;
    if (preferences.hapticsEnabled) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    const existing = notesByDate.get(cell.dateStr);
    openNoteEditor(cell.dateStr, existing);
  };

  const needsValueControl = habit.habitKind === 'quit' || habit.trackingMethod !== 'yes_no';

  return (
    <Modal animationType="slide" presentationStyle="fullScreen" visible={!!habit} onRequestClose={onClose}>
      <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        {/* Top Circle Navigation Header */}
        <View style={styles.topBar}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Close habit detail"
            onPress={onClose}
            style={[styles.circleBtn, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}
          >
            <Ionicons name="chevron-back" size={20} color={colors.primaryText} />
          </TouchableOpacity>

          <View style={styles.topRightActions}>
            {!showArchived && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Edit habit"
                onPress={() => onEdit(habit)}
                style={[styles.circleBtn, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}
              >
                <Ionicons name="create-outline" size={18} color={colors.primaryText} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Delete habit"
              onPress={() => onDelete(habit.id, habit.name)}
              style={[styles.circleBtn, { backgroundColor: `${colors.error}18`, borderColor: `${colors.error}45` }]}
            >
              <Ionicons name="trash-outline" size={18} color={colors.error} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 36 }]}
        >
          {/* Habit Identity */}
          <View style={styles.heroRow}>
            <View style={[styles.heroIcon, { backgroundColor: `${habit.color}22` }]}>
              <Ionicons name={habit.icon} size={25} color={habit.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.habitTitle, { color: colors.primaryText }]}>{habit.name}</Text>
              <Text style={[styles.habitSubtitle, { color: colors.secondaryText }]}>
                {habit.description?.trim() || 'No description'}
              </Text>
            </View>
          </View>

          {/* Top 16-Week Heatmap Card */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <HabitDotGrid
              habit={habit}
              todayDateStr={todayDateStr}
              isDark={isDark}
              mutedTextColor={colors.mutedText}
              weeks={16}
              dotSize={11}
              dotGap={3}
              showMonthLabels
              showWeekdayLabels
            />
          </View>

          {/* Streak + Schedule Pills */}
          <View style={styles.pillsRow}>
            <View style={[styles.infoPill, { backgroundColor: `${habit.color}1C` }]}>
              <Ionicons name="flame" size={14} color={habit.color} />
              <Text style={[styles.infoPillText, { color: habit.color }]}>
                {habit.streak} {habit.streak === 1 ? 'day' : 'days'}
              </Text>
            </View>
            <View style={[styles.infoPill, { backgroundColor: `${habit.color}16` }]}>
              <Ionicons name="repeat" size={14} color={habit.color} />
              <Text style={[styles.infoPillText, { color: habit.color }]}>{habit.targetFrequency}</Text>
            </View>
            <View style={[styles.infoPill, { backgroundColor: colors.secondaryBackground }]}>
              <Text style={[styles.infoPillText, { color: colors.secondaryText }]}>
                Best {stats.bestStreak}d · {recentRate}%
              </Text>
            </View>
          </View>

          {/* Interactive Full-Month Calendar Card */}
          <View style={[styles.card, styles.calendarCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.weekdayHeaderRow}>
              {weekdayHeaders.map(day => (
                <View key={day} style={styles.weekdayHeaderCell}>
                  <Text style={[styles.weekdayHeaderText, { color: colors.secondaryText }]}>{day}</Text>
                </View>
              ))}
            </View>

            <AnimatedMonthContainer
              year={viewYear}
              month={viewMonth}
              onShiftMonth={shiftMonth}
              style={styles.monthGrid}
            >
              {monthRows.map((row, rIdx) => (
                <View key={rIdx} style={styles.monthRow}>
                  {row.map(cell => {
                    const isFuture = cell.dateStr > todayDateStr;
                    const isToday = cell.dateStr === todayDateStr;
                    const isSelected = cell.dateStr === selectedDate;
                    const done =
                      cell.inCurrentMonth &&
                      !isFuture &&
                      getHabitDayStatus(habit, cell.dateStr, todayRef) === 'completed';
                    const trackable =
                      cell.inCurrentMonth &&
                      !isFuture &&
                      canLogHabitOnDate(habit, cell.dateStr, todayRef);
                    const hasNote = cell.inCurrentMonth && notesByDate.has(cell.dateStr);

                    return (
                      <AnimatedPopTouchable
                        key={cell.dateStr}
                        pressScale={0.86}
                        containerStyle={styles.dayCellSlot}
                        disabled={!cell.inCurrentMonth || isFuture}
                        activeOpacity={0.75}
                        onPress={() => handleTapDay(cell)}
                        onLongPress={() => handleLongPressDay(cell)}
                        accessibilityRole="button"
                        accessibilityLabel={`${cell.dateStr}${done ? ', completed' : ''}`}
                        style={[
                          styles.dayCell,
                          done && { backgroundColor: `${habit.color}2A` },
                          isToday && {
                            borderWidth: 1.5,
                            borderColor: habit.color,
                          },
                          isSelected && !isToday && needsValueControl && {
                            borderWidth: 1,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayNumText,
                            {
                              color: !cell.inCurrentMonth
                                ? `${colors.mutedText}75`
                                : isFuture
                                  ? colors.mutedText
                                  : done || isToday || trackable
                                    ? colors.primaryText
                                    : colors.secondaryText,
                              fontWeight: isToday || done ? '700' : '500',
                            },
                          ]}
                        >
                          {cell.dayNum}
                        </Text>
                        <View style={styles.dayDotsRow}>
                          {done && <View style={[styles.completedDot, { backgroundColor: habit.color }]} />}
                          {hasNote && <View style={[styles.noteDot, { backgroundColor: colors.accent }]} />}
                        </View>
                      </AnimatedPopTouchable>
                    );
                  })}
                </View>
              ))}
            </AnimatedMonthContainer>

            {/* Month Footer Controls */}
            <View style={styles.calendarFooter}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Choose month and year"
                onPress={() => setMonthPickerVisible(true)}
                style={[styles.monthPickerPill, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}
              >
                <Text style={[styles.monthPickerText, { color: colors.primaryText }]}>
                  {MONTH_SHORT[viewMonth]} {viewYear}
                </Text>
                <Ionicons name="chevron-down" size={14} color={colors.secondaryText} />
              </TouchableOpacity>

              <TouchableOpacity
                accessibilityRole="button"
                onPress={jumpToToday}
                style={[styles.todayPill, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}
              >
                <Text style={[styles.todayPillText, { color: colors.primaryText }]}>Today</Text>
              </TouchableOpacity>

              <View style={styles.monthNavArrows}>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Previous month"
                  onPress={() => shiftMonth(-1)}
                  style={[styles.navArrowBtn, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}
                >
                  <Ionicons name="chevron-back" size={16} color={colors.primaryText} />
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Next month"
                  onPress={() => shiftMonth(1)}
                  style={[styles.navArrowBtn, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}
                >
                  <Ionicons name="chevron-forward" size={16} color={colors.primaryText} />
                </TouchableOpacity>
              </View>
            </View>

            <Text style={[styles.calendarHint, { color: colors.mutedText }]}>
              Tap a day to log · Press and hold a day to add a note
            </Text>
          </View>

          {/* Value / Quit Day Control for Selected Date */}
          {needsValueControl && canLogHabitOnDate(habit, selectedDate, todayRef) && !habit.archivedAt && (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.subCardLabel, { color: colors.secondaryText }]}>
                LOG FOR {selectedDate === todayDateStr ? 'TODAY' : selectedDate}
              </Text>
              <HabitTrackingControl habit={habit} date={selectedDate} onSave={onRecordLog} />
            </View>
          )}

          {/* Notes Section */}
          <View style={[styles.card, styles.notesCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.notesHeaderRow}>
              <View style={[styles.noteIconBox, { backgroundColor: `${habit.color}1C` }]}>
                <Ionicons name="create-outline" size={18} color={habit.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.notesTitle, { color: colors.primaryText }]}>
                  {habitNotes.length === 0 ? 'No notes yet' : `${habitNotes.length} ${habitNotes.length === 1 ? 'note' : 'notes'}`}
                </Text>
                <Text style={[styles.notesSubtitle, { color: colors.secondaryText }]}>
                  What went well? What got in the way?
                </Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Add habit note"
                onPress={() => openNoteEditor(selectedDate, notesByDate.get(selectedDate))}
                style={[styles.noteAddCircle, { backgroundColor: `${habit.color}24` }]}
              >
                <Ionicons name="add" size={20} color={habit.color} />
              </TouchableOpacity>
            </View>

            {habitNotes.length > 0 && (
              <View style={[styles.notesList, { borderTopColor: colors.border }]}>
                {habitNotes.slice(0, 6).map(entry => (
                  <TouchableOpacity
                    key={entry.id}
                    onPress={() => openNoteEditor(entry.date, entry)}
                    style={[styles.noteItem, { backgroundColor: colors.secondaryBackground }]}
                  >
                    <View style={styles.noteItemTop}>
                      <Text style={[styles.noteItemDate, { color: habit.color }]}>{entry.date}</Text>
                      <Ionicons name="pencil-outline" size={14} color={colors.mutedText} />
                    </View>
                    <Text style={[styles.noteItemText, { color: colors.primaryText }]} numberOfLines={3}>
                      {entry.text}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Complete Today CTA (for yes/no habits) */}
          {!needsValueControl && canLogHabitOnDate(habit, todayDateStr, todayRef) && !habit.archivedAt && (
            <TouchableOpacity
              style={[
                styles.primaryCta,
                {
                  backgroundColor: isTodayDone ? habit.color : colors.secondaryBackground,
                  borderColor: isTodayDone ? habit.color : colors.border,
                },
              ]}
              activeOpacity={0.8}
              onPress={() => {
                onToggleDate(habit.id, todayDateStr);
              }}
            >
              <Ionicons
                name={isTodayDone ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
                color={isTodayDone ? '#FFFFFF' : colors.primaryText}
              />
              <Text style={[styles.primaryCtaText, { color: isTodayDone ? '#FFFFFF' : colors.primaryText }]}>
                {isTodayDone ? 'Completed Today' : 'Complete Today'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Reminder Summary & Management Pills */}
          {!!habit.reminders?.length && (
            <Text style={[styles.reminderMeta, { color: colors.secondaryText }]}>
              🔔 Reminders:{' '}
              {habit.reminders
                .filter(r => r.enabled)
                .map(r => formatReminderTime(r.hour, r.minute))
                .join(', ') || 'All disabled'}
            </Text>
          )}

          <View style={styles.manageRow}>
            {showArchived ? (
              <TouchableOpacity
                style={[styles.managePill, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => onRestore(habit.id)}
              >
                <Ionicons name="refresh-outline" size={16} color={colors.accent} />
                <Text style={[styles.manageText, { color: colors.accent }]}>Restore</Text>
              </TouchableOpacity>
            ) : (
              <>
                {isPausedOnDate(habit, todayDateStr) ? (
                  <TouchableOpacity
                    style={[styles.managePill, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => onResume(habit.id)}
                  >
                    <Ionicons name="play-outline" size={16} color={colors.accent} />
                    <Text style={[styles.manageText, { color: colors.accent }]}>Resume</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.managePill, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => onPause(habit)}
                  >
                    <Ionicons name="pause-outline" size={16} color={colors.secondaryText} />
                    <Text style={[styles.manageText, { color: colors.secondaryText }]}>Pause</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.managePill, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => onArchive(habit.id)}
                >
                  <Ionicons name="archive-outline" size={16} color={colors.secondaryText} />
                  <Text style={[styles.manageText, { color: colors.secondaryText }]}>Archive</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>

        {/* Quick Habit Note Modal */}
        <Modal
          visible={noteModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setNoteModalVisible(false)}
        >
          <View style={styles.noteBackdrop}>
            <View
              style={[
                styles.noteSheet,
                { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + spacing.md },
              ]}
            >
              <View style={styles.noteSheetHandleRow}>
                <View style={[styles.noteSheetHandle, { backgroundColor: colors.border }]} />
              </View>
              <View style={styles.noteSheetHeader}>
                <TouchableOpacity
                  accessibilityLabel="Close note editor"
                  onPress={() => setNoteModalVisible(false)}
                  style={[styles.circleBtnSmall, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}
                >
                  <Ionicons name="close" size={18} color={colors.primaryText} />
                </TouchableOpacity>
                <Text style={[styles.noteSheetTitle, { color: colors.primaryText }]}>
                  {editingNote ? 'Edit Note' : 'Day Note'} · {noteDate}
                </Text>
                {editingNote ? (
                  <TouchableOpacity
                    accessibilityLabel="Delete note"
                    onPress={() => handleDeleteNote(editingNote)}
                    style={[styles.circleBtnSmall, { backgroundColor: `${colors.error}18`, borderColor: `${colors.error}45` }]}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.error} />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.noteHeaderSpacer} />
                )}
              </View>

              <TextInput
                accessibilityLabel="Habit note text"
                value={noteText}
                onChangeText={setNoteText}
                multiline
                maxLength={5000}
                textAlignVertical="top"
                placeholder="What went well? What got in the way?"
                placeholderTextColor={colors.mutedText}
                style={[
                  styles.noteInput,
                  { color: colors.primaryText, backgroundColor: colors.secondaryBackground, borderColor: colors.border },
                ]}
              />
              {!!noteError && <Text style={[styles.noteErrorText, { color: colors.error }]}>{noteError}</Text>}
              <TouchableOpacity
                accessibilityRole="button"
                onPress={handleSaveNote}
                style={[styles.noteSaveBtn, { backgroundColor: habit.color }]}
              >
                <Text style={styles.noteSaveBtnText}>Save Note</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <MonthYearPickerModal
          visible={monthPickerVisible}
          monthIndex={viewMonth}
          year={viewYear}
          accentColor={habit.color}
          onCancel={() => setMonthPickerVisible(false)}
          onConfirm={(nextMonth, nextYear) => {
            setViewMonth(nextMonth);
            setViewYear(nextYear);
            setMonthPickerVisible(false);
          }}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
  },
  topRightActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    gap: 14,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 4,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  habitTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  habitSubtitle: { fontSize: 13, marginTop: 2 },
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: 14,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  infoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.full,
  },
  infoPillText: { fontSize: 13, fontWeight: '700' },
  calendarCard: {
    paddingTop: 16,
    paddingBottom: 14,
  },
  weekdayHeaderRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekdayHeaderCell: {
    flex: 1,
    alignItems: 'center',
  },
  weekdayHeaderText: { fontSize: 12, fontWeight: '600' },
  monthGrid: { gap: 6 },
  monthRow: { flexDirection: 'row', gap: 4 },
  dayCellSlot: {
    flex: 1,
    aspectRatio: 1,
    maxHeight: 46,
  },
  dayCell: {
    flex: 1,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  dayNumText: { fontSize: 14 },
  dayDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 6,
    marginTop: 2,
  },
  completedDot: { width: 4, height: 4, borderRadius: 2 },
  noteDot: { width: 4, height: 4, borderRadius: 2 },
  calendarFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 16,
  },
  monthPickerPill: {
    flex: 1,
    height: 38,
    borderRadius: radii.full,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthPickerText: { fontSize: 13, fontWeight: '700' },
  todayPill: {
    height: 38,
    borderRadius: radii.full,
    borderWidth: 1,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayPillText: { fontSize: 13, fontWeight: '700' },
  monthNavArrows: { flexDirection: 'row', gap: 6 },
  navArrowBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarHint: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
  },
  subCardLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    marginBottom: 8,
  },
  notesCard: { gap: 12 },
  notesHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  noteIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notesTitle: { fontSize: 15, fontWeight: '700' },
  notesSubtitle: { fontSize: 12, marginTop: 2 },
  noteAddCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notesList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    gap: 8,
  },
  noteItem: {
    borderRadius: radii.md,
    padding: 12,
    gap: 4,
  },
  noteItemTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  noteItemDate: { fontSize: 11, fontWeight: '700' },
  noteItemText: { fontSize: 13, lineHeight: 19 },
  primaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: radii.full,
    borderWidth: 1,
  },
  primaryCtaText: { fontSize: 15, fontWeight: '700' },
  reminderMeta: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
  manageRow: { flexDirection: 'row', gap: 10 },
  managePill: {
    flex: 1,
    height: 44,
    borderRadius: radii.full,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  manageText: { fontSize: 13, fontWeight: '700' },
  noteBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.68)', justifyContent: 'flex-end' },
  noteSheet: {
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  noteSheetHandleRow: { alignItems: 'center', paddingBottom: spacing.sm },
  noteSheetHandle: { width: 36, height: 4, borderRadius: 2 },
  noteSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  circleBtnSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteHeaderSpacer: { width: 36, height: 36 },
  noteSheetTitle: { fontSize: 16, fontWeight: '700' },
  noteInput: {
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    minHeight: 130,
    fontSize: 14,
  },
  noteErrorText: { fontSize: 12, marginTop: 8 },
  noteSaveBtn: {
    height: 48,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  noteSaveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
