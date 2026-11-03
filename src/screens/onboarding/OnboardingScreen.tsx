// src/screens/onboarding/OnboardingScreen.tsx
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
import { colors, spacing, radii } from '../../theme/tokens';
import { useHabits, Habit } from '../../services/HabitContext';

interface OnboardingScreenProps {
  onComplete: () => void;
}

const WAKE_OPTIONS = ['06:00 AM', '06:30 AM', '07:00 AM', '07:30 AM', '08:00 AM'];
const SLEEP_OPTIONS = ['10:00 PM', '10:30 PM', '11:00 PM', '11:30 PM'];

const GOALS = [
  { id: 'focus', title: 'Deep Work & Career Focus', icon: 'flash-outline', color: '#3B82F6' },
  { id: 'fitness', title: 'Physical Fitness & Strength', icon: 'fitness-outline', color: '#10B981' },
  { id: 'nutrition', title: 'Hydration & Clean Eating', icon: 'water-outline', color: '#06B6D4' },
  { id: 'mindfulness', title: 'Daily Calm & Meditation', icon: 'flower-outline', color: '#EC4899' },
  { id: 'learning', title: 'Reading & Skill Mastery', icon: 'book-outline', color: '#8B5CF6' },
  { id: 'sleep', title: 'Quality Sleep & Night Routine', icon: 'moon-outline', color: '#6366F1' },
  { id: 'finance', title: 'Financial Discipline', icon: 'wallet-outline', color: '#F59E0B' },
  { id: 'detox', title: 'Digital Detox & Screen Limits', icon: 'phone-portrait-outline', color: '#EF4444' },
];

const SUGGESTED_HABITS: Omit<Habit, 'id' | 'streak' | 'completedDates'>[] = [
  { name: 'Drink Water', category: 'Nutrition & Water', color: '#06B6D4', icon: 'water-outline', targetFrequency: 'Daily', trackingMethod: 'count', targetValue: 8, unit: 'glasses' },
  { name: 'Exercise', category: 'Fitness & Movement', color: '#10B981', icon: 'fitness-outline', targetFrequency: 'Weekdays' },
  { name: 'Sleep 8 Hours', category: 'Sleep & Recovery', color: '#6366F1', icon: 'moon-outline', targetFrequency: 'Daily', trackingMethod: 'count', targetValue: 8, unit: 'hours' },
  { name: 'Deep Work', category: 'Focus & Career', color: '#3B82F6', icon: 'briefcase-outline', targetFrequency: 'Weekdays' },
  { name: 'Plan the Day', category: 'Productivity', color: '#F59E0B', icon: 'calendar-outline', targetFrequency: 'Weekdays' },
  { name: 'Learn Something New', category: 'Learning & Reading', color: '#8B5CF6', icon: 'school-outline', targetFrequency: 'Daily' },
  { name: 'Meditation', category: 'Mindfulness', color: '#EC4899', icon: 'flower-outline', targetFrequency: 'Daily' },
  { name: 'Journaling', category: 'Mindfulness', color: '#EC4899', icon: 'journal-outline', targetFrequency: 'Daily' },
  { name: 'Gratitude', category: 'Mindfulness', color: '#F43F5E', icon: 'heart-outline', targetFrequency: 'Daily' },
  { name: 'Read 20 Pages', category: 'Learning & Reading', color: '#8B5CF6', icon: 'book-outline', targetFrequency: 'Daily', trackingMethod: 'measurable', targetValue: 20, unit: 'pages' },
  { name: 'Learn a Language', category: 'Learning & Reading', color: '#06B6D4', icon: 'chatbubble-ellipses-outline', targetFrequency: 'Daily' },
  { name: 'Practice a Skill', category: 'Learning & Reading', color: '#3B82F6', icon: 'construct-outline', targetFrequency: 'Daily' },
];

export const OnboardingScreen = ({ onComplete }: OnboardingScreenProps) => {
  const insets = useSafeAreaInsets();
  const { addMultipleHabits } = useHabits();

  const [currentStep, setCurrentStep] = useState<number>(1);
  const [selectedGoals, setSelectedGoals] = useState<string[]>(['focus', 'fitness', 'nutrition']);
  const [selectedHabits, setSelectedHabits] = useState<number[]>([0, 1, 2]);
  const [wakeIndex, setWakeIndex] = useState(1); // '06:30 AM'
  const [sleepIndex, setSleepIndex] = useState(1); // '10:30 PM'
  const [reminderActive, setReminderActive] = useState(true);

  const wakeTime = WAKE_OPTIONS[wakeIndex];
  const sleepTime = SLEEP_OPTIONS[sleepIndex];

  const cycleWakeTime = () => setWakeIndex(prev => (prev + 1) % WAKE_OPTIONS.length);
  const cycleSleepTime = () => setSleepIndex(prev => (prev + 1) % SLEEP_OPTIONS.length);

  const toggleGoal = (id: string) => {
    setSelectedGoals(prev =>
      prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]
    );
  };

  const toggleSuggestedHabit = (idx: number) => {
    setSelectedHabits(prev =>
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    );
  };

  const handleFinish = () => {
    // Add selected starter habits
    const habitsToAdd = selectedHabits.map(idx => SUGGESTED_HABITS[idx]);
    if (habitsToAdd.length > 0) {
      addMultipleHabits(habitsToAdd);
    }
    onComplete();
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Top Stepper Bar */}
      <View style={styles.topNavigation}>
        {currentStep > 1 ? (
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => setCurrentStep(prev => prev - 1)}
          >
            <Ionicons name="arrow-back" size={20} color={colors.primaryText} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 32 }} />
        )}

        <View style={styles.stepProgressContainer}>
          <Text style={styles.stepCountText}>STEP {currentStep} OF 4</Text>
          <View style={styles.stepperTrack}>
            <View style={[styles.stepperFill, { width: `${(currentStep / 4) * 100}%` }]} />
          </View>
        </View>

        <TouchableOpacity onPress={onComplete} style={styles.skipBtn}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ================= STEP 1: WELCOME & BRAND VISION ================= */}
        {currentStep === 1 && (
          <View style={styles.stepWrapper}>
            <View style={styles.brandHero}>
              <View style={styles.emblemBox}>
                <Ionicons name="sunny" size={38} color={colors.accent} />
              </View>
              <Text style={styles.brandTitle}>DAYMARK</Text>
              <Text style={styles.tagline}>Progress, Made Visible.</Text>
            </View>

            <View style={styles.editorialCard}>
              <Text style={styles.philosophyQuote}>
                &ldquo;Small actions. Consistent progress. Visible results.&rdquo;
              </Text>
              <Text style={styles.philosophyBody}>
                DAYMARK is a precision personal progress system engineered for high-agency individuals to build daily rituals, maintain consistency, and visualize momentum.
              </Text>
            </View>

            <View style={styles.featurePoints}>
              <View style={styles.featureRow}>
                <View style={styles.featureNum}>
                  <Text style={styles.featureNumText}>01</Text>
                </View>
                <View style={styles.featureTextCol}>
                  <Text style={styles.featureHeading}>Precision Daily Rituals</Text>
                  <Text style={styles.featureSub}>Effortless 1-tap check-ins and streaks.</Text>
                </View>
              </View>

              <View style={styles.featureRow}>
                <View style={styles.featureNum}>
                  <Text style={styles.featureNumText}>02</Text>
                </View>
                <View style={styles.featureTextCol}>
                  <Text style={styles.featureHeading}>Interactive Heatmaps</Text>
                  <Text style={styles.featureSub}>GitHub-style 365-day visual progress grid.</Text>
                </View>
              </View>

              <View style={styles.featureRow}>
                <View style={styles.featureNum}>
                  <Text style={styles.featureNumText}>03</Text>
                </View>
                <View style={styles.featureTextCol}>
                  <Text style={styles.featureHeading}>Actionable Analytics</Text>
                  <Text style={styles.featureSub}>Consistency rates, category breakdowns and milestones.</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={styles.primaryBtn}
              activeOpacity={0.8}
              onPress={() => setCurrentStep(2)}
            >
              <Text style={styles.primaryBtnText}>Begin Setup</Text>
              <Ionicons name="arrow-forward" size={18} color="#000" />
            </TouchableOpacity>
          </View>
        )}

        {/* ================= STEP 2: GOAL SELECTION ================= */}
        {currentStep === 2 && (
          <View style={styles.stepWrapper}>
            <View style={styles.stepHeader}>
              <Text style={styles.stepEyebrow}>STEP 02 • FOCUS AREAS</Text>
              <Text style={styles.stepTitle}>What areas do you want to elevate?</Text>
              <Text style={styles.stepSub}>
                Select the pillars you want to prioritize in your daily life ({selectedGoals.length} selected).
              </Text>
            </View>

            <View style={styles.goalsGrid}>
              {GOALS.map(g => {
                const isSelected = selectedGoals.includes(g.id);
                return (
                  <TouchableOpacity
                    key={g.id}
                    style={[
                      styles.goalCard,
                      isSelected && { borderColor: g.color, backgroundColor: `${g.color}15` },
                    ]}
                    activeOpacity={0.7}
                    onPress={() => toggleGoal(g.id)}
                  >
                    <View style={[styles.goalIconCircle, { backgroundColor: `${g.color}25` }]}>
                      <Ionicons name={g.icon as any} size={22} color={g.color} />
                    </View>
                    <Text
                      style={[
                        styles.goalTitle,
                        isSelected && { color: colors.primaryText, fontWeight: '700' },
                      ]}
                    >
                      {g.title}
                    </Text>
                    <View
                      style={[
                        styles.goalCheckmark,
                        isSelected && { backgroundColor: g.color, borderColor: g.color },
                      ]}
                    >
                      {isSelected && <Ionicons name="checkmark" size={14} color="#000" />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={styles.primaryBtn}
              activeOpacity={0.8}
              onPress={() => setCurrentStep(3)}
            >
              <Text style={styles.primaryBtnText}>Continue to Recommended Habits</Text>
              <Ionicons name="arrow-forward" size={18} color="#000" />
            </TouchableOpacity>
          </View>
        )}

        {/* ================= STEP 3: SUGGESTED HABITS ================= */}
        {currentStep === 3 && (
          <View style={styles.stepWrapper}>
            <View style={styles.stepHeader}>
              <Text style={styles.stepEyebrow}>STEP 03 • STARTER RITUALS</Text>
              <Text style={styles.stepTitle}>Curated starter habits</Text>
              <Text style={styles.stepSub}>
                Based on your focus areas, here are recommended habits to kickstart your Daymark routine:
              </Text>
            </View>

            <View style={styles.suggestedList}>
              {SUGGESTED_HABITS.map((habit, idx) => {
                const isSelected = selectedHabits.includes(idx);
                return (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.suggestedHabitCard,
                      isSelected && { borderColor: habit.color, backgroundColor: '#141519' },
                    ]}
                    activeOpacity={0.7}
                    onPress={() => toggleSuggestedHabit(idx)}
                  >
                    <View style={[styles.suggestedIcon, { backgroundColor: `${habit.color}1F` }]}>
                      <Ionicons name={habit.icon} size={22} color={habit.color} />
                    </View>

                    <View style={styles.suggestedMeta}>
                      <Text style={styles.suggestedHabitName}>{habit.name}</Text>
                      <Text style={styles.suggestedCategory}>
                        {habit.category} • {habit.targetFrequency}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.suggestedCheck,
                        isSelected && { backgroundColor: habit.color, borderColor: habit.color },
                      ]}
                    >
                      {isSelected && <Ionicons name="checkmark" size={16} color="#000" />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={styles.primaryBtn}
              activeOpacity={0.8}
              onPress={() => setCurrentStep(4)}
            >
              <Text style={styles.primaryBtnText}>
                Add {selectedHabits.length} Habits & Continue
              </Text>
              <Ionicons name="arrow-forward" size={18} color="#000" />
            </TouchableOpacity>
          </View>
        )}

        {/* ================= STEP 4: CADENCE & FINALIZE ================= */}
        {currentStep === 4 && (
          <View style={styles.stepWrapper}>
            <View style={styles.stepHeader}>
              <Text style={styles.stepEyebrow}>STEP 04 • CADENCE & RHYTHM</Text>
              <Text style={styles.stepTitle}>Set your daily rhythm</Text>
              <Text style={styles.stepSub}>
                Daymark tailors morning focus and evening wind-down schedules to your circadian rhythm.
              </Text>
            </View>

            <View style={styles.cadenceCard}>
              <View style={styles.timeRow}>
                <View style={styles.timeIconCircle}>
                  <Ionicons name="sunny-outline" size={20} color={colors.accent} />
                </View>
                <View style={styles.timeInfo}>
                  <Text style={styles.timeTitle}>Wake-up Target</Text>
                  <Text style={styles.timeSub}>Morning habits start here</Text>
                </View>
                <TouchableOpacity style={styles.timePill} onPress={cycleWakeTime} activeOpacity={0.7}>
                  <Text style={styles.timePillText}>{wakeTime}</Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.timeRow, { borderBottomWidth: 0 }]}>
                <View style={[styles.timeIconCircle, { backgroundColor: 'rgba(99, 102, 241, 0.15)' }]}>
                  <Ionicons name="moon-outline" size={20} color="#6366F1" />
                </View>
                <View style={styles.timeInfo}>
                  <Text style={styles.timeTitle}>Sleep & Wind-down</Text>
                  <Text style={styles.timeSub}>Evening review & screen cutoff</Text>
                </View>
                <TouchableOpacity style={styles.timePill} onPress={cycleSleepTime} activeOpacity={0.7}>
                  <Text style={styles.timePillText}>{sleepTime}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Reminder Toggle */}
            <View style={styles.notificationCard}>
              <View style={styles.notiLeft}>
                <Ionicons name="notifications-outline" size={22} color={colors.accent} />
                <View>
                  <Text style={styles.notiTitle}>Daily Morning Prompt</Text>
                  <Text style={styles.notiSub}>Gentle reminder at 08:00 AM</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.switchTrack, reminderActive && styles.switchTrackActive]}
                onPress={() => setReminderActive(!reminderActive)}
              >
                <View style={[styles.switchThumb, reminderActive && styles.switchThumbActive]} />
              </TouchableOpacity>
            </View>

            {/* Final Welcome Banner */}
            <View style={styles.launchBanner}>
              <Ionicons name="checkmark-circle" size={24} color={colors.accent} />
              <Text style={styles.launchText}>
                Your Daymark routine is ready with {selectedHabits.length} habits configured.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.accent }]}
              activeOpacity={0.8}
              onPress={handleFinish}
            >
              <Text style={styles.primaryBtnText}>Enter Daymark</Text>
              <Ionicons name="rocket-outline" size={18} color="#000" />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.elevatedCard,
  },
  backBtn: {
    padding: 6,
  },
  stepProgressContainer: {
    alignItems: 'center',
    width: 140,
  },
  stepCountText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.secondaryText,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  stepperTrack: {
    width: '100%',
    height: 4,
    backgroundColor: colors.secondaryBackground,
    borderRadius: radii.full,
    overflow: 'hidden',
  },
  stepperFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: radii.full,
  },
  skipBtn: {
    padding: 6,
  },
  skipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.mutedText,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  stepWrapper: {
    flex: 1,
  },
  brandHero: {
    alignItems: 'center',
    marginBottom: spacing.xl,
    marginTop: spacing.sm,
  },
  emblemBox: {
    width: 68,
    height: 68,
    borderRadius: radii.xl,
    backgroundColor: 'rgba(255, 122, 0, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 122, 0, 0.3)',
    marginBottom: spacing.md,
  },
  brandTitle: {
    fontSize: 36,
    fontWeight: '900',
    color: colors.primaryText,
    letterSpacing: 3,
  },
  tagline: {
    fontSize: 16,
    color: colors.accent,
    fontWeight: '600',
    letterSpacing: 1.5,
    marginTop: 4,
  },
  editorialCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.elevatedCard,
    marginBottom: spacing.xl,
  },
  philosophyQuote: {
    fontSize: 15,
    fontStyle: 'italic',
    color: colors.primaryText,
    fontWeight: '600',
    marginBottom: 8,
  },
  philosophyBody: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.secondaryText,
  },
  featurePoints: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.secondaryBackground,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.elevatedCard,
    gap: spacing.md,
  },
  featureNum: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.elevatedCard,
  },
  featureNumText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.accent,
  },
  featureTextCol: {
    flex: 1,
  },
  featureHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primaryText,
  },
  featureSub: {
    fontSize: 12,
    color: colors.secondaryText,
    marginTop: 2,
  },
  stepHeader: {
    marginBottom: spacing.lg,
  },
  stepEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.accent,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  stepTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.primaryText,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  stepSub: {
    fontSize: 14,
    color: colors.secondaryText,
    lineHeight: 20,
  },
  goalsGrid: {
    gap: 10,
    marginBottom: spacing.xl,
  },
  goalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.elevatedCard,
    gap: spacing.md,
  },
  goalIconCircle: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalTitle: {
    flex: 1,
    fontSize: 14,
    color: colors.primaryText,
    fontWeight: '600',
  },
  goalCheckmark: {
    width: 22,
    height: 22,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderColor: colors.mutedText,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestedList: {
    gap: 10,
    marginBottom: spacing.xl,
  },
  suggestedHabitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.elevatedCard,
    gap: spacing.md,
  },
  suggestedIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestedMeta: {
    flex: 1,
  },
  suggestedHabitName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primaryText,
  },
  suggestedCategory: {
    fontSize: 12,
    color: colors.secondaryText,
    marginTop: 2,
  },
  suggestedCheck: {
    width: 24,
    height: 24,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderColor: colors.mutedText,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cadenceCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.elevatedCard,
    marginBottom: spacing.lg,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.elevatedCard,
    gap: spacing.md,
  },
  timeIconCircle: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255, 122, 0, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeInfo: {
    flex: 1,
  },
  timeTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primaryText,
  },
  timeSub: {
    fontSize: 12,
    color: colors.secondaryText,
    marginTop: 2,
  },
  timePill: {
    backgroundColor: colors.secondaryBackground,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.elevatedCard,
  },
  timePillText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primaryText,
  },
  notificationCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.elevatedCard,
    marginBottom: spacing.lg,
  },
  notiLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  notiTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primaryText,
  },
  notiSub: {
    fontSize: 12,
    color: colors.secondaryText,
    marginTop: 2,
  },
  switchTrack: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#26282E',
    padding: 2,
    justifyContent: 'center',
  },
  switchTrackActive: {
    backgroundColor: colors.accent,
  },
  switchThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFF',
  },
  switchThumbActive: {
    alignSelf: 'flex-end',
  },
  launchBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 122, 0, 0.1)',
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.md,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(255, 122, 0, 0.25)',
  },
  launchText: {
    flex: 1,
    fontSize: 13,
    color: colors.primaryText,
    fontWeight: '500',
    lineHeight: 18,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    paddingVertical: 16,
    borderRadius: radii.md,
    gap: 8,
    marginTop: spacing.xs,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#000',
  },
});
