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

  // Mode: Stopwatch vs Countdown (matching screenshot)
  const [timerMode, setTimerMode] = useState<TimerMode>('Countdown');

  // Selected Habit
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(habits[0]?.id ?? null);
  const [habitPickerVisible, setHabitPickerVisible] = useState(false);

  // Countdown timer settings
  const [targetMinutes, setTargetMinutes] = useState<number>(30);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(30 * 60);

  // Stopwatch timer settings
  const [stopwatchSeconds, setStopwatchSeconds] = useState<number>(0);

  // Timer running state
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Session Event Log (matching screenshot timeline)
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
        setSecondsRemaining(h.targetValue * 60);
      }
    }
  };

  // Timer execution tick
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        if (timerMode === 'Countdown') {
          setSecondsRemaining(prev => {
            if (prev <= 1) {
              clearInterval(intervalRef.current as any);
              setIsRunning(false);
              countdownFinishedRef.current();
              return 0;
            }
            return prev - 1;
          });
        } else {
          setStopwatchSeconds(prev => prev + 1);
        }
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, timerMode]);

  const handleStartResume = () => {
    if (!isRunning) {
      if (timerMode === 'Countdown' && secondsRemaining === 0) {
        setSecondsRemaining(targetMinutes * 60);
      }
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
    if (isRunning || secondsRemaining !== targetMinutes * 60 || stopwatchSeconds !== 0) {
      setIsRunning(false);
      addEvent('Stop');
      if (timerMode === 'Countdown') {
        setSecondsRemaining(targetMinutes * 60);
      } else {
        setStopwatchSeconds(0);
      }
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }
    }
  };

  const handleSelectPresetMinutes = (mins: number) => {
    if (!isRunning) {
      setTargetMinutes(mins);
      setSecondsRemaining(mins * 60);
    }
  };

  // Format MM:SS or HH:MM:SS
  const formatTime = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const currentDisplayTime = timerMode === 'Countdown' ? formatTime(secondsRemaining) : formatTime(stopwatchSeconds);

  // Progress fraction for dial
  const progressRatio = useMemo(() => {
    if (timerMode === 'Countdown') {
      const totalSec = targetMinutes * 60;
      return totalSec > 0 ? (totalSec - secondsRemaining) / totalSec : 0;
    } else {
      const cycle = 3600; // 1 hour cycle
      return (stopwatchSeconds % cycle) / cycle;
    }
  }, [timerMode, targetMinutes, secondsRemaining, stopwatchSeconds]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Top Header Banner matching screenshot */}
      <View
        style={[
          styles.headerBanner,
          {
            backgroundColor: isDark ? '#1C202F' : '#9EAFDE',
          },
        ]}
      >
        <View style={styles.headerTitleRow}>
          <Text style={[styles.headerTitle, { color: '#FFFFFF' }]}>Timer</Text>
        </View>

        {/* Stopwatch | Countdown Segmented Tabs matching screenshot */}
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
                timerMode === 'Stopwatch' ? styles.activeTabText : styles.inactiveTabText,
              ]}
            >
              Stopwatch
            </Text>
            {timerMode === 'Stopwatch' && <View style={styles.tabIndicator} />}
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
                timerMode === 'Countdown' ? styles.activeTabText : styles.inactiveTabText,
              ]}
            >
              Countdown
            </Text>
            {timerMode === 'Countdown' && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 90 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Focus ? & Habit Selector Dropdown matching screenshot */}
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
            <View style={[styles.helpCircle, { backgroundColor: isDark ? '#2D3245' : '#E0E4F0' }]}>
              <Text style={[styles.helpText, { color: colors.primaryText }]}>?</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.habitDropdownPill,
              {
                backgroundColor: isDark ? '#2B314C' : '#9EAFDE',
              },
            ]}
            onPress={() => setHabitPickerVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.habitDropdownText} numberOfLines={1}>
              {selectedHabit ? selectedHabit.name : 'Choose Habit'}
            </Text>
            <Ionicons name="chevron-down" size={14} color="#FFFFFF" style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        </View>

        {/* Circular Timer Ring Dial matching screenshot */}
        <View style={styles.dialContainer}>
          <View
            style={[
              styles.outerDialRing,
              {
                borderColor: isDark ? 'rgba(158, 175, 222, 0.25)' : '#D7DEEF',
              },
            ]}
          >
            {/* Active Progress Ring Indicator */}
            <View
              style={[
                styles.activeProgressArc,
                {
                  borderColor: isDark ? '#9EAFDE' : '#8B9ECF',
                  transform: [{ rotate: `${progressRatio * 360}deg` }],
                },
              ]}
            />

            <View style={styles.dialInner}>
              <Text style={[styles.timerDigits, { color: colors.primaryText }]}>
                {currentDisplayTime}
              </Text>
              {timerMode === 'Countdown' ? (
                <View style={styles.durationSubRow}>
                  <Ionicons name="stopwatch-outline" size={15} color={colors.secondaryText} style={{ marginRight: 4 }} />
                  <Text style={[styles.durationSubText, { color: colors.secondaryText }]}>
                    {targetMinutes}m
                  </Text>
                </View>
              ) : (
                <View style={styles.durationSubRow}>
                  <Ionicons name="infinite-outline" size={16} color={colors.secondaryText} style={{ marginRight: 4 }} />
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
            {DURATION_PRESETS.map(mins => (
              <TouchableOpacity
                key={mins}
                style={[
                  styles.presetChip,
                  targetMinutes === mins
                    ? { backgroundColor: '#9EAFDE', borderColor: '#9EAFDE' }
                    : { backgroundColor: colors.card, borderColor: colors.border },
                ]}
                onPress={() => handleSelectPresetMinutes(mins)}
              >
                <Text
                  style={[
                    styles.presetChipText,
                    { color: targetMinutes === mins ? '#FFFFFF' : colors.primaryText },
                  ]}
                >
                  {mins}m
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Action Buttons matching screenshot: Stop | Pause/Start */}
        <View style={styles.actionButtonsRow}>
          {/* Stop Button */}
          <TouchableOpacity
            style={[
              styles.stopButton,
              {
                backgroundColor: isDark ? '#272B38' : '#D6DAE3',
              },
            ]}
            activeOpacity={0.7}
            onPress={handleStop}
          >
            <View style={styles.stopIconSquare} />
            <Text style={[styles.stopButtonText, { color: isDark ? '#E5E7EB' : '#1F2430' }]}>Stop</Text>
          </TouchableOpacity>

          {/* Pause / Start Button */}
          <TouchableOpacity
            style={[
              styles.playPauseButton,
              {
                backgroundColor: isDark ? '#111318' : '#1F222A',
              },
            ]}
            activeOpacity={0.8}
            onPress={isRunning ? handlePause : handleStartResume}
          >
            <Ionicons
              name={isRunning ? 'pause' : 'play'}
              size={18}
              color="#FFFFFF"
              style={{ marginRight: 8 }}
            />
            <Text style={styles.playPauseButtonText}>
              {isRunning ? 'Pause' : sessionEvents.length > 0 && sessionEvents[0].action === 'Pause' ? 'Resume' : 'Start'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Session Event Log matching screenshot */}
        <View style={styles.historySection}>
          {sessionEvents.length === 0 ? (
            <View style={styles.emptyEventsBox}>
              <Text style={[styles.emptyEventsText, { color: colors.secondaryText }]}>
                Timer timeline log will appear here when you start.
              </Text>
            </View>
          ) : (
            sessionEvents.slice(0, 10).map(evt => (
              <View key={evt.id} style={styles.eventRow}>
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
                        : 'stop'
                    }
                    size={12}
                    color={
                      evt.action === 'Completed'
                        ? '#10B981'
                        : evt.action === 'Pause'
                        ? '#F59E0B'
                        : colors.primaryText
                    }
                    style={{ marginLeft: 6 }}
                  />
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Habit Selection Modal Sheet */}
      <Modal
        visible={habitPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setHabitPickerVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setHabitPickerVisible(false)}
        >
          <View
            style={[
              styles.pickerCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.pickerHeader}>
              <Text style={[styles.pickerTitle, { color: colors.primaryText }]}>Select Focus Habit</Text>
              <TouchableOpacity onPress={() => setHabitPickerVisible(false)}>
                <Ionicons name="close" size={22} color={colors.secondaryText} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 320 }}>
              {habits.map(h => {
                const isSelected = h.id === selectedHabit?.id;
                return (
                  <TouchableOpacity
                    key={h.id}
                    style={[
                      styles.habitOptionRow,
                      isSelected && { backgroundColor: `${colors.accent}16` },
                    ]}
                    onPress={() => {
                      onSelectHabit(h.id);
                      setHabitPickerVisible(false);
                    }}
                  >
                    <Ionicons
                      name={h.icon as any}
                      size={20}
                      color={h.color || colors.accent}
                      style={{ marginRight: 12 }}
                    />
                    <Text
                      style={[
                        styles.habitOptionName,
                        {
                          color: colors.primaryText,
                          fontWeight: isSelected ? '700' : '500',
                        },
                      ]}
                    >
                      {h.name}
                    </Text>
                    {isSelected && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
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
    marginTop: 6,
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
    color: '#0A0C14',
    fontWeight: '800',
  },
  inactiveTabText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '500',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#0A0C14',
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
    marginBottom: 26,
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
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    maxWidth: 180,
  },
  habitDropdownText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  dialContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 14,
  },
  outerDialRing: {
    width: 230,
    height: 230,
    borderRadius: 115,
    borderWidth: 6,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  activeProgressArc: {
    position: 'absolute',
    width: 230,
    height: 230,
    borderRadius: 115,
    borderWidth: 6,
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  dialInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerDigits: {
    fontSize: 44,
    fontWeight: '400',
    letterSpacing: 1,
  },
  durationSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  durationSubText: {
    fontSize: 15,
    fontWeight: '600',
  },
  presetsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 16,
    marginTop: 4,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  presetChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 18,
    marginBottom: 28,
  },
  stopButton: {
    flex: 1,
    height: 52,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  stopIconSquare: {
    width: 10,
    height: 10,
    backgroundColor: '#1F2430',
    borderRadius: 2,
  },
  stopButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  playPauseButton: {
    flex: 1,
    height: 52,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playPauseButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  historySection: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
    paddingTop: 16,
    gap: 12,
  },
  eventRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  eventTimestamp: {
    fontSize: 13,
  },
  eventActionWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  eventActionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  emptyEventsBox: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  emptyEventsText: {
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  pickerCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  habitOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  habitOptionName: {
    flex: 1,
    fontSize: 15,
  },
});
