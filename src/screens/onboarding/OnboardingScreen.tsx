// src/screens/onboarding/OnboardingScreen.tsx
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radii } from '../../theme/tokens';
import { useHabits, Habit } from '../../services/HabitContext';
import { usePreferences } from '../../services/PreferencesContext';
import { useAuth, SocialProvider } from '../../services/AuthProvider';
import { ensureLocalReminderPermission, parseTimeString } from '../../services/localReminders';
import * as Haptics from 'expo-haptics';

interface OnboardingScreenProps {
  onComplete: () => void;
}

const WAKE_OPTIONS = ['06:00 AM', '06:30 AM', '07:00 AM', '07:30 AM', '08:00 AM'];
const SLEEP_OPTIONS = ['10:00 PM', '10:30 PM', '11:00 PM', '11:30 PM'];

const GOALS = [
  { id: 'focus', title: 'Deep Work & Career Focus', icon: 'flash-outline', color: '#3B82F6', habitIdxs: [3, 4] },
  { id: 'fitness', title: 'Fitness & Physical Movement', icon: 'fitness-outline', color: '#10B981', habitIdxs: [1, 0] },
  { id: 'nutrition', title: 'Hydration & Nutrition', icon: 'water-outline', color: '#06B6D4', habitIdxs: [0, 1] },
  { id: 'mindfulness', title: 'Daily Calm & Mindfulness', icon: 'flower-outline', color: '#EC4899', habitIdxs: [6, 7] },
  { id: 'learning', title: 'Reading & Skill Mastery', icon: 'book-outline', color: '#8B5CF6', habitIdxs: [9, 5] },
  { id: 'sleep', title: 'Sleep & Night Recovery', icon: 'moon-outline', color: '#6366F1', habitIdxs: [2, 7] },
];

const OBSTACLES = [
  {
    id: 'motivation',
    icon: 'flame-outline',
    title: 'I lose motivation after 4–5 days',
    solution: 'Daymark streaks & celebratory milestones transform invisible daily effort into tangible dopamine.',
  },
  {
    id: 'forget',
    icon: 'notifications-outline',
    title: 'Busy, chaotic days make me forget',
    solution: 'Dynamic circadian alarms sound right during your morning routine or evening wind-down.',
  },
  {
    id: 'burnout',
    icon: 'battery-charging-outline',
    title: 'I try to do too much at once and burn out',
    solution: 'Daymark champions micro-habits (2–5 mins/day) so your baseline identity locks in with zero friction.',
  },
  {
    id: 'no_results',
    icon: 'grid-outline',
    title: 'I can’t see if I’m actually making progress',
    solution: 'GitHub-style 365-day heatmaps and consistency rates provide undeniable visual proof of compounding growth.',
  },
];

const SUGGESTED_HABITS: Omit<Habit, 'id' | 'streak' | 'completedDates'>[] = [
  { name: 'Drink Water', category: 'Nutrition & Water', color: '#06B6D4', icon: 'water-outline', targetFrequency: 'Daily', trackingMethod: 'yes_no' },
  { name: 'Exercise', category: 'Fitness & Movement', color: '#10B981', icon: 'fitness-outline', targetFrequency: 'Weekdays', trackingMethod: 'yes_no' },
  { name: 'Sleep 8 Hours', category: 'Sleep & Recovery', color: '#6366F1', icon: 'moon-outline', targetFrequency: 'Daily', trackingMethod: 'yes_no' },
  { name: 'Deep Work', category: 'Focus & Career', color: '#3B82F6', icon: 'briefcase-outline', targetFrequency: 'Weekdays', trackingMethod: 'yes_no' },
  { name: 'Plan the Day', category: 'Productivity', color: '#F59E0B', icon: 'calendar-outline', targetFrequency: 'Weekdays', trackingMethod: 'yes_no' },
  { name: 'Learn Something New', category: 'Learning & Reading', color: '#8B5CF6', icon: 'school-outline', targetFrequency: 'Daily', trackingMethod: 'yes_no' },
  { name: 'Meditation', category: 'Mindfulness', color: '#EC4899', icon: 'flower-outline', targetFrequency: 'Daily', trackingMethod: 'yes_no' },
  { name: 'Journaling', category: 'Mindfulness', color: '#EC4899', icon: 'journal-outline', targetFrequency: 'Daily', trackingMethod: 'yes_no' },
  { name: 'Gratitude', category: 'Mindfulness', color: '#F43F5E', icon: 'heart-outline', targetFrequency: 'Daily', trackingMethod: 'yes_no' },
  { name: 'Read 20 Pages', category: 'Learning & Reading', color: '#8B5CF6', icon: 'book-outline', targetFrequency: 'Daily', trackingMethod: 'yes_no' },
  { name: 'Learn a Language', category: 'Learning & Reading', color: '#06B6D4', icon: 'chatbubble-ellipses-outline', targetFrequency: 'Daily', trackingMethod: 'yes_no' },
  { name: 'Practice a Skill', category: 'Learning & Reading', color: '#3B82F6', icon: 'construct-outline', targetFrequency: 'Daily', trackingMethod: 'yes_no' },
];

export const OnboardingScreen = ({ onComplete }: OnboardingScreenProps) => {
  const insets = useSafeAreaInsets();
  const { addMultipleHabits } = useHabits();
  const { updatePreferences, preferences } = usePreferences();
  const { signUp, signIn, signInWithProvider, continueAsGuest } = useAuth();

  const [currentStep, setCurrentStep] = useState<number>(1);
  const totalSteps = 6;

  // Selections
  const [selectedGoals, setSelectedGoals] = useState<string[]>(['focus', 'fitness']);
  const [selectedObstacle, setSelectedObstacle] = useState<string>('motivation');
  const [selectedHabits, setSelectedHabits] = useState<number[]>([0, 1, 3]);
  const [wakeIndex, setWakeIndex] = useState(1); // '06:30 AM'
  const [sleepIndex, setSleepIndex] = useState(1); // '10:30 PM'
  const [reminderActive, setReminderActive] = useState(true);

  // Sign up / In Form state for Step 6
  const [authMode, setAuthMode] = useState<'signup' | 'signin'>('signup');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Animations
  const [fadeAnim] = useState(() => new Animated.Value(1));
  const [slideAnim] = useState(() => new Animated.Value(0));
  const [progressAnim] = useState(() => new Animated.Value((1 / totalSteps) * 100));
  const [pulseAnim] = useState(() => new Animated.Value(1));

  // Gentle breathing loop for Step 1 Emblem
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.1, duration: 1600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1600, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  const changeStep = useCallback((newStep: number) => {
    if (preferences.hapticsEnabled) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    // Animate transition
    fadeAnim.setValue(0);
    slideAnim.setValue(16);
    setCurrentStep(newStep);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
      Animated.spring(progressAnim, {
        toValue: (newStep / totalSteps) * 100,
        friction: 8,
        tension: 40,
        useNativeDriver: false,
      }),
    ]).start();
  }, [preferences.hapticsEnabled, fadeAnim, slideAnim, progressAnim]);

  const wakeTime = WAKE_OPTIONS[wakeIndex];
  const sleepTime = SLEEP_OPTIONS[sleepIndex];

  const cycleWakeTime = () => setWakeIndex(prev => (prev + 1) % WAKE_OPTIONS.length);
  const cycleSleepTime = () => setSleepIndex(prev => (prev + 1) % SLEEP_OPTIONS.length);

  const toggleGoal = (id: string) => {
    if (preferences.hapticsEnabled) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    setSelectedGoals(prev => {
      const next = prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id];
      // Auto-suggest relevant habits from chosen goals
      const relevantHabits = new Set<number>();
      next.forEach(goalId => {
        const goal = GOALS.find(g => g.id === goalId);
        if (goal) goal.habitIdxs.forEach(idx => relevantHabits.add(idx));
      });
      if (relevantHabits.size > 0) {
        setSelectedHabits(Array.from(relevantHabits).slice(0, 4));
      }
      return next;
    });
  };

  const toggleObstacle = (id: string) => {
    if (preferences.hapticsEnabled) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    setSelectedObstacle(id);
  };

  const toggleSuggestedHabit = (idx: number) => {
    if (preferences.hapticsEnabled) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    setSelectedHabits(prev =>
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    );
  };

  const commitStarterData = async () => {
    // Add selected starter habits
    const habitsToAdd = selectedHabits.map(idx => SUGGESTED_HABITS[idx]);
    if (habitsToAdd.length > 0) {
      addMultipleHabits(habitsToAdd);
    }
    if (reminderActive) {
      await ensureLocalReminderPermission();
    }

    const wakeParsed = parseTimeString(wakeTime);
    const sleepParsed = parseTimeString(sleepTime);
    const wake24 = wakeParsed
      ? `${String(wakeParsed.hour).padStart(2, '0')}:${String(wakeParsed.minute).padStart(2, '0')}`
      : null;
    const sleep24 = sleepParsed
      ? `${String(sleepParsed.hour).padStart(2, '0')}:${String(sleepParsed.minute).padStart(2, '0')}`
      : null;

    updatePreferences({
      wakeTime: wake24,
      sleepTime: sleep24,
      notifications: {
        daily: reminderActive,
        routine: reminderActive,
      },
    });
  };

  const handleGuestContinue = async () => {
    if (preferences.hapticsEnabled) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    await commitStarterData();
    continueAsGuest();
    onComplete();
  };

  const handleAuthSubmit = async () => {
    setAuthError(null);
    const trimmedEmail = email.trim();
    const trimmedPass = password.trim();

    if (!trimmedEmail) {
      setAuthError('Please enter your email address.');
      return;
    }
    if (!trimmedPass || trimmedPass.length < 6) {
      setAuthError('Password must be at least 6 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (authMode === 'signup') {
        const res = await signUp(trimmedEmail, trimmedPass, fullName);
        if (res.error) {
          setAuthError(res.error);
          return;
        }
        // Only seed starter habits for genuinely brand-new accounts; never overwrite existing accounts!
        if (!res.isExistingUser) {
          await commitStarterData();
        }
      } else {
        const res = await signIn(trimmedEmail, trimmedPass);
        if (res.error) {
          setAuthError(res.error);
          return;
        }
        // Existing account signing in: DO NOT call commitStarterData()! All cloud habits, history, and streaks will load intact.
      }

      if (preferences.hapticsEnabled) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      }
      onComplete();
    } catch {
      setAuthError('An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSocialAuth = async (provider: SocialProvider) => {
    setAuthError(null);
    setIsSubmitting(true);
    try {
      const res = await signInWithProvider(provider);
      if (res.error) {
        setAuthError(res.error);
        return;
      }
      // Do not overwrite existing account data with starter habits on social sign-in
      onComplete();
    } catch {
      setAuthError(`${provider} sign-in failed. Please try email.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Top Stepper Bar */}
      <View style={styles.topNavigation}>
        {currentStep > 1 ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={styles.backBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            onPress={() => changeStep(currentStep - 1)}
          >
            <Ionicons name="arrow-back" size={20} color={colors.primaryText} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 32 }} />
        )}

        <View style={styles.stepProgressContainer}>
          <Text style={styles.stepCountText}>STEP {currentStep} OF {totalSteps}</Text>
          <View style={styles.stepperTrack}>
            <Animated.View
              style={[
                styles.stepperFill,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 100],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
        </View>

        {currentStep < totalSteps ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Skip onboarding"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            onPress={() => changeStep(totalSteps)}
            style={styles.skipBtn}
          >
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 32 }} />
        )}
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 40 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View
            style={[
              styles.stepWrapper,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            {/* ================= STEP 1: WELCOME & THE HOOK ================= */}
            {currentStep === 1 && (
              <View>
                <View style={styles.brandHero}>
                  <Animated.View
                    style={[
                      styles.emblemBox,
                      { transform: [{ scale: pulseAnim }] },
                    ]}
                  >
                    <Ionicons name="sunny" size={38} color={colors.accent} />
                  </Animated.View>
                  <Text style={styles.brandTitle}>DAYMARK</Text>
                  <Text style={styles.tagline}>BUILD HABITS THAT ACTUALLY STICK</Text>
                </View>

                <View style={styles.editorialCard}>
                  <Text style={styles.philosophyQuote}>
                    &ldquo;Small actions. Compounding progress. Visible results.&rdquo;
                  </Text>
                  <Text style={styles.philosophyBody}>
                    Most people fail at habits because they rely on fleeting motivation. Daymark turns invisible effort into tangible visual streaks you refuse to break.
                  </Text>
                </View>

                <View style={styles.featurePoints}>
                  <View style={styles.featureRow}>
                    <View style={styles.featureNum}>
                      <Ionicons name="flash" size={16} color={colors.accent} />
                    </View>
                    <View style={styles.featureTextCol}>
                      <Text style={styles.featureHeading}>Zero-Lag 1-Tap Check-ins</Text>
                      <Text style={styles.featureSub}>Instant 0ms tactile feedback. Simple and fast.</Text>
                    </View>
                  </View>

                  <View style={styles.featureRow}>
                    <View style={styles.featureNum}>
                      <Ionicons name="grid" size={16} color="#10B981" />
                    </View>
                    <View style={styles.featureTextCol}>
                      <Text style={styles.featureHeading}>365-Day Visual Heatmap</Text>
                      <Text style={styles.featureSub}>GitHub-style progress proof that keeps you accountable.</Text>
                    </View>
                  </View>

                  <View style={styles.featureRow}>
                    <View style={styles.featureNum}>
                      <Ionicons name="alarm" size={16} color="#3B82F6" />
                    </View>
                    <View style={styles.featureTextCol}>
                      <Text style={styles.featureHeading}>Circadian Rhythm Timing</Text>
                      <Text style={styles.featureSub}>Alarms tailored to your natural wake and sleep windows.</Text>
                    </View>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.primaryBtn}
                  activeOpacity={0.8}
                  onPress={() => changeStep(2)}
                >
                  <Text style={styles.primaryBtnText}>Start My Routine</Text>
                  <Ionicons name="arrow-forward" size={18} color="#000" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryLinkBtn}
                  onPress={() => {
                    setAuthMode('signin');
                    changeStep(6);
                  }}
                >
                  <Text style={styles.secondaryLinkText}>Already have an account? <Text style={{ color: colors.accent, fontWeight: '700' }}>Sign In</Text></Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ================= STEP 2: PRIMARY FOCUS AREA ================= */}
            {currentStep === 2 && (
              <View>
                <View style={styles.stepHeader}>
                  <Text style={styles.stepEyebrow}>STEP 02 • YOUR PILLARS</Text>
                  <Text style={styles.stepTitle}>What is your #1 focus right now?</Text>
                  <Text style={styles.stepSub}>
                    Select the areas of life you want to elevate. We’ll curate your rituals around these pillars.
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
                  onPress={() => changeStep(3)}
                >
                  <Text style={styles.primaryBtnText}>Continue ({selectedGoals.length} selected)</Text>
                  <Ionicons name="arrow-forward" size={18} color="#000" />
                </TouchableOpacity>
              </View>
            )}

            {/* ================= STEP 3: PSYCHOLOGICAL BUY-IN / THE PROBLEM ================= */}
            {currentStep === 3 && (
              <View>
                <View style={styles.stepHeader}>
                  <Text style={styles.stepEyebrow}>STEP 03 • THE OBSTACLE</Text>
                  <Text style={styles.stepTitle}>What has stopped you in the past?</Text>
                  <Text style={styles.stepSub}>
                    Tap your biggest roadblock. See how Daymark is engineered to overcome it.
                  </Text>
                </View>

                <View style={styles.obstacleList}>
                  {OBSTACLES.map(obs => {
                    const isSelected = selectedObstacle === obs.id;
                    return (
                      <TouchableOpacity
                        key={obs.id}
                        style={[
                          styles.obstacleCard,
                          isSelected && styles.obstacleCardSelected,
                        ]}
                        activeOpacity={0.7}
                        onPress={() => toggleObstacle(obs.id)}
                      >
                        <View style={styles.obstacleHeaderRow}>
                          <View style={[styles.obstacleIconBox, isSelected && { backgroundColor: `${colors.accent}25` }]}>
                            <Ionicons name={obs.icon as any} size={20} color={isSelected ? colors.accent : colors.secondaryText} />
                          </View>
                          <Text style={[styles.obstacleTitle, isSelected && { color: colors.primaryText, fontWeight: '700' }]}>
                            {obs.title}
                          </Text>
                        </View>

                        {isSelected && (
                          <View style={styles.solutionBox}>
                            <View style={styles.solutionBadge}>
                              <Ionicons name="checkmark-done" size={13} color="#000" />
                              <Text style={styles.solutionBadgeText}>HOW DAYMARK FIXES THIS</Text>
                            </View>
                            <Text style={styles.solutionText}>{obs.solution}</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TouchableOpacity
                  style={styles.primaryBtn}
                  activeOpacity={0.8}
                  onPress={() => changeStep(4)}
                >
                  <Text style={styles.primaryBtnText}>Choose Starter Habits</Text>
                  <Ionicons name="arrow-forward" size={18} color="#000" />
                </TouchableOpacity>
              </View>
            )}

            {/* ================= STEP 4: STARTER HABITS ================= */}
            {currentStep === 4 && (
              <View>
                <View style={styles.stepHeader}>
                  <Text style={styles.stepEyebrow}>STEP 04 • STARTER RITUALS</Text>
                  <Text style={styles.stepTitle}>Curated starter habits</Text>
                  <Text style={styles.stepSub}>
                    Pre-selected based on your focus. Every habit uses clean 1-tap completion:
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
                  onPress={() => changeStep(5)}
                >
                  <Text style={styles.primaryBtnText}>
                    Confirm {selectedHabits.length} Habits & Continue
                  </Text>
                  <Ionicons name="arrow-forward" size={18} color="#000" />
                </TouchableOpacity>
              </View>
            )}

            {/* ================= STEP 5: DAILY RHYTHM & NOTIFICATIONS ================= */}
            {currentStep === 5 && (
              <View>
                <View style={styles.stepHeader}>
                  <Text style={styles.stepEyebrow}>STEP 05 • CIRCADIAN RHYTHM</Text>
                  <Text style={styles.stepTitle}>Tune your daily rhythm</Text>
                  <Text style={styles.stepSub}>
                    Daymark aligns your habit prompts with your natural waking and wind-down hours.
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
                      <Text style={styles.notiTitle}>Daily Rhythm Reminders</Text>
                      <Text style={styles.notiSub}>Wake & sleep alerts at {wakeTime} and {sleepTime}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[styles.switchTrack, reminderActive && styles.switchTrackActive]}
                    onPress={async () => {
                      const next = !reminderActive;
                      setReminderActive(next);
                      if (next) {
                        await ensureLocalReminderPermission();
                      }
                    }}
                  >
                    <View style={[styles.switchThumb, reminderActive && styles.switchThumbActive]} />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.primaryBtn}
                  activeOpacity={0.8}
                  onPress={() => changeStep(6)}
                >
                  <Text style={styles.primaryBtnText}>Review My Blueprint</Text>
                  <Ionicons name="arrow-forward" size={18} color="#000" />
                </TouchableOpacity>
              </View>
            )}

            {/* ================= STEP 6: BLUEPRINT & CONVINCE TO SIGN UP ================= */}
            {currentStep === 6 && (
              <View>
                <View style={styles.stepHeader}>
                  <Text style={styles.stepEyebrow}>STEP 06 • LOCK IN YOUR STREAK</Text>
                  <Text style={styles.stepTitle}>Your Daymark Blueprint</Text>
                  <Text style={styles.stepSub}>
                    Everything is calibrated for sustainable momentum. Create your free account to protect your streak.
                  </Text>
                </View>

                {/* Blueprint Momentum Card */}
                <View style={styles.blueprintCard}>
                  <View style={styles.blueprintHeaderRow}>
                    <View>
                      <Text style={styles.blueprintEyebrow}>PROJECTED OUTCOME</Text>
                      <Text style={styles.blueprintTitle}>92% 30-Day Consistency</Text>
                    </View>
                    <View style={styles.blueprintBadge}>
                      <Ionicons name="flame" size={18} color={colors.accent} />
                      <Text style={styles.blueprintBadgeText}>READY</Text>
                    </View>
                  </View>

                  <View style={styles.blueprintDivider} />

                  <View style={styles.blueprintGrid}>
                    <View style={styles.blueprintStat}>
                      <Text style={styles.blueprintStatVal}>{selectedHabits.length}</Text>
                      <Text style={styles.blueprintStatLabel}>Starter Habits</Text>
                    </View>
                    <View style={styles.blueprintStat}>
                      <Text style={styles.blueprintStatVal}>~8 mins</Text>
                      <Text style={styles.blueprintStatLabel}>Daily Commitment</Text>
                    </View>
                    <View style={styles.blueprintStat}>
                      <Text style={styles.blueprintStatVal}>365d</Text>
                      <Text style={styles.blueprintStatLabel}>Visual Heatmap</Text>
                    </View>
                  </View>
                </View>

                {/* The Pitch Card */}
                <View style={styles.pitchCard}>
                  <Text style={styles.pitchTitle}>Why create a free account?</Text>
                  <View style={styles.pitchBenefitRow}>
                    <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                    <Text style={styles.pitchBenefitText}><Text style={{ fontWeight: '700', color: colors.primaryText }}>Streak Protection:</Text> Never lose your habit streak if you switch phones.</Text>
                  </View>
                  <View style={styles.pitchBenefitRow}>
                    <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                    <Text style={styles.pitchBenefitText}><Text style={{ fontWeight: '700', color: colors.primaryText }}>Multi-Device Cloud Sync:</Text> Keep habits updated across phone & tablet.</Text>
                  </View>
                  <View style={styles.pitchBenefitRow}>
                    <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                    <Text style={styles.pitchBenefitText}><Text style={{ fontWeight: '700', color: colors.primaryText }}>100% Free Forever:</Text> All features, analytics & widgets are unlocked.</Text>
                  </View>
                </View>

                {/* Form Mode Selector */}
                <View style={styles.authModeToggle}>
                  <TouchableOpacity
                    style={[styles.authModeBtn, authMode === 'signup' && styles.authModeBtnActive]}
                    onPress={() => { setAuthMode('signup'); setAuthError(null); }}
                  >
                    <Text style={[styles.authModeText, authMode === 'signup' && styles.authModeTextActive]}>Create Free Account</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.authModeBtn, authMode === 'signin' && styles.authModeBtnActive]}
                    onPress={() => { setAuthMode('signin'); setAuthError(null); }}
                  >
                    <Text style={[styles.authModeText, authMode === 'signin' && styles.authModeTextActive]}>Sign In</Text>
                  </TouchableOpacity>
                </View>

                {authError && (
                  <View style={styles.errorBox}>
                    <Ionicons name="alert-circle" size={16} color={colors.error} />
                    <Text style={styles.errorText}>{authError}</Text>
                  </View>
                )}

                {/* Quick Account Form */}
                <View style={styles.formContainer}>
                  {authMode === 'signup' && (
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>YOUR NAME</Text>
                      <View style={styles.inputWrap}>
                        <Ionicons name="person-outline" size={18} color={colors.mutedText} />
                        <TextInput
                          style={styles.textInput}
                          placeholder="Your name"
                          placeholderTextColor={colors.mutedText}
                          value={fullName}
                          onChangeText={setFullName}
                          autoCapitalize="words"
                        />
                      </View>
                    </View>
                  )}

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>EMAIL ADDRESS</Text>
                    <View style={styles.inputWrap}>
                      <Ionicons name="mail-outline" size={18} color={colors.mutedText} />
                      <TextInput
                        style={styles.textInput}
                        placeholder="name@example.com"
                        placeholderTextColor={colors.mutedText}
                        value={email}
                        onChangeText={setEmail}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        autoCorrect={false}
                      />
                    </View>
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>PASSWORD</Text>
                    <View style={styles.inputWrap}>
                      <Ionicons name="lock-closed-outline" size={18} color={colors.mutedText} />
                      <TextInput
                        style={styles.textInput}
                        placeholder="At least 6 characters"
                        placeholderTextColor={colors.mutedText}
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                      />
                      <TouchableOpacity onPress={() => setShowPassword(p => !p)} style={{ padding: 4 }}>
                        <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.mutedText} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.primaryBtn, { backgroundColor: colors.accent, marginTop: spacing.md }]}
                    onPress={handleAuthSubmit}
                    disabled={isSubmitting}
                    activeOpacity={0.8}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator size="small" color="#000" />
                    ) : (
                      <>
                        <Ionicons name={authMode === 'signup' ? 'shield-checkmark' : 'log-in'} size={18} color="#000" />
                        <Text style={styles.primaryBtnText}>
                          {authMode === 'signup' ? 'Lock In My Habits & Start' : 'Sign In & Load Habits'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>

                  {/* Social Login Buttons */}
                  <View style={styles.socialDividerRow}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerLabel}>OR CONTINUE WITH</Text>
                    <View style={styles.dividerLine} />
                  </View>

                  <View style={styles.socialBtnRow}>
                    <TouchableOpacity
                      style={styles.socialBtn}
                      onPress={() => handleSocialAuth('google')}
                      disabled={isSubmitting}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="logo-google" size={18} color={colors.primaryText} />
                      <Text style={styles.socialBtnText}>Google</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.socialBtn}
                      onPress={() => handleSocialAuth('apple')}
                      disabled={isSubmitting}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="logo-apple" size={18} color={colors.primaryText} />
                      <Text style={styles.socialBtnText}>Apple</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Frictionless Guest Exit */}
                  <TouchableOpacity
                    style={styles.guestLinkBtn}
                    onPress={handleGuestContinue}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.guestLinkText}>
                      Try offline first without account &rarr; <Text style={{ textDecorationLine: 'underline' }}>Continue as Guest</Text>
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
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
    width: 72,
    height: 72,
    borderRadius: radii.xl,
    backgroundColor: 'rgba(255, 122, 0, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 122, 0, 0.35)',
    marginBottom: spacing.md,
  },
  brandTitle: {
    fontSize: 34,
    fontWeight: '900',
    color: colors.primaryText,
    letterSpacing: 3,
  },
  tagline: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '800',
    letterSpacing: 2,
    marginTop: 4,
  },
  editorialCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
  },
  philosophyQuote: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primaryText,
    lineHeight: 26,
    marginBottom: spacing.sm,
  },
  philosophyBody: {
    fontSize: 14,
    color: colors.secondaryText,
    lineHeight: 22,
  },
  featurePoints: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.secondaryBackground,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  featureNum: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    backgroundColor: colors.elevatedCard,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  featureTextCol: {
    flex: 1,
  },
  featureHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primaryText,
  },
  featureSub: {
    fontSize: 12,
    color: colors.secondaryText,
    marginTop: 2,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    borderRadius: radii.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: spacing.md,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#000',
    letterSpacing: 0.5,
  },
  secondaryLinkBtn: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  secondaryLinkText: {
    fontSize: 13,
    color: colors.secondaryText,
  },
  stepHeader: {
    marginBottom: spacing.lg,
  },
  stepEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.accent,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.primaryText,
    lineHeight: 32,
    marginBottom: 8,
  },
  stepSub: {
    fontSize: 14,
    color: colors.secondaryText,
    lineHeight: 20,
  },
  goalsGrid: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  goalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  goalIconCircle: {
    width: 40,
    height: 40,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  goalTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.secondaryText,
  },
  goalCheckmark: {
    width: 24,
    height: 24,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  obstacleList: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  obstacleCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.md,
  },
  obstacleCardSelected: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(255, 122, 0, 0.05)',
  },
  obstacleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  obstacleIconBox: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    backgroundColor: colors.secondaryBackground,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  obstacleTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.secondaryText,
  },
  solutionBox: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  solutionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    backgroundColor: colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
    marginBottom: 6,
  },
  solutionBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#000',
    letterSpacing: 0.8,
  },
  solutionText: {
    fontSize: 13,
    color: colors.primaryText,
    lineHeight: 19,
  },
  suggestedList: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  suggestedHabitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  suggestedIcon: {
    width: 42,
    height: 42,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
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
    width: 26,
    height: 26,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cadenceCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  timeIconCircle: {
    width: 38,
    height: 38,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(255, 122, 0, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
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
    paddingVertical: 7,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timePillText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent,
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
  },
  notiLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  notiTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primaryText,
  },
  notiSub: {
    fontSize: 11,
    color: colors.secondaryText,
    marginTop: 2,
  },
  switchTrack: {
    width: 44,
    height: 26,
    borderRadius: radii.full,
    backgroundColor: colors.secondaryBackground,
    padding: 2,
    justifyContent: 'center',
  },
  switchTrackActive: {
    backgroundColor: colors.accent,
  },
  switchThumb: {
    width: 22,
    height: 22,
    borderRadius: radii.full,
    backgroundColor: colors.secondaryText,
  },
  switchThumbActive: {
    backgroundColor: '#000',
    alignSelf: 'flex-end',
  },
  blueprintCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.accent,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  blueprintHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  blueprintEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.accent,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  blueprintTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primaryText,
  },
  blueprintBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 122, 0, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  blueprintBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.accent,
  },
  blueprintDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  blueprintGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  blueprintStat: {
    alignItems: 'center',
  },
  blueprintStatVal: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.primaryText,
  },
  blueprintStatLabel: {
    fontSize: 11,
    color: colors.secondaryText,
    marginTop: 2,
  },
  pitchCard: {
    backgroundColor: colors.secondaryBackground,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    gap: 8,
  },
  pitchTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.accent,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  pitchBenefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pitchBenefitText: {
    fontSize: 12,
    color: colors.secondaryText,
    flex: 1,
    lineHeight: 18,
  },
  authModeToggle: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radii.full,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  authModeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radii.full,
    alignItems: 'center',
  },
  authModeBtnActive: {
    backgroundColor: colors.secondaryBackground,
  },
  authModeText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.secondaryText,
  },
  authModeTextActive: {
    fontWeight: '800',
    color: colors.primaryText,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    padding: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    marginBottom: spacing.sm,
  },
  errorText: {
    fontSize: 12,
    color: colors.error,
    flex: 1,
  },
  formContainer: {
    gap: spacing.sm,
  },
  inputGroup: {
    gap: 4,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.secondaryText,
    letterSpacing: 1,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 48,
    gap: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: colors.primaryText,
  },
  socialDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.sm,
    gap: spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.mutedText,
    letterSpacing: 1,
  },
  socialBtnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  socialBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
  },
  socialBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primaryText,
  },
  guestLinkBtn: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  guestLinkText: {
    fontSize: 12,
    color: colors.secondaryText,
  },
});
