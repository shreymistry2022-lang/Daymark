// src/screens/FocusTimerScreen.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useHabits, Habit } from '../services/HabitContext';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing } from '../theme/tokens';

type TimerMode = 'Countdown' | 'Stopwatch';

interface SessionEvent {
  id: string;
  timestamp: string;
  action: 'Start' | 'Pause' | 'Resume' | 'Stop' | 'Completed';
}

const DURATION_PRESETS = [15, 25, 30, 45, 60];
const RING_SIZE = 256;
const RING_HALF = RING_SIZE / 2;
const RING_STROKE = 10;

interface CircularProgressRingProps {
  progress: number; // 0..1
  accentColor: string;
  trackColor: string;
  children: React.ReactNode;
}

/** Pure-RN 0%–100% clockwise circular progress ring with rounded start/tip caps. */
const CircularProgressRing: React.FC<CircularProgressRingProps> = ({
  progress,
  accentColor,
  trackColor,
  children,
}) => {
  const clamped = Math.max(0, Math.min(1, progress));
  const rightProgress = Math.min(1, clamped * 2);
  const leftProgress = Math.max(0, Math.min(1, (clamped - 0.5) * 2));
  const rightDeg = -135 + rightProgress * 180;
  const leftDeg = -135 + leftProgress * 180;
  const tipDeg = clamped * 360;

  return (
    <View style={ringStyles.container}>
      {/* Background Track */}
      <View style={[ringStyles.trackCircle, { borderColor: trackColor }]} />

      {/* Right Half Sweep (0% -> 50%) */}
      <View style={ringStyles.rightClip}>
        <View
          style={[
            ringStyles.rightArc,
            {
              borderTopColor: accentColor,
              borderRightColor: accentColor,
              transform: [{ rotate: `${rightDeg}deg` }],
            },
          ]}
        />
      </View>

      {/* Left Half Sweep (50% -> 100%) */}
      <View style={ringStyles.leftClip}>
        <View
          style={[
            ringStyles.leftArc,
            {
              borderBottomColor: accentColor,
              borderLeftColor: accentColor,
              transform: [{ rotate: `${leftDeg}deg` }],
            },
          ]}
        />
      </View>

      {/* Rounded Start & Moving End Caps */}
      {clamped > 0.004 && (
        <>
          <View style={[ringStyles.startCap, { backgroundColor: accentColor }]} />
          <View pointerEvents="none" style={[ringStyles.tipOrbit, { transform: [{ rotate: `${tipDeg}deg` }] }]}>
            <View style={[ringStyles.tipCap, { backgroundColor: accentColor }]} />
          </View>
        </>
      )}

      <View style={ringStyles.centerContent}>{children}</View>
    </View>
  );
};

const ringStyles = StyleSheet.create({
  container: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  trackCircle: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_HALF,
    borderWidth: RING_STROKE,
  },
  rightClip: {
    position: 'absolute',
    left: RING_HALF,
    top: 0,
    width: RING_HALF,
    height: RING_SIZE,
    overflow: 'hidden',
  },
  rightArc: {
    position: 'absolute',
    left: -RING_HALF,
    top: 0,
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_HALF,
    borderWidth: RING_STROKE,
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
  },
  leftClip: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: RING_HALF,
    height: RING_SIZE,
    overflow: 'hidden',
  },
  leftArc: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_HALF,
    borderWidth: RING_STROKE,
    borderTopColor: 'transparent',
    borderRightColor: 'transparent',
  },
  startCap: {
    position: 'absolute',
    top: 0,
    left: RING_HALF - RING_STROKE / 2,
    width: RING_STROKE,
    height: RING_STROKE,
    borderRadius: RING_STROKE / 2,
  },
  tipOrbit: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
  },
  tipCap: {
    width: RING_STROKE,
    height: RING_STROKE,
    borderRadius: RING_STROKE / 2,
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
});

export const FocusTimerScreen = () => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { habits, recordHabitLog, todayDateStr, triggerCelebration } = useHabits();

  const [timerMode, setTimerMode] = useState<TimerMode>('Countdown');
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(habits[0]?.id ?? null);
  const [habitPickerVisible, setHabitPickerVisible] = useState(false);
  const [targetMinutes, setTargetMinutes] = useState<number>(30);

  const [countdownRemainingMs, setCountdownRemainingMs] = useState<number>(30 * 60 * 1000);
  const [stopwatchElapsedMs, setStopwatchElapsedMs] = useState<number>(0);

  const [isRunning, setIsRunning] = useState<boolean>(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTickRef = useRef<number>(0);

  const [sessionEvents, setSessionEvents] = useState<SessionEvent[]>([]);

  const selectedHabit: Habit | null = useMemo(
    () => habits.find(h => h.id === selectedHabitId) ?? habits[0] ?? null,
    [habits, selectedHabitId],
  );

  const activeAccent = selectedHabit?.color ?? colors.accent;

  const getFormattedTimestamp = () => {
    const now = new Date();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[now.getMonth()];
    const day = now.getDate();
    const year = now.getFullYear();

    let hours = now.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours || 12;
    const minutes = String(now.getMinutes()).padStart(2, '0');

    return `${month} ${day}, ${year} · ${hours}:${minutes} ${ampm}`;
  };

  const addEvent = (action: SessionEvent['action']) => {
    const newEvent: SessionEvent = {
      id: `${Date.now()}_${Math.random()}`,
      timestamp: getFormattedTimestamp(),
      action,
    };
    setSessionEvents(prev => [newEvent, ...prev]);
  };

  const handleCountdownFinished = () => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    triggerCelebration();
    addEvent('Completed');

    if (selectedHabit) {
      recordHabitLog(selectedHabit.id, {
        date: todayDateStr,
        value: targetMinutes,
        outcome: 'completed',
        note: `Focus session (${targetMinutes}m)`,
      });
    }

    Alert.alert(
      'Session Complete! 🎉',
      `Great job! You completed a ${targetMinutes}-minute focus session for "${selectedHabit?.name || 'Focus'}".`,
      [{ text: 'Awesome' }],
    );
  };

  const countdownFinishedRef = useRef(handleCountdownFinished);
  useEffect(() => {
    countdownFinishedRef.current = handleCountdownFinished;
  });

  const onSelectHabit = (habitId: string) => {
    setSelectedHabitId(habitId);
    const h = habits.find(item => item.id === habitId);
    if (h?.targetValue && h.targetValue > 0 && h.targetValue <= 180) {
      setTargetMinutes(h.targetValue);
      if (!isRunning && timerMode === 'Countdown') {
        setCountdownRemainingMs(h.targetValue * 60 * 1000);
      }
    }
  };

  useEffect(() => {
    if (isRunning) {
      lastTickRef.current = Date.now();
      intervalRef.current = setInterval(() => {
        const now = Date.now();
        const delta = now - lastTickRef.current;
        lastTickRef.current = now;

        if (timerMode === 'Countdown') {
          setCountdownRemainingMs(prev => {
            const next = prev - delta;
            if (next <= 0) {
              if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
              }
              setIsRunning(false);
              countdownFinishedRef.current();
              return 0;
            }
            return next;
          });
        } else {
          setStopwatchElapsedMs(prev => prev + delta);
        }
      }, 35);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning, timerMode]);

  const handleStartResume = () => {
    if (!isRunning) {
      if (timerMode === 'Countdown' && countdownRemainingMs === 0) {
        setCountdownRemainingMs(targetMinutes * 60 * 1000);
      }
      lastTickRef.current = Date.now();
      setIsRunning(true);
      if (sessionEvents.length === 0 || sessionEvents[0].action === 'Stop' || sessionEvents[0].action === 'Completed') {
        addEvent('Start');
      } else {
        addEvent('Resume');
      }
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }
    }
  };

  const handlePause = () => {
    if (isRunning) {
      setIsRunning(false);
      addEvent('Pause');
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
    }
  };

  const handleStop = () => {
    if (isRunning || countdownRemainingMs !== targetMinutes * 60 * 1000 || stopwatchElapsedMs !== 0) {
      setIsRunning(false);
      addEvent('Stop');
      if (timerMode === 'Countdown') {
        setCountdownRemainingMs(targetMinutes * 60 * 1000);
      } else {
        setStopwatchElapsedMs(0);
      }
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      }
    }
  };

  const handleSelectPresetMinutes = (mins: number) => {
    if (!isRunning) {
      setTargetMinutes(mins);
      setCountdownRemainingMs(mins * 60 * 1000);
    }
  };

  const activeMs = timerMode === 'Countdown' ? countdownRemainingMs : stopwatchElapsedMs;
  const totalSec = Math.floor(activeMs / 1000);
  const displayMins = Math.floor(totalSec / 60);
  const displaySecs = totalSec % 60;
  const displayCentis = Math.floor((activeMs % 1000) / 10);

  const minsSecsStr = `${String(displayMins).padStart(2, '0')}:${String(displaySecs).padStart(2, '0')}`;
  const microStr = String(displayCentis).padStart(2, '0');

  const progressRatio = useMemo(() => {
    if (timerMode === 'Countdown') {
      const totalMs = targetMinutes * 60 * 1000;
      return totalMs > 0 ? Math.max(0, Math.min(1, (totalMs - countdownRemainingMs) / totalMs)) : 0;
    }
    const cycleMs = 60 * 1000;
    return (stopwatchElapsedMs % cycleMs) / cycleMs;
  }, [timerMode, targetMinutes, countdownRemainingMs, stopwatchElapsedMs]);

  const progressPercent = Math.round(progressRatio * 100);
  const isPaused = !isRunning && sessionEvents.length > 0 && sessionEvents[0].action === 'Pause';

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 110 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Minimalist Top Header (Matches Today & Habits) */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.primaryText }]}>Focus Timer</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Focus timer help"
            onPress={() =>
              Alert.alert(
                'Focus Habit Timer',
                'Select a habit to link your focus session. When a countdown finishes, progress is automatically recorded for today!',
              )
            }
            style={[styles.circleIconBtn, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}
          >
            <Ionicons name="help-outline" size={20} color={colors.primaryText} />
          </TouchableOpacity>
        </View>

        {/* Pill Segmented Mode Switcher */}
        <View style={[styles.modeSwitcher, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {(['Countdown', 'Stopwatch'] as TimerMode[]).map(modeOpt => {
            const active = timerMode === modeOpt;
            return (
              <TouchableOpacity
                key={modeOpt}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.modePillBtn, active && { backgroundColor: activeAccent }]}
                onPress={() => {
                  if (timerMode !== modeOpt) {
                    setIsRunning(false);
                    setTimerMode(modeOpt);
                  }
                }}
              >
                <Text style={[styles.modePillText, { color: active ? '#FFFFFF' : colors.secondaryText }]}>
                  {modeOpt}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Linked Habit Selector Card */}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Choose linked habit"
          activeOpacity={0.8}
          onPress={() => setHabitPickerVisible(true)}
          style={[styles.habitCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <View style={[styles.habitSquircle, { backgroundColor: `${activeAccent}20` }]}>
            <Ionicons name={selectedHabit?.icon ?? 'sparkles-outline'} size={20} color={activeAccent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.habitCardLabel, { color: colors.mutedText }]}>LINKED HABIT</Text>
            <Text style={[styles.habitCardName, { color: colors.primaryText }]} numberOfLines={1}>
              {selectedHabit ? selectedHabit.name : 'Choose a habit'}
            </Text>
          </View>
          <View style={[styles.changePill, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}>
            <Text style={[styles.changePillText, { color: colors.secondaryText }]}>Change</Text>
            <Ionicons name="chevron-down" size={14} color={colors.secondaryText} />
          </View>
        </TouchableOpacity>

        {/* Centerpiece Circular Progress Ring Card */}
        <View style={[styles.dialCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <CircularProgressRing
            progress={progressRatio}
            accentColor={activeAccent}
            trackColor={colors.secondaryBackground}
          >
            <View style={[styles.pctPill, { backgroundColor: `${activeAccent}1C` }]}>
              <Text style={[styles.pctText, { color: activeAccent }]}>
                {timerMode === 'Countdown' ? `${progressPercent}%` : 'LIVE'}
              </Text>
            </View>

            <View style={styles.digitsRow}>
              <Text style={[styles.timerDigits, { color: colors.primaryText }]}>{minsSecsStr}</Text>
              <Text style={[styles.timerMicroDigits, { color: activeAccent }]}>.{microStr}</Text>
            </View>

            <View style={styles.targetMetaRow}>
              <Ionicons
                name={timerMode === 'Countdown' ? 'stopwatch-outline' : 'infinite-outline'}
                size={15}
                color={colors.secondaryText}
              />
              <Text style={[styles.targetMetaText, { color: colors.secondaryText }]}>
                {timerMode === 'Countdown' ? `${targetMinutes}m goal` : 'Stopwatch'}
              </Text>
            </View>
          </CircularProgressRing>

          {/* Preset Duration Pills inside Dial Card */}
          {timerMode === 'Countdown' && !isRunning && (
            <View style={styles.presetsRow}>
              {DURATION_PRESETS.map(mins => {
                const selected = targetMinutes === mins;
                return (
                  <TouchableOpacity
                    key={mins}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => handleSelectPresetMinutes(mins)}
                    style={[
                      styles.presetPill,
                      {
                        backgroundColor: selected ? activeAccent : colors.secondaryBackground,
                        borderColor: selected ? activeAccent : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.presetPillText, { color: selected ? '#FFFFFF' : colors.secondaryText }]}>
                      {mins}m
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Full-Pill Action Controls */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Stop timer"
            style={[styles.stopPillBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            activeOpacity={0.75}
            onPress={handleStop}
          >
            <View style={[styles.stopSquare, { backgroundColor: colors.secondaryText }]} />
            <Text style={[styles.stopPillText, { color: colors.primaryText }]}>Stop</Text>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={isRunning ? 'Pause timer' : isPaused ? 'Resume timer' : 'Start timer'}
            style={[styles.primaryPillBtn, { backgroundColor: activeAccent }]}
            activeOpacity={0.85}
            onPress={isRunning ? handlePause : handleStartResume}
          >
            <Ionicons name={isRunning ? 'pause' : 'play'} size={18} color="#FFFFFF" />
            <Text style={styles.primaryPillText}>
              {isRunning ? 'Pause' : isPaused ? 'Resume' : 'Start'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Session Timeline Card */}
        <View style={[styles.timelineCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.timelineHeader}>
            <Text style={[styles.timelineTitle, { color: colors.mutedText }]}>SESSION TIMELINE</Text>
            {sessionEvents.length > 0 && (
              <TouchableOpacity onPress={() => setSessionEvents([])}>
                <Text style={[styles.clearText, { color: activeAccent }]}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>

          {sessionEvents.length === 0 ? (
            <Text style={[styles.emptyTimelineText, { color: colors.mutedText }]}>
              Your start, pause, and completion events will appear here.
            </Text>
          ) : (
            sessionEvents.slice(0, 10).map((evt, idx) => (
              <View
                key={evt.id}
                style={[
                  styles.eventRow,
                  idx < Math.min(sessionEvents.length, 10) - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.eventTime, { color: colors.secondaryText }]}>{evt.timestamp}</Text>
                <View style={styles.eventBadge}>
                  <Ionicons
                    name={
                      evt.action === 'Start' || evt.action === 'Resume'
                        ? 'play'
                        : evt.action === 'Pause'
                          ? 'pause'
                          : evt.action === 'Completed'
                            ? 'checkmark-circle'
                            : 'square'
                    }
                    size={13}
                    color={evt.action === 'Completed' ? '#10B981' : activeAccent}
                  />
                  <Text style={[styles.eventLabel, { color: colors.primaryText }]}>{evt.action}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Minimalist Habit Picker Modal Sheet */}
      <Modal
        visible={habitPickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setHabitPickerVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={styles.modalDismiss}
            activeOpacity={1}
            onPress={() => setHabitPickerVisible(false)}
          />
          <View
            style={[
              styles.modalSheet,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                paddingBottom: insets.bottom + spacing.md,
              },
            ]}
          >
            <View style={styles.sheetHandleRow}>
              <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            </View>
            <View style={styles.sheetHeader}>
              <TouchableOpacity
                accessibilityLabel="Close habit selector"
                onPress={() => setHabitPickerVisible(false)}
                style={[styles.circleCloseBtn, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}
              >
                <Ionicons name="close" size={18} color={colors.primaryText} />
              </TouchableOpacity>
              <Text style={[styles.sheetTitle, { color: colors.primaryText }]}>Select Habit</Text>
              <View style={styles.sheetSpacer} />
            </View>

            <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
              <View style={[styles.groupedList, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}>
                {habits.length === 0 ? (
                  <Text style={[styles.emptyPickerText, { color: colors.mutedText }]}>
                    Create a habit first to link focus sessions.
                  </Text>
                ) : (
                  habits.map((h, idx) => {
                    const isChosen = h.id === selectedHabit?.id;
                    const isLast = idx === habits.length - 1;
                    return (
                      <TouchableOpacity
                        key={h.id}
                        style={[
                          styles.pickerRow,
                          !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                        ]}
                        onPress={() => {
                          onSelectHabit(h.id);
                          setHabitPickerVisible(false);
                        }}
                      >
                        <View style={[styles.pickerIcon, { backgroundColor: `${h.color}20` }]}>
                          <Ionicons name={h.icon} size={18} color={h.color} />
                        </View>
                        <Text style={[styles.pickerName, { color: colors.primaryText }]} numberOfLines={1}>
                          {h.name}
                        </Text>
                        {isChosen ? (
                          <View style={[styles.checkCircle, { backgroundColor: h.color }]}>
                            <Ionicons name="checkmark" size={14} color="#FFF" />
                          </View>
                        ) : (
                          <View style={[styles.uncheckCircle, { borderColor: colors.border }]} />
                        )}
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  circleIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeSwitcher: {
    flexDirection: 'row',
    borderRadius: radii.full,
    borderWidth: 1,
    padding: 4,
  },
  modePillBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: radii.full,
  },
  modePillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  habitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: 14,
  },
  habitSquircle: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  habitCardLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  habitCardName: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 2,
  },
  changePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: radii.full,
    borderWidth: 1,
  },
  changePillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  dialCard: {
    borderRadius: radii.xl,
    borderWidth: 1,
    paddingVertical: spacing.lg + 4,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    gap: 20,
  },
  pctPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radii.full,
    marginBottom: 8,
  },
  pctText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  digitsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  timerDigits: {
    fontSize: 48,
    fontWeight: '700',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  timerMicroDigits: {
    fontSize: 20,
    fontWeight: '700',
    marginLeft: 2,
    fontVariant: ['tabular-nums'],
  },
  targetMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
  },
  targetMetaText: {
    fontSize: 13,
    fontWeight: '600',
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  presetPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.full,
    borderWidth: 1,
  },
  presetPillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  stopPillBtn: {
    flex: 1,
    height: 52,
    borderRadius: radii.full,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  stopSquare: {
    width: 11,
    height: 11,
    borderRadius: 2.5,
  },
  stopPillText: {
    fontSize: 15,
    fontWeight: '700',
  },
  primaryPillBtn: {
    flex: 1.5,
    height: 52,
    borderRadius: radii.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryPillText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  timelineCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  timelineTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  clearText: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyTimelineText: {
    fontSize: 13,
    lineHeight: 19,
    paddingVertical: 6,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  eventTime: {
    fontSize: 12,
    fontWeight: '500',
  },
  eventBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  eventLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.68)',
    justifyContent: 'flex-end',
  },
  modalDismiss: { flex: 1 },
  modalSheet: {
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  sheetHandleRow: { alignItems: 'center', paddingBottom: spacing.sm },
  sheetHandle: { width: 36, height: 4, borderRadius: 2 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  circleCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: { fontSize: 18, fontWeight: '700' },
  sheetSpacer: { width: 36, height: 36 },
  groupedList: {
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  emptyPickerText: {
    fontSize: 13,
    textAlign: 'center',
    padding: spacing.lg,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.md,
    minHeight: 56,
  },
  pickerIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uncheckCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
  },
});
