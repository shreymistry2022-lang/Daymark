// src/components/PauseHabitModal.tsx
import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Habit } from '../services/HabitContext';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing } from '../theme/tokens';
import { addLocalDays } from '../domain/habitEngine';

interface PauseHabitModalProps {
  visible: boolean;
  habit: Habit | null;
  todayDateStr: string;
  onClose: () => void;
  onConfirmPause: (id: string, startDate: string, endDate: string | null) => void;
}

type PauseDuration = '1_week' | '2_weeks' | '1_month' | 'indefinite';

export const PauseHabitModal = ({
  visible,
  habit,
  todayDateStr,
  onClose,
  onConfirmPause,
}: PauseHabitModalProps) => {
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const [selectedDuration, setSelectedDuration] = useState<PauseDuration>('1_week');

  if (!habit) return null;

  const durationOptions: { key: PauseDuration; label: string; detail: string; getEndDate: () => string | null }[] = [
    {
      key: '1_week',
      label: '1 Week',
      detail: `Resumes on ${addLocalDays(todayDateStr, 7)}`,
      getEndDate: () => addLocalDays(todayDateStr, 6),
    },
    {
      key: '2_weeks',
      label: '2 Weeks',
      detail: `Resumes on ${addLocalDays(todayDateStr, 14)}`,
      getEndDate: () => addLocalDays(todayDateStr, 13),
    },
    {
      key: '1_month',
      label: '1 Month',
      detail: `Resumes on ${addLocalDays(todayDateStr, 30)}`,
      getEndDate: () => addLocalDays(todayDateStr, 29),
    },
    {
      key: 'indefinite',
      label: 'Until I resume',
      detail: 'Pause stays active until you manually resume',
      getEndDate: () => null,
    },
  ];

  const handleConfirm = () => {
    const selected = durationOptions.find(opt => opt.key === selectedDuration);
    const endDate = selected ? selected.getEndDate() : null;
    onConfirmPause(habit.id, todayDateStr, endDate);
    onClose();
  };

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            {
              width: Math.min(width - 32, 420),
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={[styles.iconBox, { backgroundColor: `${habit.color}20` }]}>
              <Ionicons name={habit.icon} size={24} color={habit.color} />
            </View>
            <View style={styles.headerText}>
              <Text style={[styles.eyebrow, { color: colors.accent }]}>STREAK PROTECTION</Text>
              <Text style={[styles.title, { color: colors.primaryText }]}>Pause Habit</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close pause modal">
              <Ionicons name="close" size={22} color={colors.secondaryText} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.description, { color: colors.secondaryText }]}>
            Pausing &quot;{habit.name}&quot; temporarily suspends tracking so uncompleted days will not break your streak or lower consistency.
          </Text>

          {/* Duration Options */}
          <View style={styles.optionsList}>
            {durationOptions.map(opt => {
              const isSelected = selectedDuration === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.optionRow,
                    {
                      backgroundColor: colors.secondaryBackground,
                      borderColor: isSelected ? colors.accent : colors.border,
                    },
                  ]}
                  activeOpacity={0.75}
                  onPress={() => setSelectedDuration(opt.key)}
                >
                  <View style={styles.radioCol}>
                    <Ionicons
                      name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={isSelected ? colors.accent : colors.secondaryText}
                    />
                  </View>
                  <View style={styles.optionInfo}>
                    <Text style={[styles.optionTitle, { color: colors.primaryText }]}>
                      {opt.label}
                    </Text>
                    <Text style={[styles.optionDetail, { color: colors.mutedText }]}>
                      {opt.detail}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Action Buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: colors.border }]}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={[styles.cancelBtnText, { color: colors.secondaryText }]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: colors.accent }]}
              onPress={handleConfirm}
              activeOpacity={0.8}
            >
              <Ionicons name="pause" size={16} color="#000" style={{ marginRight: 6 }} />
              <Text style={styles.confirmBtnText}>Pause Habit</Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  card: {
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  headerText: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  description: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: spacing.md,
  },
  optionsList: {
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1.5,
  },
  radioCol: {
    marginRight: spacing.md,
  },
  optionInfo: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  optionDetail: {
    fontSize: 11,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  confirmBtn: {
    flex: 1.4,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
  },
});
