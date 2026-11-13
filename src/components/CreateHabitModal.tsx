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
import { ensureLocalReminderPermission, formatReminderTime, parseTimeString } from '../services/localReminders';
import { useSubscription } from '../services/SubscriptionProvider';
import { canAccessFeature } from '../services/subscriptionEntitlements';
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
  '#FF7A00', // Tangerine
  '#10B981', // Emerald
  '#06B6D4', // Cyan
  '#3B82F6', // Cobalt
  '#8B5CF6', // Amethyst
  '#EC4899', // Pink
  '#F59E0B', // Amber
  '#F43F5E', // Crimson
];

const PRESETS = [
  { name: 'Morning Sunlight & Walk', catId: 'morning', icon: 'sunny-outline', color: '#FF7A00' },
  { name: 'Drink 2L Water', catId: 'nutrition', icon: 'water-outline', color: '#06B6D4' },
  { name: 'Deep Work Session (90m)', catId: 'focus', icon: 'briefcase-outline', color: '#3B82F6' },
  { name: 'Read 20 Pages', catId: 'learning', icon: 'book-outline', color: '#8B5CF6' },
  { name: 'Gym / Strength Workout', catId: 'fitness', icon: 'fitness-outline', color: '#10B981' },
  { name: 'Evening Meditation', catId: 'mindfulness', icon: 'flower-outline', color: '#EC4899' },
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
  const { isPro } = useSubscription();
  const { preferences } = usePreferences();

  const [name, setName] = useState(initialHabit?.name ?? '');
  const [description, setDescription] = useState(initialHabit?.description ?? '');
  const [selectedCategory, setSelectedCategory] = useState<CategoryDefinition>(HABIT_CATEGORIES.find(category => category.name === initialHabit?.category) ?? HABIT_CATEGORIES[0]);
  const [selectedColor, setSelectedColor] = useState(initialHabit?.color ?? HABIT_CATEGORIES[0].color);
  const [selectedIcon, setSelectedIcon] = useState<keyof typeof Ionicons.glyphMap>(initialHabit?.icon ?? HABIT_CATEGORIES[0].icon);
  const [frequency, setFrequency] = useState('Daily');
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
  const [remindersEnabled, setRemindersEnabled] = useState(firstExistingReminder ? firstExistingReminder.enabled : true);
  const [reminders, setReminders] = useState<Habit['reminders']>(initialHabit?.reminders ?? []);
  const [error, setError] = useState('');

  const syncReminderTime = useCallback((time: string, ampm: 'AM' | 'PM') => {
    setReminderTime(time);
    setReminderAmPm(ampm);
    setError('');
    const parsed = parseTimeString(time, ampm);
    if (parsed) {
      const reminderWeekdays = frequency === 'Daily' ? [1,2,3,4,5,6,7] : frequency === 'Weekdays' ? [1,2,3,4,5] : frequency === 'Weekends' ? [6,7] : selectedWeekdays;
      const primary: HabitReminder = {
        id: (reminders ?? [])[0]?.id ?? `reminder_${parsed.hour}_${parsed.minute}`,
        hour: parsed.hour,
        minute: parsed.minute,
        weekdays: reminderWeekdays,
        enabled: true,
      };
      setReminders([primary]);
      setRemindersEnabled(true);
    }
  }, [frequency, reminders, selectedWeekdays]);

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
      const reminderWeekdays = frequency === 'Daily' ? [1,2,3,4,5,6,7] : frequency === 'Weekdays' ? [1,2,3,4,5] : frequency === 'Weekends' ? [6,7] : selectedWeekdays;
      if (parsed) {
        const primary: HabitReminder = {
          id: (reminders ?? [])[0]?.id ?? `reminder_${parsed.hour}_${parsed.minute}`,
          hour: parsed.hour,
          minute: parsed.minute,
          weekdays: reminderWeekdays,
          enabled: true,
        };
        if (canAccessFeature('unlimited_reminders', isPro) && (reminders ?? []).length > 1) {
          finalReminders = [primary, ...(reminders ?? []).slice(1)];
        } else {
          finalReminders = [primary];
        }
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
      name: name.trim(),
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

  return (
    <Modal animationType="slide" transparent={true} visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { width: Math.min(width - 24, 460), backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={[styles.eyebrow, { color: colors.accent }]}>CUSTOM HABIT CREATOR</Text>
              <Text style={[styles.title, { color: colors.primaryText }]}>{initialHabit ? 'Edit Habit' : 'Create New Habit'}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.secondaryText} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {/* Quick Presets */}
            <Text style={[styles.sectionTitle, { color: colors.secondaryText }]}>QUICK INSPIRATION</Text>
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

            {/* Habit Name Input */}
            <Text style={[styles.sectionTitle, { color: colors.secondaryText }]}>HABIT NAME</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.secondaryBackground, borderColor: colors.border, color: colors.primaryText }]}
              placeholder="e.g. 30 Minutes Cardio, Meditate..."
              placeholderTextColor={colors.mutedText}
              value={name}
              onChangeText={setName}
            />

            <Text style={[styles.sectionTitle, { color: colors.secondaryText }]}>DESCRIPTION</Text>
            <TextInput
              style={[styles.textInput, styles.multilineInput, { backgroundColor: colors.secondaryBackground, borderColor: colors.border, color: colors.primaryText }]}
              placeholder="What does this habit mean to you?"
              placeholderTextColor={colors.mutedText}
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={240}
            />

            <Text style={[styles.sectionTitle, { color: colors.secondaryText }]}>HABIT TYPE</Text>
            <View style={styles.choiceRow}>
              {([{ key: 'positive', label: 'Build a habit' }, { key: 'quit', label: 'Quit a habit' }] as const).map(option => (
                <TouchableOpacity key={option.key} style={[styles.choicePill, { backgroundColor: colors.secondaryBackground, borderColor: habitKind === option.key ? selectedColor : colors.border }]} onPress={() => { setHabitKind(option.key); if (option.key === 'quit') setTrackingMethod('yes_no'); }}>
                  <Text style={[styles.choiceText, { color: habitKind === option.key ? selectedColor : colors.secondaryText }]}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.sectionTitle, { color: colors.secondaryText }]}>TRACKING METHOD</Text>
            <View style={styles.choiceRow}>
              {([{ key: 'yes_no', label: 'Yes / No' }, { key: 'count', label: 'Count' }, { key: 'measurable', label: 'Measure' }] as const).map(option => (
                <TouchableOpacity key={option.key} disabled={habitKind === 'quit' && option.key !== 'yes_no'} style={[styles.choicePill, { opacity: habitKind === 'quit' && option.key !== 'yes_no' ? 0.4 : 1, backgroundColor: colors.secondaryBackground, borderColor: trackingMethod === option.key ? selectedColor : colors.border }]} onPress={() => setTrackingMethod(option.key)}>
                  <Text style={[styles.choiceText, { color: trackingMethod === option.key ? selectedColor : colors.secondaryText }]}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {trackingMethod !== 'yes_no' ? (
              <View style={styles.valueFields}>
                <View style={styles.valueField}>
                  <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>TARGET</Text>
                  <TextInput style={[styles.textInput, { backgroundColor: colors.secondaryBackground, borderColor: colors.border, color: colors.primaryText }]} value={targetValue} onChangeText={setTargetValue} keyboardType="decimal-pad" placeholder="e.g. 8" placeholderTextColor={colors.mutedText} />
                </View>
                <View style={styles.valueField}>
                  <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>UNIT</Text>
                  <TextInput style={[styles.textInput, { backgroundColor: colors.secondaryBackground, borderColor: colors.border, color: colors.primaryText }]} value={unit} onChangeText={setUnit} placeholder="Glasses, pages..." placeholderTextColor={colors.mutedText} maxLength={24} />
                </View>
              </View>
            ) : null}

            <Text style={[styles.sectionTitle, { color: colors.secondaryText }]}>ICON</Text>
            <View style={styles.iconGrid}>
              {ICON_OPTIONS.map(icon => (
                <TouchableOpacity key={icon} accessibilityRole="button" accessibilityLabel={`Select ${icon.replace('-outline', '').replaceAll('-', ' ')} icon`} style={[styles.iconOption, { backgroundColor: colors.secondaryBackground, borderColor: selectedIcon === icon ? selectedColor : colors.border }]} onPress={() => setSelectedIcon(icon)}>
                  <Ionicons name={icon} size={20} color={selectedIcon === icon ? selectedColor : colors.secondaryText} />
                </TouchableOpacity>
              ))}
            </View>

            {/* 14 Categories Grid */}
            <View style={styles.categoryHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.secondaryText, marginTop: 0, marginBottom: 0 }]}>
                CATEGORY ({HABIT_CATEGORIES.length} OPTIONS)
              </Text>
              <Text style={[styles.selectedCatText, { color: selectedColor }]}>{selectedCategory.name}</Text>
            </View>

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
                      <Ionicons name={cat.icon} size={18} color={cat.color} />
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

            {/* Target Frequency */}
            <Text style={[styles.sectionTitle, { color: colors.secondaryText }]}>FREQUENCY TARGET</Text>
            <View style={styles.frequencyRow}>
              {FREQUENCY_OPTIONS.map(opt => {
                const isSelected = frequency === opt;
                return (
                  <TouchableOpacity
                    key={opt}
                    style={[
                      styles.frequencyPill,
                      {
                        backgroundColor: colors.secondaryBackground,
                        borderColor: isSelected ? selectedColor : colors.border,
                      },
                      isSelected && { backgroundColor: `${selectedColor}18`, borderWidth: 1.5 },
                    ]}
                    onPress={() => setFrequency(opt)}
                  >
                    <Text
                      style={[
                        styles.frequencyText,
                        { color: isSelected ? selectedColor : colors.secondaryText },
                        isSelected && { fontWeight: '700' },
                      ]}
                    >
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
                  return <TouchableOpacity key={day.value} style={[styles.weekdayPill, { backgroundColor: active ? `${selectedColor}22` : colors.secondaryBackground, borderColor: active ? selectedColor : colors.border }]} onPress={() => setSelectedWeekdays(current => active ? current.filter(value => value !== day.value) : [...current, day.value].sort())}><Text style={[styles.choiceText, { color: active ? selectedColor : colors.secondaryText }]}>{day.label}</Text></TouchableOpacity>;
                })}
              </View>
            ) : null}

            <Text style={[styles.sectionTitle, { color: colors.secondaryText }]}>ACTIVE DATES</Text>
            <View style={styles.valueFields}>
              <View style={styles.valueField}>
                <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>START (YYYY-MM-DD)</Text>
                <TextInput style={[styles.textInput, { backgroundColor: colors.secondaryBackground, borderColor: colors.border, color: colors.primaryText }]} value={startDate} onChangeText={setStartDate} autoCapitalize="none" placeholder="2026-01-01" placeholderTextColor={colors.mutedText} />
              </View>
              <View style={styles.valueField}>
                <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>END (OPTIONAL)</Text>
                <TextInput style={[styles.textInput, { backgroundColor: colors.secondaryBackground, borderColor: colors.border, color: colors.primaryText }]} value={endDate ?? ''} onChangeText={setEndDate} autoCapitalize="none" placeholder="No end date" placeholderTextColor={colors.mutedText} />
              </View>
            </View>

            <View style={styles.categoryHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.secondaryText, marginTop: 0 }]}>DAILY REMINDER</Text>
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
                {/* Quick preset chips */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.reminderPresetRow}
                >
                  {(['8:00 AM', '12:00 PM', '6:00 PM', '9:00 PM'] as const).map(preset => {
                    const [pTime, pPeriod] = preset.split(' ');
                    const parsedPreset = parseTimeString(pTime, pPeriod as 'AM' | 'PM');
                    const currentParsed = parseTimeString(reminderTime, reminderAmPm);
                    const isActive = Boolean(
                      parsedPreset && currentParsed && parsedPreset.hour === currentParsed.hour && parsedPreset.minute === currentParsed.minute
                    );
                    return (
                      <TouchableOpacity
                        key={preset}
                        style={[
                          styles.reminderPresetChip,
                          {
                            backgroundColor: isActive ? `${selectedColor}22` : colors.secondaryBackground,
                            borderColor: isActive ? selectedColor : colors.border,
                          },
                        ]}
                        onPress={() => syncReminderTime(pTime, pPeriod as 'AM' | 'PM')}
                      >
                        <Text style={[styles.reminderPresetText, { color: isActive ? selectedColor : colors.secondaryText, fontWeight: isActive ? '700' : '500' }]}>
                          {preset}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Custom Time Input & Live Confirmation */}
                <View style={styles.addReminderRow}>
                  <TextInput
                    style={[
                      styles.reminderInput,
                      { backgroundColor: colors.secondaryBackground, borderColor: colors.border, color: colors.primaryText },
                    ]}
                    value={reminderTime}
                    onChangeText={val => syncReminderTime(val, reminderAmPm)}
                    keyboardType="numbers-and-punctuation"
                    placeholder="9:50"
                    placeholderTextColor={colors.mutedText}
                  />
                  <View style={[styles.ampmToggle, { borderColor: colors.border }]}>
                    {(['AM', 'PM'] as const).map(p => {
                      const isSelected = reminderAmPm.toUpperCase() === p;
                      return (
                        <TouchableOpacity
                          key={p}
                          onPress={() => syncReminderTime(reminderTime, p)}
                          style={[
                            styles.ampmBtn,
                            {
                              backgroundColor: isSelected ? selectedColor : colors.secondaryBackground,
                            },
                          ]}
                        >
                          <Text style={[styles.ampmBtnText, { color: isSelected ? '#FFFFFF' : colors.secondaryText }]}>
                            {p}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <View style={[styles.activeReminderBadge, { backgroundColor: `${selectedColor}18`, borderColor: `${selectedColor}40` }]}>
                    <Ionicons name="notifications" size={13} color={selectedColor} />
                    <Text style={[styles.activeReminderBadgeText, { color: selectedColor }]}>
                      {(() => {
                        const parsed = parseTimeString(reminderTime, reminderAmPm);
                        return parsed ? formatReminderTime(parsed.hour, parsed.minute) : 'Set Time';
                      })()}
                    </Text>
                  </View>
                </View>

                {(() => {
                  const parsed = parseTimeString(reminderTime, reminderAmPm);
                  return parsed ? (
                    <Text style={[styles.reminderSubtext, { color: colors.secondaryText }]}>
                      🔔 Will remind you daily at {formatReminderTime(parsed.hour, parsed.minute)}
                    </Text>
                  ) : (
                    <Text style={[styles.reminderSubtext, { color: colors.error }]}>
                      Enter time like 9:50, 9.50, or 21:50
                    </Text>
                  );
                })()}
              </View>
            ) : (
              <Text style={[styles.reminderSubtext, { color: colors.mutedText }]}>
                Reminders are turned off for this habit.
              </Text>
            )}

            {/* Color Accent */}
            <Text style={[styles.sectionTitle, { color: colors.secondaryText }]}>ACCENT COLOR</Text>
            <View style={styles.colorRow}>
              {COLOR_OPTIONS.map(c => {
                const isSelected = selectedColor === c;
                return (
                  <TouchableOpacity
                    key={c}
                    style={[
                      styles.colorDot,
                      { backgroundColor: c },
                      isSelected && styles.colorDotActive,
                    ]}
                    onPress={() => setSelectedColor(c)}
                  />
                );
              })}
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={[
                styles.submitButton,
                { backgroundColor: selectedColor },
                !name.trim() && styles.submitButtonDisabled,
              ]}
              disabled={!name.trim()}
              activeOpacity={0.8}
              onPress={handleCreate}
            >
              <Ionicons name={initialHabit ? 'checkmark-circle' : 'sparkles'} size={18} color="#000" />
              <Text style={styles.submitButtonText}>{initialHabit ? 'Save Changes' : 'Add to Daily Routine'}</Text>
            </TouchableOpacity>

            {/* Edit / Management Actions */}
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
                      <Text style={[styles.secondaryActionText, { color: colors.secondaryText }]}>Pause for 1 Week</Text>
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

            {error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  editActionsContainer: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  secondaryActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  secondaryActionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  deleteActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  deleteActionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.sm,
  },
  sheet: {
    maxHeight: '90%',
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  scrollContent: {
    paddingBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    marginTop: spacing.md,
    marginBottom: 8,
  },
  presetRow: {
    gap: 8,
    paddingVertical: 2,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    gap: 6,
  },
  presetDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  presetText: {
    fontSize: 12,
    fontWeight: '500',
  },
  textInput: {
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    fontSize: 15,
  },
  multilineInput: { minHeight: 64, textAlignVertical: 'top' },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choicePill: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: radii.md, borderWidth: 1 },
  choiceText: { fontSize: 12, fontWeight: '600' },
  valueFields: { flexDirection: 'row', gap: 10 },
  valueField: { flex: 1 },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconOption: { width: 38, height: 38, borderRadius: radii.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  weekdayRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  weekdayPill: { flex: 1, paddingVertical: 8, borderRadius: radii.md, borderWidth: 1, alignItems: 'center' },
  reminderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  reminderText: { fontSize: 13, fontWeight: '500' },
  reminderContainer: { gap: 8, marginTop: 4 },
  reminderPresetRow: { flexDirection: 'row', gap: 6, paddingVertical: 2 },
  reminderPresetChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.md, borderWidth: 1 },
  reminderPresetText: { fontSize: 11, fontWeight: '600' },
  addReminderRow: { flexDirection: 'row', gap: 8, alignItems: 'center', width: '100%', flexWrap: 'nowrap' },
  reminderInput: { width: 72, height: 40, borderWidth: 1, borderRadius: radii.md, paddingHorizontal: 6, textAlign: 'center', fontSize: 14, fontWeight: '600', flexShrink: 0 },
  ampmToggle: { height: 40, flexDirection: 'row', borderWidth: 1, borderRadius: radii.md, overflow: 'hidden', flexShrink: 0 },
  ampmBtn: { height: '100%', paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center', minWidth: 34 },
  ampmBtnText: { fontSize: 12, fontWeight: '700' },
  activeReminderBadge: { flex: 1, height: 40, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 8 },
  activeReminderBadgeText: { fontSize: 13, fontWeight: '700' },
  reminderSubtext: { fontSize: 12, fontWeight: '500', marginTop: 4 },
  addReminderButton: { flex: 1, minWidth: 64, height: 40, paddingHorizontal: 8, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4 },
  addReminderButtonText: { fontSize: 13, fontWeight: '700' },
  errorText: { fontSize: 12, marginTop: 6 },
  categoryHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: 8,
  },
  selectedCatText: {
    fontSize: 12,
    fontWeight: '600',
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  categoryCard: {
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    gap: 8,
  },
  categoryIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryCardText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '500',
  },
  frequencyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  frequencyPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  frequencyText: {
    fontSize: 12,
    fontWeight: '500',
  },
  colorRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
    marginBottom: spacing.lg,
  },
  colorDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  colorDotActive: {
    borderWidth: 3,
    borderColor: '#FFF',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: radii.md,
    gap: 8,
    marginTop: spacing.sm,
  },
  submitButtonDisabled: {
    opacity: 0.4,
  },
  submitButtonText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '800',
  },
});
