// src/components/CreateHabitModal.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, radii } from '../theme/tokens';
import { HABIT_CATEGORIES, CategoryDefinition } from '../constants/categories';
import { Habit } from '../services/HabitContext';
import { useTheme } from '../theme/ThemeProvider';

interface CreateHabitModalProps {
  visible: boolean;
  onClose: () => void;
  onAddHabit: (habit: Omit<Habit, 'id' | 'streak' | 'completedDates'>) => void;
}

const FREQUENCY_OPTIONS = ['Daily', 'Weekdays', 'Weekends', '3x / week', '5x / week'];

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

export const CreateHabitModal = ({ visible, onClose, onAddHabit }: CreateHabitModalProps) => {
  const { width } = useWindowDimensions();
  const { colors } = useTheme();

  const [name, setName] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryDefinition>(HABIT_CATEGORIES[0]);
  const [selectedColor, setSelectedColor] = useState(HABIT_CATEGORIES[0].color);
  const [frequency, setFrequency] = useState('Daily');

  const handleSelectCategory = (cat: CategoryDefinition) => {
    setSelectedCategory(cat);
    setSelectedColor(cat.color);
  };

  const handleApplyPreset = (preset: typeof PRESETS[0]) => {
    setName(preset.name);
    const cat = HABIT_CATEGORIES.find(c => c.id === preset.catId) || HABIT_CATEGORIES[0];
    setSelectedCategory(cat);
    setSelectedColor(preset.color);
  };

  const handleCreate = () => {
    if (!name.trim()) return;
    onAddHabit({
      name: name.trim(),
      category: selectedCategory.name,
      color: selectedColor,
      icon: selectedCategory.icon,
      targetFrequency: frequency,
    });
    setName('');
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
              <Text style={[styles.title, { color: colors.primaryText }]}>Create New Habit</Text>
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
              <Ionicons name="sparkles" size={18} color="#000" />
              <Text style={styles.submitButtonText}>Add to Daily Routine</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
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
