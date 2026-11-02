// src/screens/TodayScreen.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing, radii } from '../theme/tokens';
import { useHabits } from '../services/HabitContext';
import { useTheme } from '../theme/ThemeProvider';
import { CreateHabitModal } from '../components/CreateHabitModal';
import { HABIT_CATEGORIES } from '../constants/categories';

export const TodayScreen = () => {
  const { habits, toggleHabit, addHabit, todayDateStr, stats } = useHabits();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  // Filter state
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [createModalVisible, setCreateModalVisible] = useState(false);

  // Extract unique active categories from existing habits plus popular ones
  const availableCategories = [
    'All',
    ...Array.from(new Set(habits.map(h => h.category))),
  ];

  const filteredHabits = habits.filter(h => {
    if (selectedCategory === 'All') return true;
    return h.category === selectedCategory;
  });

  const currentDateFormatted = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).toUpperCase();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 110 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Editorial Top Bar */}
        <View style={styles.topBar}>
          <View>
            <Text style={[styles.dateLabel, { color: colors.accent }]}>{currentDateFormatted}</Text>
            <Text style={[styles.mainTitle, { color: colors.primaryText }]}>Today&apos;s Focus</Text>
          </View>
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: colors.accent }]}
            activeOpacity={0.7}
            onPress={() => setCreateModalVisible(true)}
          >
            <Ionicons name="add" size={20} color="#000" />
            <Text style={styles.addButtonText}>New Habit</Text>
          </TouchableOpacity>
        </View>

        {/* Swiss Progress Dashboard Card */}
        <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.heroHeader}>
            <View>
              <Text style={[styles.heroCategory, { color: colors.secondaryText }]}>DAILY RITUALS</Text>
              <Text style={[styles.heroStats, { color: colors.primaryText }]}>
                {stats.completedToday} of {stats.totalToday} completed
              </Text>
            </View>
            <View style={[styles.percentageBadge, { backgroundColor: `${colors.accent}18` }]}>
              <Text style={[styles.percentageText, { color: colors.accent }]}>{stats.completionRate}%</Text>
            </View>
          </View>

          {/* Precision Progress Bar */}
          <View style={[styles.progressTrack, { backgroundColor: colors.secondaryBackground }]}>
            <View
              style={[
                styles.progressBar,
                { width: `${Math.max(5, stats.completionRate)}%`, backgroundColor: colors.accent },
              ]}
            />
          </View>

          <View style={styles.heroFooter}>
            <View style={styles.streakIndicator}>
              <Ionicons name="flame" size={16} color={colors.accent} />
              <Text style={[styles.streakText, { color: colors.primaryText }]}>{stats.bestStreak} Day Best Streak</Text>
            </View>
            <Text style={[styles.quoteSubtext, { color: colors.mutedText }]}>
              {stats.completionRate === 100 ? 'All done for today! 🎉' : 'Keep momentum going'}
            </Text>
          </View>
        </View>

        {/* Filter Pills with Categories */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {availableCategories.map(cat => {
            const isActive = selectedCategory === cat;
            const categoryDef = HABIT_CATEGORIES.find(c => c.name === cat);
            return (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: isActive ? colors.primaryText : colors.card,
                    borderColor: isActive ? colors.primaryText : colors.border,
                  },
                ]}
                activeOpacity={0.7}
                onPress={() => setSelectedCategory(cat)}
              >
                {categoryDef && (
                  <Ionicons
                    name={categoryDef.icon}
                    size={14}
                    color={isActive ? colors.background : categoryDef.color}
                    style={{ marginRight: 6 }}
                  />
                )}
                <Text
                  style={[
                    styles.filterPillText,
                    { color: isActive ? colors.background : colors.secondaryText },
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Habit Cards Section */}
        <View style={styles.habitsSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionHeader, { color: colors.secondaryText }]}>
              HABITS ({filteredHabits.length})
            </Text>
            <TouchableOpacity onPress={() => setCreateModalVisible(true)}>
              <Text style={[styles.quickAddLink, { color: colors.accent }]}>+ Create Habit</Text>
            </TouchableOpacity>
          </View>

          {filteredHabits.map(habit => {
            const isCompleted = habit.completedDates.includes(todayDateStr);
            return (
              <TouchableOpacity
                key={habit.id}
                style={[
                  styles.habitCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: isCompleted ? `${colors.accent}40` : colors.border,
                  },
                ]}
                activeOpacity={0.8}
                onPress={() => toggleHabit(habit.id)}
              >
                <View
                  style={[
                    styles.habitIconBox,
                    { backgroundColor: `${habit.color}1F` },
                  ]}
                >
                  <Ionicons name={habit.icon} size={22} color={habit.color} />
                </View>

                <View style={styles.habitMeta}>
                  <Text
                    style={[
                      styles.habitTitle,
                      { color: isCompleted ? colors.mutedText : colors.primaryText },
                      isCompleted && styles.habitTitleCompleted,
                    ]}
                    numberOfLines={1}
                  >
                    {habit.name}
                  </Text>
                  <View style={styles.tagRow}>
                    <Text style={[styles.categoryTag, { color: colors.secondaryText }]}>{habit.category}</Text>
                    <Text style={[styles.tagDivider, { color: colors.mutedText }]}>•</Text>
                    <Text style={[styles.streakTag, { color: colors.accent }]}>🔥 {habit.streak}d streak</Text>
                    <Text style={[styles.tagDivider, { color: colors.mutedText }]}>•</Text>
                    <Text style={[styles.freqTag, { color: colors.mutedText }]}>{habit.targetFrequency}</Text>
                  </View>
                </View>

                {/* Big Interactive Checkbox */}
                <TouchableOpacity
                  style={[
                    styles.checkbox,
                    {
                      borderColor: isCompleted ? habit.color : colors.border,
                      backgroundColor: isCompleted ? habit.color : colors.secondaryBackground,
                    },
                  ]}
                  activeOpacity={0.6}
                  onPress={() => toggleHabit(habit.id)}
                >
                  {isCompleted && (
                    <Ionicons name="checkmark" size={18} color="#000" />
                  )}
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}

          {filteredHabits.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="leaf-outline" size={40} color={colors.secondaryText} />
              <Text style={[styles.emptyTitle, { color: colors.primaryText }]}>No habits found</Text>
              <TouchableOpacity
                style={[styles.emptyButton, { backgroundColor: colors.card, borderColor: colors.accent }]}
                onPress={() => setCreateModalVisible(true)}
              >
                <Text style={[styles.emptyButtonText, { color: colors.accent }]}>+ Create New Habit</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Floating Action Button for Quick Habit Creation */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.accent, bottom: insets.bottom + 80 }]}
        activeOpacity={0.8}
        onPress={() => setCreateModalVisible(true)}
      >
        <Ionicons name="add" size={28} color="#000" />
      </TouchableOpacity>

      {/* 14 Categories Creation Modal */}
      <CreateHabitModal
        visible={createModalVisible}
        onClose={() => setCreateModalVisible(false)}
        onAddHabit={addHabit}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  dateLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  mainTitle: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 2,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.full,
    gap: 4,
  },
  addButtonText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 13,
  },
  heroCard: {
    borderRadius: radii.lg,
    padding: spacing.xl,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  heroCategory: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  heroStats: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 2,
  },
  percentageBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.full,
  },
  percentageText: {
    fontWeight: '800',
    fontSize: 16,
  },
  progressTrack: {
    height: 10,
    borderRadius: radii.full,
    overflow: 'hidden',
    marginVertical: spacing.sm,
  },
  progressBar: {
    height: '100%',
    borderRadius: radii.full,
  },
  heroFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  streakIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  streakText: {
    fontSize: 13,
    fontWeight: '600',
  },
  quoteSubtext: {
    fontSize: 12,
  },
  filterRow: {
    gap: 8,
    marginBottom: spacing.lg,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.full,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  habitsSection: {
    marginTop: spacing.xs,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  quickAddLink: {
    fontSize: 13,
    fontWeight: '600',
  },
  habitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
  },
  habitIconBox: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  habitMeta: {
    flex: 1,
  },
  habitTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  habitTitleCompleted: {
    textDecorationLine: 'line-through',
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    flexWrap: 'wrap',
  },
  categoryTag: {
    fontSize: 12,
  },
  tagDivider: {
    marginHorizontal: 5,
  },
  streakTag: {
    fontSize: 12,
    fontWeight: '500',
  },
  freqTag: {
    fontSize: 11,
  },
  checkbox: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  emptyButton: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radii.full,
    borderWidth: 1,
  },
  emptyButtonText: {
    fontWeight: '700',
    fontSize: 13,
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
});
