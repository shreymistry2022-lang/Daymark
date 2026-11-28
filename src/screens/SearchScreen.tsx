import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing, radii } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useHabits } from '../services/HabitContext';
import { useRoutines } from '../services/RoutinesContext';
import { useGoals } from '../services/GoalsContext';
import { useJournal } from '../services/JournalContext';
import { MinimalModalHeader } from '../components/MinimalModalHeader';
import { calculateCompletionStats, calculateStreakStats, parseLocalDate } from '../domain/habitEngine';
import { getRoutineProgress } from '../domain/routineEngine';
import { calculateGoalProgress } from '../domain/goalEngine';

type Filter = 'all' | 'active' | 'archived' | 'positive' | 'quit';
type Sort = 'recent' | 'alphabetical' | 'most' | 'least' | 'completion';

interface Result {
  id: string;
  type: 'Habit' | 'Routine' | 'Goal' | 'Journal';
  name: string;
  detail: string;
  date: string;
  score: number;
  completed: boolean;
}

interface Props {
  onClose?: () => void;
  onOpenHabit: (id: string) => void;
  onOpenRoutine: (id: string) => void;
  onOpenGoal: (id: string) => void;
  onOpenJournal: (id: string) => void;
}

export const SearchScreen = ({ onClose, onOpenHabit, onOpenRoutine, onOpenGoal, onOpenJournal }: Props) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { allHabits, todayDateStr } = useHabits();
  const { routines } = useRoutines();
  const { goals } = useGoals();
  const { entries } = useJournal();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState<Sort>('recent');

  const categories = [...new Set(allHabits.map(habit => habit.category).filter(Boolean))].sort();

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const dateRef = parseLocalDate(todayDateStr) ?? new Date();
    const habitResults: Result[] = allHabits
      .filter(habit => {
        const archived = Boolean(habit.archivedAt);
        if ((filter === 'active' && archived) || (filter === 'archived' && !archived)) return false;
        if ((filter === 'positive' && habit.habitKind === 'quit') || (filter === 'quit' && habit.habitKind !== 'quit')) {
          return false;
        }
        if (category !== 'all' && habit.category !== category) return false;
        const haystack = [habit.name, habit.category, habit.description, ...(habit.logs ?? []).map(log => log.note)]
          .join(' ')
          .toLowerCase();
        return !needle || haystack.includes(needle);
      })
      .map(habit => {
        const stats = calculateCompletionStats(habit, habit.startDate ?? '2000-01-01', todayDateStr, dateRef);
        return {
          id: habit.id,
          type: 'Habit' as const,
          name: habit.name,
          detail: `${habit.category} · ${habit.habitKind === 'quit' ? 'Quit' : 'Positive'} · ${stats.percentage}% completion`,
          date: habit.startDate ?? '',
          score: sort === 'most' || sort === 'least' ? calculateStreakStats(habit, dateRef).currentStreak : stats.percentage,
          completed: !habit.archivedAt,
        };
      });

    const includeGeneral = filter === 'all' || filter === 'active' || filter === 'archived';
    const other: Result[] = includeGeneral
      ? [
          ...routines
            .filter(routine => filter !== 'archived' || Boolean(routine.archivedAt))
            .filter(routine => filter !== 'active' || !routine.archivedAt)
            .filter(
              routine =>
                category === 'all' ||
                routine.habitIds.some(id => allHabits.find(habit => habit.id === id)?.category === category),
            )
            .filter(routine => !needle || `${routine.name} ${routine.description}`.toLowerCase().includes(needle))
            .map(routine => {
              const progress = getRoutineProgress(routine, allHabits, todayDateStr, dateRef);
              return {
                id: routine.id,
                type: 'Routine' as const,
                name: routine.name,
                detail: `${routine.habitIds.length} linked habits · ${progress.percentage}% today`,
                date: routine.createdAt,
                score: progress.percentage,
                completed: !routine.archivedAt,
              };
            }),
          ...goals
            .filter(goal => filter !== 'archived' || Boolean(goal.archivedAt))
            .filter(goal => filter !== 'active' || !goal.archivedAt)
            .filter(goal => category === 'all' || goal.category === category)
            .filter(goal => !needle || `${goal.name} ${goal.description} ${goal.category}`.toLowerCase().includes(needle))
            .map(goal => {
              const progress = calculateGoalProgress(goal, allHabits, todayDateStr, dateRef);
              return {
                id: goal.id,
                type: 'Goal' as const,
                name: goal.name,
                detail: `${goal.category} · ${goal.habitIds.length} linked habits${
                  progress.percentage == null ? '' : ` · ${progress.percentage}%`
                }`,
                date: goal.createdAt,
                score: progress.percentage ?? 0,
                completed: !goal.archivedAt,
              };
            }),
          ...entries
            .filter(() => filter !== 'archived')
            .filter(
              entry => category === 'all' || allHabits.find(habit => habit.id === entry.habitId)?.category === category,
            )
            .filter(
              entry =>
                !needle ||
                `${entry.text} ${entry.date} ${allHabits.find(habit => habit.id === entry.habitId)?.name ?? ''}`
                  .toLowerCase()
                  .includes(needle),
            )
            .map(entry => ({
              id: entry.id,
              type: 'Journal' as const,
              name: entry.text.slice(0, 62),
              detail: `${entry.date} · ${allHabits.find(habit => habit.id === entry.habitId)?.name ?? 'Daily reflection'}`,
              date: entry.createdAt,
              score: 0,
              completed: true,
            })),
        ]
      : [];

    return [...habitResults, ...other].sort((a, b) =>
      sort === 'alphabetical'
        ? a.name.localeCompare(b.name)
        : sort === 'most'
          ? b.score - a.score
          : sort === 'least'
            ? a.score - b.score
            : sort === 'completion'
              ? b.score - a.score
              : b.date.localeCompare(a.date),
    );
  }, [allHabits, routines, goals, entries, query, filter, category, sort, todayDateStr]);

  const filterOptions: Filter[] = ['all', 'active', 'archived', 'positive', 'quit'];
  const sortOptions: { key: Sort; label: string }[] = [
    { key: 'recent', label: 'Recent' },
    { key: 'alphabetical', label: 'A–Z' },
    { key: 'most', label: 'Most consistent' },
    { key: 'least', label: 'Least consistent' },
    { key: 'completion', label: 'Highest completion' },
  ];

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <MinimalModalHeader
        title="Search"
        colors={colors}
        onClose={onClose}
        closeIcon="close"
        closeAccessibilityLabel="Close search"
        showHandle
      />

      <View style={[styles.search, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="search" size={18} color={colors.mutedText} />
        <TextInput
          accessibilityLabel="Search all Daymark data"
          value={query}
          onChangeText={setQuery}
          placeholder="Habits, notes, routines, goals"
          placeholderTextColor={colors.mutedText}
          style={[styles.input, { color: colors.primaryText }]}
        />
        {!!query && (
          <TouchableOpacity accessibilityLabel="Clear search" onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={18} color={colors.mutedText} />
          </TouchableOpacity>
        )}
      </View>

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {filterOptions.map(option => (
            <Chip
              key={option}
              label={option === 'all' ? 'All' : option[0].toUpperCase() + option.slice(1)}
              active={filter === option}
              onPress={() => setFilter(option)}
              colors={colors}
            />
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chips, { paddingTop: 0 }]}>
          <Chip label="Any category" active={category === 'all'} onPress={() => setCategory('all')} colors={colors} />
          {categories.map(item => (
            <Chip key={item} label={item} active={category === item} onPress={() => setCategory(item)} colors={colors} />
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chips, { paddingTop: 0 }]}>
          {sortOptions.map(option => (
            <Chip
              key={option.key}
              label={option.label}
              active={sort === option.key}
              onPress={() => setSort(option.key)}
              colors={colors}
            />
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={[styles.results, { paddingBottom: insets.bottom + 28 }]}>
        <Text style={[styles.count, { color: colors.mutedText }]}>
          {results.length} {results.length === 1 ? 'RESULT' : 'RESULTS'}
        </Text>
        {results.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.emptyBadge, { backgroundColor: `${colors.accent}1A` }]}>
              <Ionicons name="search-outline" size={26} color={colors.accent} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.primaryText }]}>Nothing found</Text>
            <Text style={[styles.emptyText, { color: colors.secondaryText }]}>
              Try another word or adjust the filters.
            </Text>
          </View>
        ) : (
          results.map(result => (
            <TouchableOpacity
              key={`${result.type}:${result.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Open ${result.type.toLowerCase()} ${result.name}`}
              onPress={() => {
                if (result.type === 'Habit') onOpenHabit(result.id);
                else if (result.type === 'Routine') onOpenRoutine(result.id);
                else if (result.type === 'Goal') onOpenGoal(result.id);
                else onOpenJournal(result.id);
              }}
              style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.type, { color: colors.accent }]}>
                  {result.type.toUpperCase()}
                  {result.completed ? '' : ' · ARCHIVED'}
                </Text>
                <Text numberOfLines={2} style={[styles.name, { color: colors.primaryText }]}>
                  {result.name}
                </Text>
                <Text numberOfLines={1} style={[styles.detail, { color: colors.secondaryText }]}>
                  {result.detail}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.mutedText} />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
};

const Chip = ({
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
      styles.chip,
      {
        backgroundColor: active ? colors.accent : colors.card,
        borderColor: active ? colors.accent : colors.border,
      },
    ]}
  >
    <Text style={{ color: active ? '#FFF' : colors.secondaryText, fontSize: 12, fontWeight: '700' }}>
      {label}
    </Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  screen: { flex: 1 },
  search: {
    marginHorizontal: spacing.lg,
    minHeight: 46,
    borderWidth: 1,
    borderRadius: radii.full,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  input: { flex: 1, paddingVertical: 10, fontSize: 14 },
  chips: { paddingHorizontal: spacing.lg, gap: 8, paddingVertical: spacing.xs + 3 },
  chip: { borderWidth: 1, borderRadius: radii.full, paddingVertical: 7, paddingHorizontal: 13 },
  results: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingTop: spacing.xs },
  count: { fontSize: 11, fontWeight: '700', letterSpacing: 0.7, marginBottom: 4, marginLeft: 4 },
  row: {
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  type: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  name: { fontSize: 15, fontWeight: '700', marginTop: 3 },
  detail: { fontSize: 12, marginTop: 4 },
  empty: { alignItems: 'center', padding: spacing.xl, borderWidth: 1, borderRadius: radii.lg, marginTop: spacing.sm },
  emptyBadge: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 17, fontWeight: '800', marginTop: spacing.md },
  emptyText: { fontSize: 13, textAlign: 'center', marginTop: 6 },
});
