import React, { useState } from 'react';
import { Alert, Text, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Habit } from '../services/HabitContext';
import { HabitLog } from '../domain/habitTypes';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing } from '../theme/tokens';
import * as Haptics from 'expo-haptics';
import { usePreferences } from '../services/PreferencesContext';

interface Props {
  habit: Habit;
  date: string;
  onSave: (id: string, log: HabitLog) => { error?: string };
}

export const HabitTrackingControl = ({ habit, date, onSave }: Props) => {
  const { colors } = useTheme();
  const { preferences } = usePreferences();
  const savedValue = habit.logs?.find(log => log.date === date)?.value ?? (habit.completedDates.includes(date) ? (habit.targetValue ?? 1) : 0);
  const isLapse = habit.logs?.find(log => log.date === date)?.outcome === 'lapse';
  const [draft, setDraft] = useState(String(savedValue));
  const [editing, setEditing] = useState(false);
  const target = habit.targetValue ?? 1;
  const isMeasured = habit.trackingMethod === 'count' || habit.trackingMethod === 'measurable';

  const saveValue = (value: number) => {
    setDraft(String(value));
    const result = onSave(habit.id, { date, value, outcome: value >= target ? 'completed' : undefined });
    if (result.error) Alert.alert('Could not save progress', result.error);
    else if (preferences.hapticsEnabled) void Haptics.selectionAsync().catch(() => {});
  };

  if (habit.habitKind === 'quit') {
    return (
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={isLapse ? `Undo lapse for ${habit.name}` : `Record a lapse for ${habit.name}`}
        style={[styles.action, { borderColor: isLapse ? colors.error : colors.border, backgroundColor: isLapse ? `${colors.error}18` : colors.secondaryBackground }]}
        onPress={() => {
          const result = onSave(habit.id, { date, outcome: isLapse ? 'completed' : 'lapse' });
          if (result.error) Alert.alert('Could not save update', result.error);
          else if (preferences.hapticsEnabled) void Haptics.selectionAsync().catch(() => {});
        }}
      >
        <Text style={[styles.actionText, { color: isLapse ? colors.error : colors.secondaryText }]}>{isLapse ? 'Lapse recorded · Undo' : 'Record lapse'}</Text>
      </TouchableOpacity>
    );
  }

  if (!isMeasured) return null;
  const progress = Math.min(100, Math.round((savedValue / target) * 100));
  return (
    <View style={styles.container}>
      <View style={styles.progressHeader}>
        <Text style={[styles.progressLabel, { color: colors.secondaryText }]}>{savedValue} / {target} {habit.unit || ''}</Text>
        <Text style={[styles.progressLabel, { color: colors.accent }]}>{progress}%</Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.secondaryBackground }]}>
        <View style={[styles.fill, { width: `${progress}%`, backgroundColor: habit.color }]} />
      </View>
      <View style={styles.controls}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Decrease ${habit.name} progress`} style={[styles.stepButton, { borderColor: colors.border }]} onPress={() => saveValue(Math.max(0, savedValue - 1))}>
          <Text style={[styles.stepText, { color: colors.primaryText }]}>−</Text>
        </TouchableOpacity>
        {editing ? (
          <TextInput
            accessibilityLabel={`Progress value for ${habit.name}`}
            style={[styles.valueInput, { color: colors.primaryText, borderColor: colors.border, backgroundColor: colors.secondaryBackground }]}
            keyboardType="decimal-pad"
            value={draft}
            onChangeText={setDraft}
            autoFocus
            onEndEditing={() => {
              const value = Number(draft);
              if (!Number.isFinite(value) || value < 0) { setDraft(String(savedValue)); setEditing(false); return; }
              saveValue(value);
              setEditing(false);
            }}
            onBlur={() => setEditing(false)}
          />
        ) : (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Edit ${habit.name} progress`} style={styles.valueButton} onPress={() => setEditing(true)}>
            <Text style={[styles.valueText, { color: colors.primaryText }]}>{savedValue}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Increase ${habit.name} progress`} style={[styles.stepButton, { borderColor: colors.border }]} onPress={() => saveValue(savedValue + 1)}>
          <Text style={[styles.stepText, { color: colors.primaryText }]}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, minWidth: 112, marginLeft: spacing.sm },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 4, marginBottom: 5 },
  progressLabel: { fontSize: 10, fontWeight: '700' },
  track: { height: 4, borderRadius: radii.full, overflow: 'hidden', marginBottom: 6 },
  fill: { height: '100%', borderRadius: radii.full },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepButton: { width: 30, height: 30, borderWidth: 1, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 19, lineHeight: 22 },
  valueButton: { minWidth: 34, alignItems: 'center', paddingVertical: 4 },
  valueText: { fontSize: 14, fontWeight: '700' },
  valueInput: { width: 52, height: 32, borderWidth: 1, borderRadius: radii.sm, textAlign: 'center', padding: 0 },
  action: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: radii.md, borderWidth: 1, marginLeft: spacing.sm },
  actionText: { fontSize: 10, fontWeight: '700' },
});
