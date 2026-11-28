// src/components/CreateHabitModal.tsx
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, radii } from '../theme/tokens';
import { HABIT_CATEGORIES, CategoryDefinition } from '../constants/categories';
import { Habit } from '../services/HabitContext';
import { useTheme } from '../theme/ThemeProvider';
import { HabitKind, HabitReminder, HabitSchedule, TrackingMethod } from '../domain/habitTypes';
import { addLocalDays, isPausedOnDate, parseLocalDate } from '../domain/habitEngine';
import {
  buildRepeatedDailyReminders,
  ensureLocalReminderPermission,
  formatGapLabel,
  formatReminderTime,
  inferRepeatConfigFromReminders,
  parseTimeString,
} from '../services/localReminders';
import { usePreferences } from '../services/PreferencesContext';
import { dateKeyInTimezone } from '../domain/preferencesEngine';

interface CreateHabitModalProps {
  visible: boolean;
  onClose: () => void;
  onAddHabit: (habit: Omit<Habit, 'id' | 'streak' | 'completedDates'>) => void;
  initialHabit?: Habit | null;
  onUpdateHabit?: (id: string, changes: Partial<Omit<Habit, 'id' | 'completedDates' | 'streak'>>) => { error?: string };
  onDeleteHabit?: (id: string) => void;
  onPauseHabit?: (id: string, startDate: string, endDate: string | null) => void;
  onResumeHabit?: (id: string) => void;
}

const FREQUENCY_OPTIONS = ['Daily', 'Weekdays', 'Weekends', 'Selected days', '3x / week', '5x / week'];
const WEEKDAYS = [
  { label: 'M', value: 1 }, { label: 'T', value: 2 }, { label: 'W', value: 3 },
  { label: 'T', value: 4 }, { label: 'F', value: 5 }, { label: 'S', value: 6 }, { label: 'S', value: 7 },
];
const ICON_OPTIONS: (keyof typeof Ionicons.glyphMap)[] = [
  'sunny-outline', 'water-outline', 'fitness-outline', 'book-outline', 'briefcase-outline',
  'moon-outline', 'flower-outline', 'leaf-outline', 'walk-outline', 'heart-outline',
  'barbell-outline', 'journal-outline', 'cash-outline', 'phone-portrait-outline',
];

const COLOR_OPTIONS = [
  '#FB7185', '#FF7A00', '#F59E0B', '#84CC16', '#10B981', '#14B8A6', '#06B6D4',
  '#38BDF8', '#3B82F6', '#7C83FF', '#8B5CF6', '#EC4899', '#F43F5E', '#94A3B8',
];

const PRESETS = [
  { name: 'Morning Sunlight & Walk', catId: 'morning', icon: 'sunny-outline' as const, color: '#FF7A00' },
  { name: 'Drink 2L Water', catId: 'nutrition', icon: 'water-outline' as const, color: '#06B6D4' },
  { name: 'Deep Work (90m)', catId: 'focus', icon: 'briefcase-outline' as const, color: '#3B82F6' },
  { name: 'Read 20 Pages', catId: 'learning', icon: 'book-outline' as const, color: '#8B5CF6' },
  { name: 'Daily Workout', catId: 'fitness', icon: 'fitness-outline' as const, color: '#10B981' },
  { name: 'Evening Meditation', catId: 'mindfulness', icon: 'flower-outline' as const, color: '#EC4899' },
];

export const CreateHabitModal = ({
  visible,
  onClose,
  onAddHabit,
  initialHabit,
  onUpdateHabit,
  onDeleteHabit,
  onPauseHabit,
  onResumeHabit,
}: CreateHabitModalProps) => {
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const { preferences } = usePreferences();

  const [name, setName] = useState(initialHabit?.name ?? '');
  const [description, setDescription] = useState(initialHabit?.description ?? '');
  const [selectedCategory, setSelectedCategory] = useState<CategoryDefinition>(
    HABIT_CATEGORIES.find(category => category.name === initialHabit?.category) ?? HABIT_CATEGORIES[0]
  );
  const [selectedColor, setSelectedColor] = useState(initialHabit?.color ?? COLOR_OPTIONS[0]);
  const [selectedIcon, setSelectedIcon] = useState<keyof typeof Ionicons.glyphMap>(
    initialHabit?.icon ?? HABIT_CATEGORIES[0].icon
  );
  const [frequency, setFrequency] = useState(initialHabit?.targetFrequency ?? 'Daily');
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>(initialHabit?.schedule?.weekdays ?? [1, 2, 3, 4, 5]);
  const [habitKind, setHabitKind] = useState<HabitKind>(initialHabit?.habitKind ?? 'positive');
  const [trackingMethod, setTrackingMethod] = useState<TrackingMethod>(initialHabit?.trackingMethod ?? 'yes_no');
  const [targetValue, setTargetValue] = useState(String(initialHabit?.targetValue ?? 1));
  const [unit, setUnit] = useState(initialHabit?.unit ?? '');
  const [startDate, setStartDate] = useState(initialHabit?.startDate ?? dateKeyInTimezone(new Date(), preferences.timezone));
  const [endDate, setEndDate] = useState(initialHabit?.endDate ?? '');

  const firstExistingReminder = initialHabit?.reminders?.[0];
  const initialTimeStr = firstExistingReminder
    ? `${firstExistingReminder.hour % 12 === 0 ? 12 : firstExistingReminder.hour % 12}:${String(firstExistingReminder.minute).padStart(2, '0')}`
    : '8:00';
  const initialAmPm: 'AM' | 'PM' = firstExistingReminder
    ? (firstExistingReminder.hour >= 12 ? 'PM' : 'AM')
    : 'AM';

  const [reminderTime, setReminderTime] = useState(initialTimeStr);
  const [reminderAmPm, setReminderAmPm] = useState<'AM' | 'PM'>(initialAmPm);
  const inferredRepeat = inferRepeatConfigFromReminders(initialHabit?.reminders);
  const [repeatCount, setRepeatCount] = useState<number>(inferredRepeat.repeatCount);
  const [gapUnit, setGapUnit] = useState<'min' | 'hr'>(
    inferredRepeat.intervalMinutes >= 60 && inferredRepeat.intervalMinutes % 60 === 0 ? 'hr' : 'min'
  );
  const [gapValueInput, setGapValueInput] = useState<string>(
    inferredRepeat.intervalMinutes >= 60 && inferredRepeat.intervalMinutes % 60 === 0
      ? String(inferredRepeat.intervalMinutes / 60)
      : String(inferredRepeat.intervalMinutes)
  );
  const [remindersEnabled, setRemindersEnabled] = useState(firstExistingReminder ? firstExistingReminder.enabled : true);
  const [reminders, setReminders] = useState<Habit['reminders']>(initialHabit?.reminders ?? []);
  const [error, setError] = useState('');

  // Minimalist collapsible sections
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [showRepeatSection, setShowRepeatSection] = useState(false);
  const [showReminderSection, setShowReminderSection] = useState(false);
  const [showCategorySection, setShowCategorySection] = useState(false);

  const getReminderWeekdays = useCallback(() => (
    frequency === 'Daily' ? [1, 2, 3, 4, 5, 6, 7]
      : frequency === 'Weekdays' ? [1, 2, 3, 4, 5]
        : frequency === 'Weekends' ? [6, 7]
          : selectedWeekdays
  ), [frequency, selectedWeekdays]);

  const computeGapMinutes = useCallback((valStr: string, unitType: 'min' | 'hr'): number | null => {
    const raw = Number(valStr.trim());
    if (!Number.isFinite(raw) || raw <= 0) return null;
    const mins = Math.round(unitType === 'hr' ? raw * 60 : raw);
    if (mins < 5 || mins > 720) return null;
    return mins;
  }, []);

  const syncReminderConfig = useCallback((
    time: string,
    ampm: 'AM' | 'PM',
    nextCount = repeatCount,
    nextGapStr = gapValueInput,
    nextGapUnit = gapUnit,
  ) => {
    setReminderTime(time);
    setReminderAmPm(ampm);
    setRepeatCount(nextCount);
    setGapValueInput(nextGapStr);
    setGapUnit(nextGapUnit);
    setError('');
    const parsed = parseTimeString(time, ampm);
    if (parsed) {
      const gapMins = computeGapMinutes(nextGapStr, nextGapUnit) ?? 60;
      const built = buildRepeatedDailyReminders({
        startHour: parsed.hour,
        startMinute: parsed.minute,
        repeatCount: nextCount,
        intervalMinutes: gapMins,
        weekdays: getReminderWeekdays(),
        enabled: true,
        baseId: (reminders ?? [])[0]?.id,
      });
      setReminders(built.reminders);
      setRemindersEnabled(true);
    }
  }, [computeGapMinutes, gapUnit, gapValueInput, getReminderWeekdays, reminders, repeatCount]);

  const todayKey = dateKeyInTimezone(new Date(), preferences.timezone);
  const isCurrentlyPaused = Boolean(initialHabit && isPausedOnDate(initialHabit, todayKey));

  const handleDeleteHabit = () => {
    if (!initialHabit || !onDeleteHabit) return;
    if (Platform.OS === 'web') {
      if (window.confirm(`Are you sure you want to delete "${initialHabit.name}"? This cannot be undone.`)) {
        onDeleteHabit(initialHabit.id);
        onClose();
      }
      return;
    }
    Alert.alert(
      'Delete Habit',
      `Are you sure you want to delete "${initialHabit.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            onDeleteHabit(initialHabit.id);
            onClose();
          },
        },
      ]
    );
  };

  const handleSelectCategory = (cat: CategoryDefinition) => {
    setSelectedCategory(cat);
    setSelectedColor(cat.color);
    setSelectedIcon(cat.icon);
  };

  const handleApplyPreset = (preset: typeof PRESETS[0]) => {
    setName(preset.name);
    const cat = HABIT_CATEGORIES.find(c => c.id === preset.catId) || HABIT_CATEGORIES[0];
    setSelectedCategory(cat);
    setSelectedColor(preset.color);
    setSelectedIcon(preset.icon);
    setShowPresets(false);
  };

  const handleCreate = async () => {
    const trimmedName = name.trim();
    const numericTarget = Number(targetValue);
    if (!trimmedName) { setError('Enter a habit name.'); return; }
    if (trimmedName.length > 80) { setError('Keep the habit name under 80 characters.'); return; }
    if (trackingMethod !== 'yes_no' && (!Number.isFinite(numericTarget) || numericTarget <= 0)) { setError('Target must be a number greater than zero.'); return; }
    if (!parseLocalDate(startDate) || (endDate && !parseLocalDate(endDate))) { setError('Use valid dates in YYYY-MM-DD format.'); return; }
    if (endDate && endDate < startDate) { setError('End date must be on or after the start date.'); return; }
    if (frequency === 'Selected days' && selectedWeekdays.length === 0) { setError('Choose at least one weekday.'); return; }

    let finalReminders: HabitReminder[] = [];
    if (remindersEnabled) {
      const parsed = parseTimeString(reminderTime, reminderAmPm);
      const reminderWeekdays = getReminderWeekdays();
      const gapMins = computeGapMinutes(gapValueInput, gapUnit);
      if (repeatCount > 1 && gapMins === null) {
        setError('Enter a valid time gap between 5 minutes and 12 hours.');
        return;
      }
      if (parsed) {
        const built = buildRepeatedDailyReminders({
          startHour: parsed.hour,
          startMinute: parsed.minute,
          repeatCount,
          intervalMinutes: gapMins ?? 120,
          weekdays: reminderWeekdays,
          enabled: true,
          baseId: (reminders ?? [])[0]?.id,
        });
        finalReminders = built.reminders;
      } else if ((reminders ?? []).length > 0) {
        finalReminders = (reminders ?? []).map(r => ({ ...r, enabled: true }));
      }
    } else {
      finalReminders = (reminders ?? []).map(r => ({ ...r, enabled: false }));
    }

    if (finalReminders.some(reminder => reminder.enabled)) {
      const permGranted = await ensureLocalReminderPermission();
      if (!permGranted && Platform.OS !== 'web') {
        Alert.alert(
          'Notifications are off',
          'Habit reminder saved. To receive reminders on your phone, enable notifications for Daymark in device settings.'
        );
      }
    }
    const schedule: HabitSchedule = frequency === 'Weekdays'
      ? { frequency: 'weekdays' }
      : frequency === 'Weekends'
        ? { frequency: 'weekends' }
        : frequency === 'Selected days'
          ? { frequency: 'selected_weekdays', weekdays: selectedWeekdays }
          : frequency.includes('x / week')
            ? { frequency: 'weekly_target', weeklyTarget: Number(frequency.match(/^\d+/)?.[0] ?? 3) }
            : { frequency: 'daily' };
    const values: Omit<Habit, 'id' | 'streak' | 'completedDates'> = {
      name: trimmedName,
      description: description.trim(),
      category: selectedCategory.name,
      color: selectedColor,
      icon: selectedIcon,
      targetFrequency: frequency,
      habitKind,
      trackingMethod,
      targetValue: trackingMethod === 'yes_no' ? 1 : numericTarget,
      unit: trackingMethod === 'yes_no' ? undefined : unit.trim() || undefined,
      schedule,
      startDate,
      endDate: endDate || null,
      reminders: finalReminders,
    };
    const result = initialHabit && onUpdateHabit
      ? onUpdateHabit(initialHabit.id, values)
      : onAddHabit(values);
    if (result && 'error' in result && result.error) { setError(result.error); return; }
    onClose();
  };

  const activeWeekdaysCount = frequency === 'Daily' ? 7 : frequency === 'Weekdays' ? 5 : frequency === 'Weekends' ? 2 : selectedWeekdays.length;
  const reminderSummaryLabel = !remindersEnabled
    ? 'No Reminders'
    : (() => {
      const parsed = parseTimeString(reminderTime, reminderAmPm);
      const startLabel = parsed ? formatReminderTime(parsed.hour, parsed.minute) : 'Daily';
      if (repeatCount <= 1) return startLabel;
      const gapMins = computeGapMinutes(gapValueInput, gapUnit) ?? 120;
      return `${repeatCount}x/day · every ${formatGapLabel(gapMins)} from ${startLabel}`;
    })();

  return (
    <Modal animationType="slide" transparent={true} visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { width: Math.min(width - 12, 480), backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.handleBar, { backgroundColor: colors.border }]} />

          {/* Minimalist Centered Header with Circle Close */}
          <View style={styles.header}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Close habit editor"
              onPress={onClose}
              style={[styles.circleCloseBtn, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}
            >
              <Ionicons name="close" size={20} color={colors.primaryText} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.primaryText }]}>{initialHabit ? 'Edit Habit' : 'New Habit'}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Quick habit ideas"
              onPress={() => setShowPresets(p => !p)}
              style={[styles.ideasPill, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}
            >
              <Ionicons name="sparkles-outline" size={14} color={selectedColor} />
              <Text style={[styles.ideasText, { color: colors.primaryText }]}>Ideas</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            {/* Optional Quick Ideas Drawer */}
            {showPresets ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetRow}>
                {PRESETS.map((p, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={[styles.presetChip, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}
                    activeOpacity={0.7}
                    onPress={() => handleApplyPreset(p)}
                  >
                    <View style={[styles.presetDot, { backgroundColor: p.color }]} />
                    <Text style={[styles.presetText, { color: colors.primaryText }]}>{p.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : null}

            {/* Centerpiece Icon Badge (Reference Image 2) */}
            <View style={styles.heroIconSection}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setShowIconPicker(p => !p)}
                style={styles.heroIconWrap}
              >
                <View style={[styles.heroIconCircle, { backgroundColor: `${selectedColor}24` }]}>
                  <Ionicons name={selectedIcon} size={34} color={selectedColor} />
                </View>
                <View style={[styles.editPencilCircle, { backgroundColor: selectedColor, borderColor: colors.card }]}>
                  <Ionicons name="pencil" size={12} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowIconPicker(p => !p)}>
                <Text style={[styles.changeIconText, { color: selectedColor }]}>
                  {showIconPicker ? 'Hide icons' : 'Change icon'}
                </Text>
              </TouchableOpacity>
            </View>

            {showIconPicker ? (
              <View style={[styles.expandedPanel, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}>
                <View style={styles.iconGrid}>
                  {ICON_OPTIONS.map(icon => (
                    <TouchableOpacity
                      key={icon}
                      accessibilityRole="button"
                      accessibilityLabel={`Select ${icon.replace('-outline', '').replaceAll('-', ' ')} icon`}
                      style={[
                        styles.iconOption,
                        {
                          backgroundColor: colors.card,
                          borderColor: selectedIcon === icon ? selectedColor : colors.border,
                        },
                        selectedIcon === icon && { backgroundColor: `${selectedColor}1E` },
                      ]}
                      onPress={() => setSelectedIcon(icon)}
                    >
                      <Ionicons name={icon} size={20} color={selectedIcon === icon ? selectedColor : colors.secondaryText} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : null}

            {/* NAME */}
            <Text style={[styles.sectionLabel, { color: colors.secondaryText }]}>NAME</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.secondaryBackground, borderColor: colors.border, color: colors.primaryText }]}
              placeholder="e.g. Walk 5km, Drink Water..."
              placeholderTextColor={colors.mutedText}
              value={name}
              onChangeText={setName}
            />

            {/* DESCRIPTION */}
            <Text style={[styles.sectionLabel, { color: colors.secondaryText }]}>DESCRIPTION</Text>
            <TextInput
              style={[styles.textInput, styles.multilineInput, { backgroundColor: colors.secondaryBackground, borderColor: colors.border, color: colors.primaryText }]}
              placeholder="Optional note or why this matters"
              placeholderTextColor={colors.mutedText}
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={240}
            />

            {/* COLOR GRID (7 per row) */}
            <Text style={[styles.sectionLabel, { color: colors.secondaryText }]}>COLOR</Text>
            <View style={styles.colorGrid}>
              {COLOR_OPTIONS.map(c => {
                const isSelected = selectedColor === c;
                return (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setSelectedColor(c)}
                    style={[
                      styles.colorSwatchWrap,
                      isSelected && { borderColor: c, borderWidth: 2 },
                    ]}
                  >
                    <View style={[styles.colorSwatch, { backgroundColor: c }]} />
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* HABIT TYPE Segmented Pill */}
            <Text style={[styles.sectionLabel, { color: colors.secondaryText }]}>HABIT TYPE</Text>
            <View style={[styles.segmentedPill, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}>
              {([
                { key: 'positive', label: 'Build A Habit' },
                { key: 'quit', label: 'Quit A Habit' },
              ] as const).map(option => {
                const active = habitKind === option.key;
                return (
                  <TouchableOpacity
                    key={option.key}
                    style={[styles.segmentBtn, active && { backgroundColor: colors.elevatedCard }]}
                    onPress={() => {
                      setHabitKind(option.key);
                      if (option.key === 'quit') setTrackingMethod('yes_no');
                    }}
                  >
                    <Text style={[styles.segmentText, { color: active ? colors.primaryText : colors.secondaryText, fontWeight: active ? '700' : '500' }]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={[styles.helperCaption, { color: colors.mutedText }]}>
              {habitKind === 'quit' ? 'Track days stayed clean without slips.' : 'Mark each day you complete it.'}
            </Text>

            {/* TRACKING METHOD Segmented Pill */}
            <Text style={[styles.sectionLabel, { color: colors.secondaryText }]}>TRACKING</Text>
            <View style={[styles.segmentedPill, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}>
              {([
                { key: 'yes_no', label: 'Yes / No' },
                { key: 'count', label: 'Count' },
                { key: 'measurable', label: 'Measure' },
              ] as const).map(option => {
                const active = trackingMethod === option.key;
                const disabled = habitKind === 'quit' && option.key !== 'yes_no';
                return (
                  <TouchableOpacity
                    key={option.key}
                    disabled={disabled}
                    style={[styles.segmentBtn, active && { backgroundColor: colors.elevatedCard }, disabled && { opacity: 0.4 }]}
                    onPress={() => setTrackingMethod(option.key)}
                  >
                    <Text style={[styles.segmentText, { color: active ? colors.primaryText : colors.secondaryText, fontWeight: active ? '700' : '500' }]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={[styles.helperCaption, { color: colors.mutedText }]}>
              {trackingMethod === 'yes_no' ? 'Check the day off — done or not done.' : 'Track progress toward your daily numeric goal.'}
            </Text>

            {trackingMethod !== 'yes_no' ? (
              <View style={styles.valueFields}>
                <View style={styles.valueField}>
                  <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>TARGET</Text>
                  <TextInput style={[styles.textInput, { backgroundColor: colors.secondaryBackground, borderColor: colors.border, color: colors.primaryText }]} value={targetValue} onChangeText={setTargetValue} keyboardType="decimal-pad" placeholder="e.g. 8" placeholderTextColor={colors.mutedText} />
                </View>
                <View style={styles.valueField}>
                  <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>UNIT</Text>
                  <TextInput style={[styles.textInput, { backgroundColor: colors.secondaryBackground, borderColor: colors.border, color: colors.primaryText }]} value={unit} onChangeText={setUnit} placeholder="Glasses, km..." placeholderTextColor={colors.mutedText} maxLength={24} />
                </View>
              </View>
            ) : null}

            {/* REPEAT Row (Image 3 style) */}
            <Text style={[styles.sectionLabel, { color: colors.secondaryText }]}>REPEAT</Text>
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => setShowRepeatSection(p => !p)}
              style={[styles.navRowCard, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}
            >
              <Text style={[styles.navRowTitle, { color: colors.primaryText }]}>{frequency}</Text>
              <View style={styles.navRowRight}>
                <View style={styles.repeatDotsRow}>
                  {Array.from({ length: 7 }, (_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.repeatDot,
                        { backgroundColor: i < activeWeekdaysCount ? selectedColor : colors.border },
                      ]}
                    />
                  ))}
                </View>
                <Ionicons name={showRepeatSection ? 'chevron-down' : 'chevron-forward'} size={17} color={colors.secondaryText} />
              </View>
            </TouchableOpacity>

            {showRepeatSection ? (
              <View style={[styles.expandedPanel, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}>
                <View style={styles.frequencyRow}>
                  {FREQUENCY_OPTIONS.map(opt => {
                    const isSelected = frequency === opt;
                    return (
                      <TouchableOpacity
                        key={opt}
                        style={[
                          styles.frequencyPill,
                          {
                            backgroundColor: isSelected ? `${selectedColor}22` : colors.card,
                            borderColor: isSelected ? selectedColor : colors.border,
                          },
                        ]}
                        onPress={() => setFrequency(opt)}
                      >
                        <Text style={[styles.frequencyText, { color: isSelected ? selectedColor : colors.secondaryText, fontWeight: isSelected ? '700' : '500' }]}>
                          {opt}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {frequency === 'Selected days' ? (
                  <View style={styles.weekdayRow}>
                    {WEEKDAYS.map(day => {
                      const active = selectedWeekdays.includes(day.value);
                      return (
                        <TouchableOpacity
                          key={day.value}
                          style={[
                            styles.weekdayPill,
                            {
                              backgroundColor: active ? selectedColor : colors.card,
                              borderColor: active ? selectedColor : colors.border,
                            },
                          ]}
                          onPress={() => setSelectedWeekdays(curr => active ? curr.filter(v => v !== day.value) : [...curr, day.value].sort())}
                        >
                          <Text style={{ color: active ? '#FFFFFF' : colors.secondaryText, fontWeight: '700', fontSize: 12 }}>{day.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : null}
                <View style={styles.valueFields}>
                  <View style={styles.valueField}>
                    <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>START (YYYY-MM-DD)</Text>
                    <TextInput style={[styles.compactInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.primaryText }]} value={startDate} onChangeText={setStartDate} autoCapitalize="none" placeholder="2026-01-01" placeholderTextColor={colors.mutedText} />
                  </View>
                  <View style={styles.valueField}>
                    <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>END (OPTIONAL)</Text>
                    <TextInput style={[styles.compactInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.primaryText }]} value={endDate ?? ''} onChangeText={setEndDate} autoCapitalize="none" placeholder="No end date" placeholderTextColor={colors.mutedText} />
                  </View>
                </View>
              </View>
            ) : null}

            {/* REMINDER Row (Image 3 style) */}
            <Text style={[styles.sectionLabel, { color: colors.secondaryText }]}>REMINDER</Text>
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => setShowReminderSection(p => !p)}
              style={[styles.navRowCard, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}
            >
              <Text style={[styles.navRowTitle, { color: remindersEnabled ? colors.primaryText : colors.secondaryText }]} numberOfLines={1}>
                {reminderSummaryLabel}
              </Text>
              <Ionicons name={showReminderSection ? 'chevron-down' : 'chevron-forward'} size={17} color={colors.secondaryText} />
            </TouchableOpacity>

            {showReminderSection ? (
              <View style={[styles.expandedPanel, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}>
                <View style={styles.reminderSwitchRow}>
                  <Text style={[styles.navRowTitle, { color: colors.primaryText }]}>Enable Daily Reminders</Text>
                  <Switch
                    accessibilityLabel="Enable daily reminder"
                    value={remindersEnabled}
                    onValueChange={enabled => {
                      setRemindersEnabled(enabled);
                      setReminders(current => (current ?? []).map(r => ({ ...r, enabled })));
                    }}
                    trackColor={{ true: selectedColor }}
                  />
                </View>

                {remindersEnabled ? (
                  <View style={styles.reminderContainer}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reminderPresetRow}>
                      {(['8:00 AM', '12:00 PM', '6:00 PM', '9:00 PM'] as const).map(preset => {
                        const [pTime, pPeriod] = preset.split(' ');
                        const parsedPreset = parseTimeString(pTime, pPeriod as 'AM' | 'PM');
                        const currentParsed = parseTimeString(reminderTime, reminderAmPm);
                        const isActive = Boolean(parsedPreset && currentParsed && parsedPreset.hour === currentParsed.hour && parsedPreset.minute === currentParsed.minute);
                        return (
                          <TouchableOpacity
                            key={preset}
                            style={[
                              styles.reminderPresetChip,
                              {
                                backgroundColor: isActive ? `${selectedColor}24` : colors.card,
                                borderColor: isActive ? selectedColor : colors.border,
                              },
                            ]}
                            onPress={() => syncReminderConfig(pTime, pPeriod as 'AM' | 'PM')}
                          >
                            <Text style={[styles.reminderPresetText, { color: isActive ? selectedColor : colors.secondaryText, fontWeight: isActive ? '700' : '500' }]}>
                              {preset}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>

                    <View style={styles.addReminderRow}>
                      <TextInput
                        style={[styles.reminderInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.primaryText }]}
                        value={reminderTime}
                        onChangeText={val => syncReminderConfig(val, reminderAmPm)}
                        keyboardType="numbers-and-punctuation"
                        placeholder="8:00"
                        placeholderTextColor={colors.mutedText}
                      />
                      <View style={[styles.ampmToggle, { borderColor: colors.border }]}>
                        {(['AM', 'PM'] as const).map(p => {
                          const isSelected = reminderAmPm.toUpperCase() === p;
                          return (
                            <TouchableOpacity
                              key={p}
                              onPress={() => syncReminderConfig(reminderTime, p)}
                              style={[styles.ampmBtn, { backgroundColor: isSelected ? selectedColor : colors.card }]}
                            >
                              <Text style={[styles.ampmBtnText, { color: isSelected ? '#FFFFFF' : colors.secondaryText }]}>{p}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      <View style={[styles.activeReminderBadge, { backgroundColor: `${selectedColor}1A`, borderColor: `${selectedColor}40` }]}>
                        <Ionicons name="notifications" size={13} color={selectedColor} />
                        <Text style={[styles.activeReminderBadgeText, { color: selectedColor }]}>
                          {(() => {
                            const parsed = parseTimeString(reminderTime, reminderAmPm);
                            return parsed ? formatReminderTime(parsed.hour, parsed.minute) : 'Set Time';
                          })()}
                        </Text>
                      </View>
                    </View>

                    {/* Times Per Day */}
                    <Text style={[styles.fieldLabel, { color: colors.secondaryText, marginTop: 4, marginBottom: 4 }]}>
                      TIMES PER DAY
                    </Text>
                    <View style={styles.repeatRow}>
                      <View style={styles.repeatPresetGroup}>
                        {[1, 2, 3, 4, 6].map(count => {
                          const isSelected = repeatCount === count;
                          return (
                            <TouchableOpacity
                              key={count}
                              accessibilityRole="button"
                              accessibilityLabel={`Remind ${count} times per day`}
                              style={[
                                styles.reminderPresetChip,
                                {
                                  backgroundColor: isSelected ? `${selectedColor}24` : colors.card,
                                  borderColor: isSelected ? selectedColor : colors.border,
                                },
                              ]}
                              onPress={() => syncReminderConfig(reminderTime, reminderAmPm, count)}
                            >
                              <Text style={[styles.reminderPresetText, { color: isSelected ? selectedColor : colors.secondaryText, fontWeight: isSelected ? '700' : '500' }]}>
                                {count}x
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      <View style={[styles.stepperBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel="Decrease daily reminder count"
                          style={styles.stepperBtn}
                          onPress={() => syncReminderConfig(reminderTime, reminderAmPm, Math.max(1, repeatCount - 1))}
                        >
                          <Ionicons name="remove" size={16} color={colors.primaryText} />
                        </TouchableOpacity>
                        <Text style={[styles.stepperValue, { color: colors.primaryText }]}>{repeatCount}x</Text>
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel="Increase daily reminder count"
                          style={styles.stepperBtn}
                          onPress={() => syncReminderConfig(reminderTime, reminderAmPm, Math.min(12, repeatCount + 1))}
                        >
                          <Ionicons name="add" size={16} color={colors.primaryText} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Time Gap */}
                    {repeatCount > 1 ? (
                      <View style={styles.gapContainer}>
                        <Text style={[styles.fieldLabel, { color: colors.secondaryText, marginTop: 4, marginBottom: 4 }]}>
                          TIME GAP BETWEEN REMINDERS
                        </Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reminderPresetRow}>
                          {[
                            { label: '30m', val: '30', unit: 'min' as const },
                            { label: '1h', val: '1', unit: 'hr' as const },
                            { label: '2h', val: '2', unit: 'hr' as const },
                            { label: '3h', val: '3', unit: 'hr' as const },
                            { label: '4h', val: '4', unit: 'hr' as const },
                          ].map(preset => {
                            const currentGap = computeGapMinutes(gapValueInput, gapUnit);
                            const presetGap = preset.unit === 'hr' ? Number(preset.val) * 60 : Number(preset.val);
                            const isActive = currentGap === presetGap;
                            return (
                              <TouchableOpacity
                                key={preset.label}
                                style={[
                                  styles.reminderPresetChip,
                                  {
                                    backgroundColor: isActive ? `${selectedColor}24` : colors.card,
                                    borderColor: isActive ? selectedColor : colors.border,
                                  },
                                ]}
                                onPress={() => syncReminderConfig(reminderTime, reminderAmPm, repeatCount, preset.val, preset.unit)}
                              >
                                <Text style={[styles.reminderPresetText, { color: isActive ? selectedColor : colors.secondaryText, fontWeight: isActive ? '700' : '500' }]}>
                                  {preset.label}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>

                        <View style={styles.addReminderRow}>
                          <Text style={[styles.gapPrefixText, { color: colors.secondaryText }]}>Every</Text>
                          <TextInput
                            accessibilityLabel="Reminder time gap"
                            style={[styles.reminderInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.primaryText }]}
                            value={gapValueInput}
                            onChangeText={val => syncReminderConfig(reminderTime, reminderAmPm, repeatCount, val, gapUnit)}
                            keyboardType="numeric"
                            placeholder="2"
                            placeholderTextColor={colors.mutedText}
                          />
                          <View style={[styles.ampmToggle, { borderColor: colors.border }]}>
                            {(['min', 'hr'] as const).map(unitOpt => {
                              const isSelected = gapUnit === unitOpt;
                              return (
                                <TouchableOpacity
                                  key={unitOpt}
                                  onPress={() => syncReminderConfig(reminderTime, reminderAmPm, repeatCount, gapValueInput, unitOpt)}
                                  style={[styles.ampmBtn, { backgroundColor: isSelected ? selectedColor : colors.card }]}
                                >
                                  <Text style={[styles.ampmBtnText, { color: isSelected ? '#FFFFFF' : colors.secondaryText }]}>
                                    {unitOpt}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      </View>
                    ) : null}

                    {(() => {
                      const parsed = parseTimeString(reminderTime, reminderAmPm);
                      if (!parsed) {
                        return <Text style={[styles.reminderSubtext, { color: colors.error }]}>Enter time like 9:50, 9.50, or 21:50</Text>;
                      }
                      const gapMins = computeGapMinutes(gapValueInput, gapUnit);
                      if (repeatCount > 1 && gapMins === null) {
                        return <Text style={[styles.reminderSubtext, { color: colors.error }]}>Enter a gap between 5 min and 12 hr</Text>;
                      }
                      const preview = buildRepeatedDailyReminders({
                        startHour: parsed.hour,
                        startMinute: parsed.minute,
                        repeatCount,
                        intervalMinutes: gapMins ?? 120,
                        weekdays: getReminderWeekdays(),
                        enabled: true,
                      });
                      const timeList = preview.reminders.map(r => formatReminderTime(r.hour, r.minute)).join(', ');
                      return (
                        <View>
                          <Text style={[styles.reminderSubtext, { color: colors.secondaryText }]}>
                            {repeatCount > 1 && gapMins
                              ? `🔔 Reminds ${preview.reminders.length}x/day (every ${formatGapLabel(gapMins)}): ${timeList}`
                              : `🔔 Will remind daily at ${timeList}`}
                          </Text>
                          {preview.truncatedBeforeMidnight ? (
                            <Text style={[styles.reminderSubtext, { color: colors.error }]}>
                              Only {preview.reminders.length} of {repeatCount} reminders fit before midnight. Choose an earlier start time or shorter gap.
                            </Text>
                          ) : null}
                        </View>
                      );
                    })()}
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* CATEGORIES Row (Image 3 style) */}
            <Text style={[styles.sectionLabel, { color: colors.secondaryText }]}>CATEGORIES</Text>
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => setShowCategorySection(p => !p)}
              style={[styles.navRowCard, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}
            >
              <View style={styles.catRowLeft}>
                <View style={[styles.categoryIconCircle, { backgroundColor: `${selectedCategory.color}25` }]}>
                  <Ionicons name={selectedCategory.icon} size={16} color={selectedCategory.color} />
                </View>
                <Text style={[styles.navRowTitle, { color: colors.primaryText }]}>{selectedCategory.name}</Text>
              </View>
              <Ionicons name={showCategorySection ? 'chevron-down' : 'chevron-forward'} size={17} color={colors.secondaryText} />
            </TouchableOpacity>

            {showCategorySection ? (
              <View style={styles.categoriesGrid}>
                {HABIT_CATEGORIES.map(cat => {
                  const isSelected = selectedCategory.id === cat.id;
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      style={[
                        styles.categoryCard,
                        {
                          backgroundColor: colors.secondaryBackground,
                          borderColor: isSelected ? cat.color : colors.border,
                        },
                        isSelected && { backgroundColor: `${cat.color}18`, borderWidth: 1.5 },
                      ]}
                      activeOpacity={0.7}
                      onPress={() => handleSelectCategory(cat)}
                    >
                      <View style={[styles.categoryIconCircle, { backgroundColor: `${cat.color}25` }]}>
                        <Ionicons name={cat.icon} size={16} color={cat.color} />
                      </View>
                      <Text
                        style={[
                          styles.categoryCardText,
                          { color: isSelected ? colors.primaryText : colors.secondaryText },
                          isSelected && { fontWeight: '700' },
                        ]}
                        numberOfLines={1}
                      >
                        {cat.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}

            {/* Edit Actions */}
            {initialHabit ? (
              <View style={styles.editActionsContainer}>
                {onPauseHabit ? (
                  isCurrentlyPaused ? (
                    <TouchableOpacity
                      style={[styles.secondaryActionButton, { borderColor: colors.border, backgroundColor: colors.secondaryBackground }]}
                      activeOpacity={0.7}
                      onPress={() => onResumeHabit?.(initialHabit.id)}
                    >
                      <Ionicons name="play-outline" size={16} color={colors.accent} style={{ marginRight: 6 }} />
                      <Text style={[styles.secondaryActionText, { color: colors.accent }]}>Resume Habit</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.secondaryActionButton, { borderColor: colors.border, backgroundColor: colors.secondaryBackground }]}
                      activeOpacity={0.7}
                      onPress={() => onPauseHabit(initialHabit.id, todayKey, addLocalDays(todayKey, 6))}
                    >
                      <Ionicons name="pause-outline" size={16} color={colors.secondaryText} style={{ marginRight: 6 }} />
                      <Text style={[styles.secondaryActionText, { color: colors.secondaryText }]}>Pause 1 Week</Text>
                    </TouchableOpacity>
                  )
                ) : null}

                {onDeleteHabit ? (
                  <TouchableOpacity
                    style={[styles.deleteActionButton, { borderColor: `${colors.error}40`, backgroundColor: `${colors.error}12` }]}
                    activeOpacity={0.7}
                    onPress={handleDeleteHabit}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.error} style={{ marginRight: 6 }} />
                    <Text style={[styles.deleteActionText, { color: colors.error }]}>Delete Habit</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            {error ? <Text accessibilityRole="alert" style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}
          </ScrollView>

          {/* Pinned Full-Pill Save Button (Reference Image 2 & 3) */}
          <View style={[styles.footerSaveWrap, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              style={[
                styles.savePillButton,
                { backgroundColor: colors.accent },
                !name.trim() && styles.submitButtonDisabled,
              ]}
              disabled={!name.trim()}
              activeOpacity={0.85}
              onPress={handleCreate}
            >
              <Text style={styles.savePillText}>{initialHabit ? 'Save' : 'Save Habit'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheet: {
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    maxHeight: '94%',
    borderWidth: 1,
  },
  handleBar: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  circleCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  ideasPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: radii.full,
    borderWidth: 1,
  },
  ideasText: { fontSize: 12, fontWeight: '600' },
  scrollContent: {
    paddingBottom: spacing.lg,
  },
  presetRow: {
    gap: 8,
    paddingVertical: 6,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.full,
    borderWidth: 1,
    gap: 6,
  },
  presetDot: { width: 8, height: 8, borderRadius: 4 },
  presetText: { fontSize: 12, fontWeight: '600' },

  heroIconSection: {
    alignItems: 'center',
    marginVertical: spacing.md,
  },
  heroIconWrap: {
    position: 'relative',
  },
  heroIconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editPencilCircle: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeIconText: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
  },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: spacing.md,
    marginBottom: 6,
  },
  textInput: {
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
    fontSize: 15,
  },
  compactInput: {
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },
  multilineInput: { minHeight: 58, textAlignVertical: 'top' },

  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  colorSwatchWrap: {
    padding: 3,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSwatch: {
    width: 32,
    height: 32,
    borderRadius: 10,
  },

  segmentedPill: {
    flexDirection: 'row',
    borderRadius: radii.md,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: { fontSize: 13 },
  helperCaption: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
  },

  navRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  navRowTitle: { fontSize: 14, fontWeight: '600', flex: 1 },
  navRowRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  repeatDotsRow: { flexDirection: 'row', gap: 4 },
  repeatDot: { width: 7, height: 7, borderRadius: 2.5 },
  catRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },

  expandedPanel: {
    marginTop: 8,
    borderRadius: radii.md,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  valueFields: { flexDirection: 'row', gap: 10, marginTop: 6 },
  valueField: { flex: 1 },
  fieldLabel: { fontSize: 11, fontWeight: '700', marginBottom: 5, letterSpacing: 0.6 },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconOption: { width: 40, height: 40, borderRadius: radii.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  weekdayRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 5 },
  weekdayPill: { flex: 1, paddingVertical: 9, borderRadius: radii.sm, borderWidth: 1, alignItems: 'center' },

  reminderSwitchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reminderContainer: { gap: 8 },
  reminderPresetRow: { flexDirection: 'row', gap: 6, paddingVertical: 2 },
  reminderPresetChip: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: radii.full, borderWidth: 1 },
  reminderPresetText: { fontSize: 12, fontWeight: '600' },
  addReminderRow: { flexDirection: 'row', gap: 8, alignItems: 'center', width: '100%' },
  reminderInput: { width: 70, height: 40, borderWidth: 1, borderRadius: radii.sm, paddingHorizontal: 6, textAlign: 'center', fontSize: 14, fontWeight: '600' },
  ampmToggle: { height: 40, flexDirection: 'row', borderWidth: 1, borderRadius: radii.sm, overflow: 'hidden' },
  ampmBtn: { height: '100%', paddingHorizontal: 10, justifyContent: 'center', alignItems: 'center' },
  ampmBtnText: { fontSize: 12, fontWeight: '700' },
  activeReminderBadge: { flex: 1, height: 40, borderRadius: radii.sm, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 8 },
  activeReminderBadgeText: { fontSize: 13, fontWeight: '700' },
  reminderSubtext: { fontSize: 12, fontWeight: '500', marginTop: 4 },
  repeatRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  repeatPresetGroup: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  stepperBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radii.full, height: 34, overflow: 'hidden' },
  stepperBtn: { width: 34, height: '100%', alignItems: 'center', justifyContent: 'center' },
  stepperValue: { fontSize: 13, fontWeight: '700', minWidth: 32, textAlign: 'center' },
  gapContainer: { gap: 6, marginTop: 2 },
  gapPrefixText: { fontSize: 13, fontWeight: '600' },

  categoriesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  categoryCard: {
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.md,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderWidth: 1,
    gap: 8,
  },
  categoryIconCircle: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  categoryCardText: { flex: 1, fontSize: 12, fontWeight: '500' },
  frequencyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  frequencyPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.full, borderWidth: 1 },
  frequencyText: { fontSize: 12 },

  editActionsContainer: { flexDirection: 'row', gap: 10, marginTop: spacing.lg },
  secondaryActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: radii.full,
    borderWidth: 1,
  },
  secondaryActionText: { fontSize: 13, fontWeight: '700' },
  deleteActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: radii.full,
    borderWidth: 1,
  },
  deleteActionText: { fontSize: 13, fontWeight: '700' },
  errorText: { fontSize: 12, marginTop: 8, textAlign: 'center' },

  footerSaveWrap: {
    paddingTop: 12,
    borderTopWidth: 1,
  },
  savePillButton: {
    height: 50,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: { opacity: 0.45 },
  savePillText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
