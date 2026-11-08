// src/components/FocusTimerModal.tsx
import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { Habit } from '../services/HabitContext';

interface Props {
  visible: boolean;
  habit: Habit | null;
  onClose: () => void;
  onCompleteSession?: (habitId: string, minutes: number) => void;
}

const SOUNDS = [
  { id: 'silent', name: 'Silent', icon: 'volume-mute-outline' },
  { id: 'tick', name: 'Tick', icon: 'time-outline' },
  { id: 'cafe', name: 'Cafe', icon: 'cafe-outline' },
  { id: 'faraway', name: 'Faraway', icon: 'leaf-outline' },
  { id: 'fire', name: 'Fire', icon: 'flame-outline' },
  { id: 'forests', name: 'Forests', icon: 'trail-sign-outline' },
  { id: 'ocean', name: 'Ocean', icon: 'water-outline' },
  { id: 'storm', name: 'Storm', icon: 'thunderstorm-outline' },
  { id: 'water', name: 'Water', icon: 'rainy-outline' },
];

export const FocusTimerModal = ({ visible, habit, onClose, onCompleteSession }: Props) => {
  const { colors, isDark } = useTheme();
  const defaultMinutes = habit?.targetValue ?? 30;
  const [secondsRemaining, setSecondsRemaining] = useState(defaultMinutes * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedSound, setSelectedSound] = useState('silent');
  const [soundSheetVisible, setSoundSheetVisible] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (visible && habit) {
      setTimeout(() => {
        if (mounted) {
          setSecondsRemaining((habit.targetValue ?? 30) * 60);
          setIsRunning(false);
        }
      }, 0);
    }
    return () => {
      mounted = false;
    };
  }, [visible, habit]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isRunning && secondsRemaining > 0) {
      interval = setInterval(() => {
        setSecondsRemaining(prev => {
          if (prev <= 1) {
            setIsRunning(false);
            if (habit && onCompleteSession) {
              onCompleteSession(habit.id, habit.targetValue ?? 30);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning, secondsRemaining, habit, onCompleteSession]);

  if (!habit) return null;

  const mins = Math.floor(secondsRemaining / 60);
  const secs = secondsRemaining % 60;
  const timeFormatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: isDark ? '#12141C' : '#F6F9FD' }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.primaryText} />
          </TouchableOpacity>
          <View style={styles.titleRow}>
            <Ionicons name={habit.icon as any} size={20} color={colors.accent} />
            <Text style={[styles.habitTitle, { color: colors.primaryText }]}>{habit.name}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Big Circular Timer */}
        <View style={styles.timerCenter}>
          <View
            style={[
              styles.timerRing,
              {
                borderColor: '#4FC3F7',
                backgroundColor: isDark ? '#191C27' : '#FFFFFF',
              },
            ]}
          >
            <Text style={[styles.timerDigits, { color: colors.primaryText }]}>{timeFormatted}</Text>
            <Text style={[styles.timerTarget, { color: colors.mutedText }]}>
              {habit.targetValue ?? 30}:00
            </Text>
          </View>
        </View>

        {/* Play / Pause Button */}
        <View style={styles.controlsRow}>
          <TouchableOpacity
            style={[styles.playBtn, { backgroundColor: colors.accent }]}
            onPress={() => setIsRunning(!isRunning)}
          >
            <Ionicons name={isRunning ? 'pause' : 'play'} size={28} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.resetBtn, { backgroundColor: isDark ? '#262938' : '#EAEEF4' }]}
            onPress={() => {
              setIsRunning(false);
              setSecondsRemaining((habit.targetValue ?? 30) * 60);
            }}
          >
            <Ionicons name="refresh" size={20} color={colors.secondaryText} />
          </TouchableOpacity>
        </View>

        {/* Bottom Toolbar */}
        <View
          style={[
            styles.bottomToolbar,
            {
              backgroundColor: isDark ? '#1C1E2A' : '#FFFFFF',
              borderColor: isDark ? '#2B2E3E' : '#E8ECF2',
            },
          ]}
        >
          <TouchableOpacity style={styles.toolItem} onPress={() => setSoundSheetVisible(true)}>
            <Ionicons name="musical-notes-outline" size={22} color={colors.accent} />
            <Text style={[styles.toolLabel, { color: colors.primaryText }]}>Sound</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.toolItem}
            onPress={() => setSecondsRemaining((habit.targetValue ?? 30) * 60)}
          >
            <Ionicons name="timer-outline" size={22} color={colors.secondaryText} />
            <Text style={[styles.toolLabel, { color: colors.secondaryText }]}>Countdown</Text>
          </TouchableOpacity>
        </View>

        {/* Sound Selection Bottom Sheet */}
        {soundSheetVisible && (
          <View
            style={[
              styles.soundSheet,
              {
                backgroundColor: isDark ? '#1F2230' : '#FFFFFF',
                borderColor: isDark ? '#2F3346' : '#E2E6EF',
              },
            ]}
          >
            <View style={styles.soundSheetHeader}>
              <Text style={[styles.soundSheetTitle, { color: colors.primaryText }]}>🎵 Focus sound</Text>
              <TouchableOpacity onPress={() => setSoundSheetVisible(false)}>
                <Ionicons name="close" size={20} color={colors.mutedText} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.soundGrid}>
              {SOUNDS.map(s => {
                const isSelected = selectedSound === s.id;
                return (
                  <TouchableOpacity
                    key={s.id}
                    onPress={() => {
                      setSelectedSound(s.id);
                      setSoundSheetVisible(false);
                    }}
                    style={[
                      styles.soundBtn,
                      isSelected && {
                        borderColor: colors.accent,
                        backgroundColor: `${colors.accent}14`,
                      },
                    ]}
                  >
                    <Ionicons
                      name={s.icon as any}
                      size={20}
                      color={isSelected ? colors.accent : colors.secondaryText}
                    />
                    <Text
                      style={[
                        styles.soundName,
                        { color: isSelected ? colors.accent : colors.primaryText },
                      ]}
                    >
                      {s.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: 50,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 40,
  },
  backBtn: {
    padding: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  habitTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  timerCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 40,
  },
  timerRing: {
    width: 260,
    height: 260,
    borderRadius: 130,
    borderWidth: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 8,
  },
  timerDigits: {
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: -1,
  },
  timerTarget: {
    fontSize: 14,
    marginTop: 6,
    fontWeight: '500',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
    marginBottom: 40,
  },
  playBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF5264',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  resetBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomToolbar: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
  },
  toolItem: {
    alignItems: 'center',
    gap: 4,
  },
  toolLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  soundSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    padding: 24,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 12,
  },
  soundSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  soundSheetTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  soundGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  soundBtn: {
    width: '30%',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8ECF2',
    alignItems: 'center',
    gap: 6,
  },
  soundName: {
    fontSize: 12,
    fontWeight: '600',
  },
});
