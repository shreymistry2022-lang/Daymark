import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing, radii } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useHabits } from '../services/HabitContext';
import { JournalEntry, useJournal } from '../services/JournalContext';
import { toLocalDateString } from '../domain/habitEngine';
import { MinimalModalHeader } from '../components/MinimalModalHeader';

interface Props {
  onClose?: () => void;
  initialEntryId?: string | null;
  onInitialEntryHandled?: () => void;
}

const createUuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const random = Math.floor(Math.random() * 16);
    return (character === 'x' ? random : (random & 3) | 8).toString(16);
  });

export const JournalScreen = ({ onClose, initialEntryId, onInitialEntryHandled }: Props) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { allHabits } = useHabits();
  const { entries, isLoading, error, saveEntry, deleteEntry } = useJournal();
  const [query, setQuery] = useState('');
  const [habitFilter, setHabitFilter] = useState('all');
  const [editorVisible, setEditorVisible] = useState(false);
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [date, setDate] = useState(toLocalDateString(new Date()));
  const [habitId, setHabitId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [formError, setFormError] = useState('');

  const visible = useMemo(
    () =>
      entries.filter(
        entry =>
          (habitFilter === 'all' || entry.habitId === habitFilter) &&
          `${entry.text} ${entry.date} ${allHabits.find(habit => habit.id === entry.habitId)?.name ?? ''}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
      ),
    [entries, habitFilter, query, allHabits],
  );

  const open = (entry?: JournalEntry) => {
    setEditing(entry ?? null);
    setDate(entry?.date ?? toLocalDateString(new Date()));
    setHabitId(entry?.habitId ?? null);
    setText(entry?.text ?? '');
    setFormError('');
    setEditorVisible(true);
  };

  useEffect(() => {
    if (!initialEntryId || isLoading) return;
    const timeout = setTimeout(() => {
      const entry = entries.find(item => item.id === initialEntryId);
      if (entry) open(entry);
      onInitialEntryHandled?.();
    }, 0);
    return () => clearTimeout(timeout);
  }, [initialEntryId, isLoading, entries, onInitialEntryHandled]);

  const save = () => {
    const result = saveEntry({ id: editing?.id ?? createUuid(), date, habitId, text });
    if (result.error) {
      setFormError(result.error);
      return;
    }
    setEditorVisible(false);
  };

  const confirmDelete = (entry: JournalEntry) =>
    Alert.alert('Delete journal entry?', 'This entry will be removed from your journal.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteEntry(entry.id) },
    ]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <MinimalModalHeader
        title="Journal"
        colors={colors}
        onClose={onClose}
        closeIcon="close"
        closeAccessibilityLabel="Close journal"
        showHandle
        rightElement={
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Create journal entry"
            onPress={() => open()}
            style={[styles.circleAddBtn, { backgroundColor: colors.accent }]}
          >
            <Ionicons name="add" size={20} color="#FFF" />
          </TouchableOpacity>
        }
      />

      <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="search" size={18} color={colors.mutedText} />
        <TextInput
          accessibilityLabel="Search journal entries"
          value={query}
          onChangeText={setQuery}
          placeholder="Search notes, habits, dates"
          placeholderTextColor={colors.mutedText}
          style={[styles.searchInput, { color: colors.primaryText }]}
        />
        {!!query && (
          <TouchableOpacity accessibilityLabel="Clear journal search" onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={18} color={colors.mutedText} />
          </TouchableOpacity>
        )}
      </View>

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          <Filter label="All entries" active={habitFilter === 'all'} onPress={() => setHabitFilter('all')} colors={colors} />
          {allHabits.map(habit => (
            <Filter
              key={habit.id}
              label={habit.name}
              active={habitFilter === habit.id}
              onPress={() => setHabitFilter(habit.id)}
              colors={colors}
            />
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 28 }]} keyboardShouldPersistTaps="handled">
        {error && (
          <View style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="cloud-offline-outline" size={18} color={colors.accent} />
            <Text style={[styles.noticeText, { color: colors.secondaryText }]}>{error}</Text>
          </View>
        )}

        {isLoading ? (
          <View style={styles.empty}>
            <ActivityIndicator color={colors.accent} />
            <Text style={[styles.emptyText, { color: colors.secondaryText }]}>Loading journal…</Text>
          </View>
        ) : visible.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.emptyBadge, { backgroundColor: `${colors.accent}1A` }]}>
              <Ionicons name="book-outline" size={26} color={colors.accent} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.primaryText }]}>
              {query || habitFilter !== 'all' ? 'No matching entries' : 'A space to reflect'}
            </Text>
            <Text style={[styles.emptyText, { color: colors.secondaryText }]}>
              Capture what you noticed, how the day felt, or what you want to remember.
            </Text>
            {!query && habitFilter === 'all' && (
              <TouchableOpacity onPress={() => open()} style={[styles.primaryButton, { backgroundColor: colors.accent }]}>
                <Text style={styles.primaryText}>Write an entry</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          visible.map(entry => (
            <View key={entry.id} style={[styles.entry, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.entryTop}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.entryDate, { color: colors.accent }]}>{entry.date}</Text>
                  <Text style={[styles.habitName, { color: colors.secondaryText }]}>
                    {entry.habitId ? allHabits.find(habit => habit.id === entry.habitId)?.name ?? 'Habit' : 'Daily reflection'}
                  </Text>
                </View>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Edit entry"
                  onPress={() => open(entry)}
                  style={styles.smallButton}
                >
                  <Ionicons name="pencil-outline" size={17} color={colors.secondaryText} />
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Delete entry"
                  onPress={() => confirmDelete(entry)}
                  style={styles.smallButton}
                >
                  <Ionicons name="trash-outline" size={17} color={colors.error} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.entryText, { color: colors.primaryText }]}>{entry.text}</Text>
              <Text style={[styles.updatedAt, { color: colors.mutedText }]}>
                Updated {new Date(entry.updatedAt).toLocaleString()}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={editorVisible} transparent animationType="slide" onRequestClose={() => setEditorVisible(false)}>
        <View style={styles.backdrop}>
          <View
            style={[
              styles.editor,
              { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + spacing.md },
            ]}
          >
            <View style={styles.sheetHandleRow}>
              <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            </View>
            <View style={styles.editorHead}>
              <TouchableOpacity
                accessibilityLabel="Close editor"
                onPress={() => setEditorVisible(false)}
                style={[styles.circleCloseBtn, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}
              >
                <Ionicons name="close" size={18} color={colors.primaryText} />
              </TouchableOpacity>
              <Text style={[styles.editorTitle, { color: colors.primaryText }]}>
                {editing ? 'Edit Entry' : 'New Entry'}
              </Text>
              <View style={styles.headerSpacer} />
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={[styles.label, { color: colors.mutedText }]}>DATE (YYYY-MM-DD)</Text>
              <TextInput
                accessibilityLabel="Entry date"
                value={date}
                onChangeText={setDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.mutedText}
                style={[
                  styles.input,
                  { color: colors.primaryText, backgroundColor: colors.secondaryBackground, borderColor: colors.border },
                ]}
              />

              <Text style={[styles.label, { color: colors.mutedText }]}>LINK TO HABIT (OPTIONAL)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                <Filter label="None" active={!habitId} onPress={() => setHabitId(null)} colors={colors} />
                {allHabits.map(habit => (
                  <Filter
                    key={habit.id}
                    label={habit.name}
                    active={habitId === habit.id}
                    onPress={() => setHabitId(habit.id)}
                    colors={colors}
                  />
                ))}
              </ScrollView>

              <Text style={[styles.label, { color: colors.mutedText }]}>REFLECTION</Text>
              <TextInput
                accessibilityLabel="Journal reflection"
                value={text}
                onChangeText={setText}
                multiline
                maxLength={10000}
                textAlignVertical="top"
                placeholder="Write what is on your mind…"
                placeholderTextColor={colors.mutedText}
                style={[
                  styles.input,
                  styles.textArea,
                  { color: colors.primaryText, backgroundColor: colors.secondaryBackground, borderColor: colors.border },
                ]}
              />
              {!!formError && <Text style={[styles.error, { color: colors.error }]}>{formError}</Text>}
              <TouchableOpacity
                accessibilityRole="button"
                onPress={save}
                style={[styles.primaryButton, { backgroundColor: colors.accent }]}
              >
                <Text style={styles.primaryText}>{editing ? 'Save changes' : 'Save entry'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const Filter = ({
  label,
  active,
  onPress,
  colors,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: any;
}) => (
  <TouchableOpacity
    accessibilityRole="button"
    accessibilityState={{ selected: active }}
    onPress={onPress}
    style={[
      styles.filter,
      {
        backgroundColor: active ? colors.accent : colors.card,
        borderColor: active ? colors.accent : colors.border,
      },
    ]}
  >
    <Text numberOfLines={1} style={{ color: active ? '#FFF' : colors.secondaryText, fontSize: 12, fontWeight: '700' }}>
      {label}
    </Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  screen: { flex: 1 },
  circleAddBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBox: {
    marginHorizontal: spacing.lg,
    borderWidth: 1,
    borderRadius: radii.full,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
  },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 10 },
  filters: { paddingHorizontal: spacing.lg, gap: 8, paddingVertical: spacing.md },
  filter: { borderWidth: 1, borderRadius: radii.full, paddingVertical: 8, paddingHorizontal: 14, maxWidth: 180 },
  list: { paddingHorizontal: spacing.lg, gap: spacing.md },
  notice: { borderWidth: 1, borderRadius: radii.lg, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 8 },
  noticeText: { flex: 1, fontSize: 12 },
  empty: { paddingVertical: 40, alignItems: 'center' },
  emptyCard: { alignItems: 'center', padding: spacing.xl, borderWidth: 1, borderRadius: radii.lg, marginTop: spacing.md },
  emptyBadge: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '800', marginTop: spacing.md },
  emptyText: { fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  entry: { borderWidth: 1, borderRadius: radii.lg, padding: spacing.md },
  entryTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  entryDate: { fontSize: 12, fontWeight: '700' },
  habitName: { fontSize: 12, marginTop: 2 },
  smallButton: { minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  entryText: { fontSize: 14, lineHeight: 22, marginTop: spacing.sm + 4 },
  updatedAt: { fontSize: 11, marginTop: spacing.md },
  primaryButton: {
    marginTop: spacing.md,
    borderRadius: radii.full,
    paddingVertical: 14,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  primaryText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.68)', justifyContent: 'flex-end' },
  editor: {
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: '92%',
  },
  sheetHandleRow: { alignItems: 'center', paddingBottom: spacing.sm },
  sheetHandle: { width: 36, height: 4, borderRadius: 2 },
  editorHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  circleCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: { width: 36, height: 36 },
  editorTitle: { fontSize: 18, fontWeight: '700' },
  label: { fontSize: 11, letterSpacing: 0.8, fontWeight: '700', marginTop: spacing.md, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 14 },
  textArea: { minHeight: 160 },
  error: { fontSize: 12, marginTop: spacing.sm },
});
