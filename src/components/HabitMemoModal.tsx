// src/components/HabitMemoModal.tsx
import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { Habit } from '../services/HabitContext';

interface Props {
  visible: boolean;
  habit: Habit | null;
  date: string;
  initialNote?: string;
  onClose: () => void;
  onSave: (habitId: string, date: string, note: string, mood?: string) => void;
}

const MOODS = [
  { emoji: '😀', label: 'Great' },
  { emoji: '🙂', label: 'Good' },
  { emoji: '😐', label: 'Neutral' },
  { emoji: '🙁', label: 'Hard' },
  { emoji: '😭', label: 'Rough' },
];

export const HabitMemoModal = ({ visible, habit, date, initialNote = '', onClose, onSave }: Props) => {
  const { colors, isDark } = useTheme();
  const [memo, setMemo] = useState(initialNote);
  const [selectedMood, setSelectedMood] = useState<string>('😀');

  if (!habit) return null;

  const handleSave = () => {
    onSave(habit.id, date, memo.trim(), selectedMood);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <TouchableOpacity style={styles.dismissOverlay} activeOpacity={1} onPress={onClose} />
        <View
          style={[
            styles.container,
            {
              backgroundColor: isDark ? '#1C1E26' : '#FFFFFF',
              borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#F0F1F5',
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.habitBadge}>
              <Ionicons name={habit.icon as any} size={16} color={colors.accent} />
              <Text style={[styles.habitName, { color: colors.primaryText }]}>
                {habit.name}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={colors.mutedText} />
            </TouchableOpacity>
          </View>

          {/* Text Input */}
          <TextInput
            style={[
              styles.input,
              {
                color: colors.primaryText,
                backgroundColor: isDark ? '#13141B' : '#F7F8FA',
                borderColor: isDark ? '#262934' : '#E8ECF2',
              },
            ]}
            placeholder="Input your memo here"
            placeholderTextColor={colors.mutedText}
            multiline
            numberOfLines={4}
            value={memo}
            onChangeText={setMemo}
            autoFocus
          />

          {/* Mood Selector Row */}
          <View style={styles.footerRow}>
            <View style={styles.moodRow}>
              {MOODS.map(m => {
                const isSelected = selectedMood === m.emoji;
                return (
                  <TouchableOpacity
                    key={m.emoji}
                    onPress={() => setSelectedMood(m.emoji)}
                    style={styles.moodItem}
                  >
                    <Text style={styles.moodEmoji}>{m.emoji}</Text>
                    {isSelected && <View style={[styles.activeDot, { backgroundColor: colors.accent }]} />}
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              onPress={handleSave}
              style={[styles.saveBtn, { backgroundColor: colors.accent }]}
            >
              <Ionicons name="checkmark" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dismissOverlay: {
    ...StyleSheet.absoluteFill,
  },
  container: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  habitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  habitName: {
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  input: {
    height: 110,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    fontSize: 14,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  moodRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  moodItem: {
    alignItems: 'center',
    padding: 4,
  },
  moodEmoji: {
    fontSize: 22,
  },
  activeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 4,
  },
  saveBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FF5264',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
});
