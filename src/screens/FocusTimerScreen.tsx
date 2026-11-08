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

type TimerMode = 'Stopwatch' | 'Countdown';

interface SessionEvent {
  id: string;
  timestamp: string;
  action: 'Start' | 'Pause' | 'Resume' | 'Stop' | 'Completed';
}

const DURATION_PRESETS = [15, 25, 30, 45, 60];

export const FocusTimerScreen = () => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { habits, recordHabitLog, todayDateStr, triggerCelebration } = useHabits();

  // Mode: Stopwatch vs Countdown
  const [timerMode, setTimerMode] = useState<TimerMode>('Countdown');

  // Selected Habit
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(habits[0]?.id ?? null);
  const [habitPickerVisible, setHabitPickerVisible] = useState(false);

  // Target minutes for countdown
  const [targetMinutes, setTargetMinutes] = useState<number>(30);

  // High-precision Milliseconds state
  const [countdownRemainingMs, setCountdownRemainingMs] = useState<number>(30 * 60 * 1000);
  const [stopwatchElapsedMs, setStopwatchElapsedMs] = useState<number>(0);

  // Timer running state & timing reference
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTickRef = useRef<number>(0);

  // Session Event Log
  const [sessionEvents, setSessionEvents] = useState<SessionEvent[]>([]);

  // Selected habit object
  const selectedHabit: Habit | null = useMemo(() => {
    return habits.find(h => h.id === selectedHabitId) ?? habits[0] ?? null;
  }, [habits, selectedHabitId]);

  const getFormattedTimestamp = () => {
    const now = new Date();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[now.getMonth()];
    const day = now.getDate();
    const year = now.getFullYear();

    let hours = now.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const minutes = String(now.getMinutes()).padStart(2, '0');

    return `${month} ${day} ${year} ${hours}:${minutes} ${ampm}`;
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
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        // ignore
      }
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
      [{ text: 'Awesome' }]
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

  // High-frequency tick loop (~30fps for smooth millisecond/microsecond display)
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
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
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
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    }
  };

  const handlePause = () => {
    if (isRunning) {
      setIsRunning(false);
      addEvent('Pause');
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }
    }
  };

  const handleSelectPresetMinutes = (mins: number) => {
    if (!isRunning) {
      setTargetMinutes(mins);
      setCountdownRemainingMs(mins * 60 * 1000);
    }
  };

  // Format time with minutes, seconds, and centiseconds (fractional seconds)
  const activeMs = timerMode === 'Countdown' ? countdownRemainingMs : stopwatchElapsedMs;
  const totalSec = Math.floor(activeMs / 1000);
  const displayMins = Math.floor(totalSec / 60);
  const displaySecs = totalSec % 60;
  // Hundredths of a second (00 - 99)
  const displayCentis = Math.floor((activeMs % 1000) / 10);

  const minsSecsStr = `${String(displayMins).padStart(2, '0')}:${String(displaySecs).padStart(2, '0')}`;
  const microStr = String(displayCentis).padStart(2, '0');

  // Progress fraction for dial
  const progressRatio = useMemo(() => {
    if (timerMode === 'Countdown') {
      const totalMs = targetMinutes * 60 * 1000;
      return totalMs > 0 ? (totalMs - countdownRemainingMs) / totalMs : 0;
    } else {
      const cycleMs = 60 * 1000; // 1 full rotation per minute
      return (stopwatchElapsedMs % cycleMs) / cycleMs;
    }
  }, [timerMode, targetMinutes, countdownRemainingMs, stopwatchElapsedMs]);

  // Accent button contrast color
  const buttonTextColor = isDark ? '#000000' : '#FFFFFF';

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Top Header Banner matching Daymark Palette */}
      <View
        style={[
          styles.headerBanner,
          {
            backgroundColor: colors.secondaryBackground,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View style={styles.headerTitleRow}>
          <Ionicons name="timer-outline" size={20} color={colors.accent} style={{ marginRight: 6 }} />
          <Text style={[styles.headerTitle, { color: colors.primaryText }]}>Focus Timer</Text>
        </View>

        {/* Stopwatch | Countdown Segmented Tabs matching App Design */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={styles.tabButton}
            onPress={() => {
              if (timerMode !== 'Stopwatch') {
                setIsRunning(false);
                setTimerMode('Stopwatch');
              }
            }}
          >
            <Text
              style={[
                styles.tabText,
                timerMode === 'Stopwatch'
                  ? [styles.activeTabText, { color: colors.accent }]
                  : [styles.inactiveTabText, { color: colors.secondaryText }],
              ]}
            >
              Stopwatch
            </Text>
            {timerMode === 'Stopwatch' && (
              <View style={[styles.tabIndicator, { backgroundColor: colors.accent }]} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tabButton}
            onPress={() => {
              if (timerMode !== 'Countdown') {
                setIsRunning(false);
                setTimerMode('Countdown');
              }
            }}
          >
            <Text
              style={[
                styles.tabText,
                timerMode === 'Countdown'
                  ? [styles.activeTabText, { color: colors.accent }]
                  : [styles.inactiveTabText, { color: colors.secondaryText }],
              ]}
            >
              Countdown
            </Text>
            {timerMode === 'Countdown' && (
              <View style={[styles.tabIndicator, { backgroundColor: colors.accent }]} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 90 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Focus ? & Habit Selector Dropdown matching App Theme */}
        <View style={styles.focusSelectRow}>
          <TouchableOpacity
            style={styles.focusHelp}
            onPress={() =>
              Alert.alert(
                'Focus Habit Timer',
                'Select a habit to link your focus session. When the timer finishes, progress is automatically recorded for today!'
              )
            }
          >
            <Text style={[styles.focusLabel, { color: colors.primaryText }]}>Focus</Text>
            <View
              style={[
                styles.helpCircle,
                {
                  backgroundColor: colors.secondaryBackground,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.helpText, { color: colors.secondaryText }]}>?</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.habitDropdownPill,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
            onPress={() => setHabitPickerVisible(true)}
            activeOpacity={0.8}
          >
            <View style={[styles.habitDot, { backgroundColor: colors.accent }]} />
            <Text style={[styles.habitDropdownText, { color: colors.primaryText }]} numberOfLines={1}>
              {selectedHabit ? selectedHabit.name : 'Choose Habit'}
            </Text>
            <Ionicons name="chevron-down" size={14} color={colors.accent} style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        </View>

        {/* Circular Timer Ring Dial with Microseconds */}
        <View style={styles.dialContainer}>
          <View
            style={[
              styles.outerDialRing,
              {
                borderColor: colors.border,
                backgroundColor: colors.card,
              },
            ]}
          >
            {/* Active Progress Ring Arc in Accent Color */}
            <View
              style={[
                styles.activeProgressArc,
                {
                  borderColor: colors.accent,
                  transform: [{ rotate: `${progressRatio * 360}deg` }],
                },
              ]}
            />

            <View style={styles.dialInner}>
              {/* Digital Time with Microseconds/Centiseconds */}
              <View style={styles.timeWithMicroRow}>
                <Text style={[styles.timerDigits, { color: colors.primaryText }]}>
                  {minsSecsStr}
                </Text>
                <Text style={[styles.timerMicroDigits, { color: colors.accent }]}>
                  .{microStr}
                </Text>
              </View>

              {timerMode === 'Countdown' ? (
                <View style={styles.durationSubRow}>
                  <Ionicons name="stopwatch-outline" size={15} color={colors.accent} style={{ marginRight: 4 }} />
                  <Text style={[styles.durationSubText, { color: colors.secondaryText }]}>
                    {targetMinutes}m target
                  </Text>
                </View>
              ) : (
                <View style={styles.durationSubRow}>
                  <Ionicons name="infinite-outline" size={16} color={colors.accent} style={{ marginRight: 4 }} />
                  <Text style={[styles.durationSubText, { color: colors.secondaryText }]}>
                    Stopwatch
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Preset Minutes Chips (Countdown mode only) */}
        {timerMode === 'Countdown' && !isRunning && (
          <View style={styles.presetsRow}>
            {DURATION_PRESETS.map(mins => {
              const isSelected = targetMinutes === mins;
              return (
                <TouchableOpacity
                  key={mins}
                  style={[
                    styles.presetChip,
                    isSelected
                      ? { backgroundColor: colors.accent, borderColor: colors.accent }
                      : { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                  onPress={() => handleSelectPresetMinutes(mins)}
                >
                  <Text
                    style={[
                      styles.presetChipText,
                      { color: isSelected ? buttonTextColor : colors.primaryText },
                    ]}
                  >
                    {mins}m
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Action Buttons: Stop | Pause/Start in Theme Colors */}
        <View style={styles.actionButtonsRow}>
          {/* Stop Button */}
          <TouchableOpacity
            style={[
              styles.stopButton,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
            activeOpacity={0.7}
            onPress={handleStop}
          >
            <View style={[styles.stopIconSquare, { backgroundColor: colors.secondaryText }]} />
            <Text style={[styles.stopButtonText, { color: colors.primaryText }]}>Stop</Text>
          </TouchableOpacity>

          {/* Pause / Start / Resume Button with Accent Theme */}
          <TouchableOpacity
            style={[
              styles.playPauseButton,
              {
                backgroundColor: colors.accent,
              },
            ]}
            activeOpacity={0.8}
            onPress={isRunning ? handlePause : handleStartResume}
          >
            <Ionicons
              name={isRunning ? 'pause' : 'play'}
              size={18}
              color={buttonTextColor}
              style={{ marginRight: 8 }}
            />
            <Text style={[styles.playPauseButtonText, { color: buttonTextColor }]}>
              {isRunning
                ? 'Pause'
                : sessionEvents.length > 0 && sessionEvents[0].action === 'Pause'
                ? 'Resume'
                : 'Start'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Session Event Log matching Daymark styling */}
        <View
          style={[
            styles.historySection,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.historyHeaderRow}>
            <Text style={[styles.historyHeaderTitle, { color: colors.secondaryText }]}>
              SESSION TIMELINE
            </Text>
            {sessionEvents.length > 0 && (
              <TouchableOpacity onPress={() => setSessionEvents([])}>
                <Text style={{ fontSize: 12, color: colors.mutedText, fontWeight: '600' }}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>

          {sessionEvents.length === 0 ? (
            <View style={styles.emptyEventsBox}>
              <Text style={[styles.emptyEventsText, { color: colors.mutedText }]}>
                Timer session timeline events will appear here.
              </Text>
            </View>
          ) : (
            sessionEvents.slice(0, 10).map(evt => (
              <View
                key={evt.id}
                style={[
                  styles.eventRow,
                  { borderBottomColor: colors.border },
                ]}
              >
                <Text style={[styles.eventTimestamp, { color: colors.secondaryText }]}>
                  {evt.timestamp}
                </Text>
                <View style={styles.eventActionWrap}>
                  <Text style={[styles.eventActionText, { color: colors.primaryText }]}>
                    {evt.action}
                  </Text>
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
                    color={
                      evt.action === 'Completed'
                        ? '#10B981'
                        : colors.accent
                    }
                    style={{ marginLeft: 5 }}
                  />
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Habit Selector Modal Sheet */}
      <Modal
        visible={habitPickerVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setHabitPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setHabitPickerVisible(false)}
          />
          <View
            style={[
              styles.modalSheet,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                paddingBottom: insets.bottom + 16,
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.primaryText }]}>
                Select Habit to Focus
              </Text>
              <TouchableOpacity
                onPress={() => setHabitPickerVisible(false)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={20} color={colors.primaryText} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {habits.map(h => {
                const isChosen = h.id === selectedHabit?.id;
                return (
                  <TouchableOpacity
                    key={h.id}
                    style={[
                      styles.habitOptionItem,
                      {
                        backgroundColor: isChosen ? `${colors.accent}18` : 'transparent',
                        borderColor: isChosen ? colors.accent : colors.border,
                      },
                    ]}
                    onPress={() => {
                      onSelectHabit(h.id);
                      setHabitPickerVisible(false);
                    }}
                  >
                    <View style={styles.habitOptionLeft}>
                      <View style={[styles.habitOptionDot, { backgroundColor: colors.accent }]} />
                      <Text style={[styles.habitOptionText, { color: colors.primaryText }]}>
                        {h.name}
                      </Text>
                    </View>
                    {isChosen && (
                      <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  headerBanner: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 0,
    borderBottomWidth: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  tabContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 40,
    marginTop: 4,
  },
  tabButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    position: 'relative',
    alignItems: 'center',
  },
  tabText: {
    fontSize: 14,
  },
  activeTabText: {
    fontWeight: '800',
  },
  inactiveTabText: {
    fontWeight: '500',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  focusSelectRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  focusHelp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  focusLabel: {
    fontSize: 16,
    fontWeight: '800',
  },
  helpCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  helpText: {
    fontSize: 12,
    fontWeight: '700',
  },
  habitDropdownPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    maxWidth: 200,
  },
  habitDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  habitDropdownText: {
    fontSize: 14,
    fontWeight: '600',
  },
  dialContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  outerDialRing: {
    width: 236,
    height: 236,
    borderRadius: 118,
    borderWidth: 5,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  activeProgressArc: {
    position: 'absolute',
    width: 236,
    height: 236,
    borderRadius: 118,
    borderWidth: 5,
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  dialInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeWithMicroRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  timerDigits: {
    fontSize: 42,
    fontWeight: '600',
    letterSpacing: 0.5,
    fontVariant: ['tabular-nums'],
  },
  timerMicroDigits: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginLeft: 2,
    fontVariant: ['tabular-nums'],
  },
  durationSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  durationSubText: {
    fontSize: 14,
    fontWeight: '600',
  },
  presetsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
    marginTop: 4,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
  },
  presetChipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 16,
    marginBottom: 24,
  },
  stopButton: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  stopIconSquare: {
    width: 11,
    height: 11,
    borderRadius: 2,
  },
  stopButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  playPauseButton: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playPauseButtonText: {
    fontSize: 15,
    fontWeight: '800',
  },
  historySection: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  historyHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  historyHeaderTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  emptyEventsBox: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  emptyEventsText: {
    fontSize: 13,
  },
  eventRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  eventTimestamp: {
    fontSize: 12,
    fontWeight: '500',
  },
  eventActionWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  eventActionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalBackdrop: {
    flex: 1,
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  modalCloseBtn: {
    padding: 4,
  },
  habitOptionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  habitOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  habitOptionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  habitOptionText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
