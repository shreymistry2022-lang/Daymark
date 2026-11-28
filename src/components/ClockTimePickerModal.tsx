import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radii, spacing } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

interface ClockTimePickerModalProps {
  visible: boolean;
  initialHour: number; // 0-23
  initialMinute: number; // 0-59
  onCancel: () => void;
  onConfirm: (hour: number, minute: number) => void;
}

const DIAL_SIZE = 244;
const CENTER = DIAL_SIZE / 2;
const NUMBER_RADIUS = 92;
const ITEM_SIZE = 38;

const HOUR_VALUES = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTE_VALUES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

/** Material-inspired analog clock dial + keyboard time picker dialog. */
export const ClockTimePickerModal: React.FC<ClockTimePickerModalProps> = ({
  visible,
  initialHour,
  initialMinute,
  onCancel,
  onConfirm,
}) => {
  const { colors } = useTheme();
  const [hour12, setHour12] = useState(10);
  const [minute, setMinute] = useState(0);
  const [ampm, setAmpm] = useState<'AM' | 'PM'>('AM');
  const [activeField, setActiveField] = useState<'hour' | 'minute'>('hour');
  const [keyboardMode, setKeyboardMode] = useState(false);
  const [hourInput, setHourInput] = useState('10');
  const [minuteInput, setMinuteInput] = useState('00');

  useEffect(() => {
    if (!visible) return;
    const h24 = ((initialHour % 24) + 24) % 24;
    const nextAmPm: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM';
    const nextH12 = h24 % 12 === 0 ? 12 : h24 % 12;
    const nextMin = Math.max(0, Math.min(59, initialMinute));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHour12(nextH12);
    setMinute(nextMin);
    setAmpm(nextAmPm);
    setActiveField('hour');
    setKeyboardMode(false);
    setHourInput(String(nextH12).padStart(2, '0'));
    setMinuteInput(String(nextMin).padStart(2, '0'));
  }, [visible, initialHour, initialMinute]);

  const handleSelectHour = (h: number) => {
    setHour12(h);
    setHourInput(String(h).padStart(2, '0'));
    setActiveField('minute');
  };

  const handleSelectMinute = (m: number) => {
    setMinute(m);
    setMinuteInput(String(m).padStart(2, '0'));
  };

  const handleHourTextChange = (text: string) => {
    const clean = text.replace(/\D/g, '').slice(0, 2);
    setHourInput(clean);
    const num = Number(clean);
    if (num >= 1 && num <= 12) {
      setHour12(num);
    }
  };

  const handleMinuteTextChange = (text: string) => {
    const clean = text.replace(/\D/g, '').slice(0, 2);
    setMinuteInput(clean);
    const num = Number(clean);
    if (clean.length > 0 && num >= 0 && num <= 59) {
      setMinute(num);
    }
  };

  const commitAndConfirm = () => {
    let finalH12 = hour12;
    let finalMin = minute;
    if (keyboardMode) {
      const parsedH = Number(hourInput);
      const parsedM = Number(minuteInput);
      if (Number.isFinite(parsedH) && parsedH >= 1 && parsedH <= 12) finalH12 = parsedH;
      if (Number.isFinite(parsedM) && parsedM >= 0 && parsedM <= 59) finalMin = parsedM;
    }
    let h24 = finalH12 % 12;
    if (ampm === 'PM') h24 += 12;
    onConfirm(h24, finalMin);
  };

  const dialValues = activeField === 'hour' ? HOUR_VALUES : MINUTE_VALUES;
  const handDeg = activeField === 'hour' ? (hour12 % 12) * 30 : minute * 6;
  const displayHour = String(hour12).padStart(2, '0');
  const displayMin = String(minute).padStart(2, '0');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={[styles.dialog, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.caption, { color: colors.secondaryText }]}>
            {keyboardMode ? 'Enter time' : 'Select time'}
          </Text>

          {/* Header Time Readout + AM/PM */}
          <View style={styles.headerRow}>
            {keyboardMode ? (
              <View
                style={[
                  styles.timeBox,
                  {
                    backgroundColor: colors.secondaryBackground,
                    borderColor: activeField === 'hour' ? colors.accent : colors.border,
                  },
                ]}
              >
                <TextInput
                  accessibilityLabel="Hour"
                  value={hourInput}
                  onChangeText={handleHourTextChange}
                  onFocus={() => setActiveField('hour')}
                  keyboardType="number-pad"
                  maxLength={2}
                  selectTextOnFocus
                  style={[styles.timeInputText, { color: colors.primaryText }]}
                />
              </View>
            ) : (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Select hour"
                onPress={() => setActiveField('hour')}
                style={[
                  styles.timeBox,
                  {
                    backgroundColor: activeField === 'hour' ? `${colors.accent}24` : colors.secondaryBackground,
                    borderColor: activeField === 'hour' ? colors.accent : 'transparent',
                  },
                ]}
              >
                <Text style={[styles.timeText, { color: activeField === 'hour' ? colors.accent : colors.primaryText }]}>
                  {displayHour}
                </Text>
              </TouchableOpacity>
            )}

            <Text style={[styles.colon, { color: colors.primaryText }]}>:</Text>

            {keyboardMode ? (
              <View
                style={[
                  styles.timeBox,
                  {
                    backgroundColor: colors.secondaryBackground,
                    borderColor: activeField === 'minute' ? colors.accent : colors.border,
                  },
                ]}
              >
                <TextInput
                  accessibilityLabel="Minute"
                  value={minuteInput}
                  onChangeText={handleMinuteTextChange}
                  onFocus={() => setActiveField('minute')}
                  keyboardType="number-pad"
                  maxLength={2}
                  selectTextOnFocus
                  style={[styles.timeInputText, { color: colors.primaryText }]}
                />
              </View>
            ) : (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Select minute"
                onPress={() => setActiveField('minute')}
                style={[
                  styles.timeBox,
                  {
                    backgroundColor: activeField === 'minute' ? `${colors.accent}24` : colors.secondaryBackground,
                    borderColor: activeField === 'minute' ? colors.accent : 'transparent',
                  },
                ]}
              >
                <Text style={[styles.timeText, { color: activeField === 'minute' ? colors.accent : colors.primaryText }]}>
                  {displayMin}
                </Text>
              </TouchableOpacity>
            )}

            <View style={[styles.ampmCol, { borderColor: colors.border }]}>
              {(['AM', 'PM'] as const).map((period, idx) => {
                const selected = ampm === period;
                return (
                  <TouchableOpacity
                    key={period}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setAmpm(period)}
                    style={[
                      styles.ampmBtn,
                      idx === 0 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                      { backgroundColor: selected ? `${colors.accent}28` : colors.secondaryBackground },
                    ]}
                  >
                    <Text
                      style={[
                        styles.ampmText,
                        { color: selected ? colors.accent : colors.secondaryText, fontWeight: selected ? '800' : '600' },
                      ]}
                    >
                      {period}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Analog Clock Face */}
          {!keyboardMode && (
            <View style={styles.dialWrapper}>
              <View style={[styles.dialCircle, { backgroundColor: colors.secondaryBackground }]}>
                {/* Clock Hand */}
                <View
                  pointerEvents="none"
                  style={[styles.handAxis, { transform: [{ rotate: `${handDeg}deg` }] }]}
                >
                  <View style={[styles.handStem, { backgroundColor: colors.accent }]} />
                  <View style={styles.handTail} />
                </View>

                {/* Center Pivot Dot */}
                <View style={[styles.centerDot, { backgroundColor: colors.accent }]} />

                {/* 12 Dial Numbers */}
                {dialValues.map((val, i) => {
                  const angleRad = ((i * 30 - 90) * Math.PI) / 180;
                  const x = CENTER + NUMBER_RADIUS * Math.cos(angleRad) - ITEM_SIZE / 2;
                  const y = CENTER + NUMBER_RADIUS * Math.sin(angleRad) - ITEM_SIZE / 2;
                  const isSelected = activeField === 'hour' ? hour12 === val : minute === val;
                  const label = activeField === 'hour' ? String(val) : String(val).padStart(2, '0');
                  return (
                    <TouchableOpacity
                      key={val}
                      accessibilityRole="button"
                      accessibilityLabel={`${activeField} ${label}`}
                      onPress={() => (activeField === 'hour' ? handleSelectHour(val) : handleSelectMinute(val))}
                      style={[
                        styles.dialItem,
                        {
                          left: x,
                          top: y,
                          backgroundColor: isSelected ? colors.accent : 'transparent',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.dialItemText,
                          { color: isSelected ? '#FFFFFF' : colors.primaryText, fontWeight: isSelected ? '700' : '500' },
                        ]}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Footer Controls */}
          <View style={styles.footerRow}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={keyboardMode ? 'Switch to clock dial' : 'Switch to keyboard input'}
              onPress={() => {
                setHourInput(displayHour);
                setMinuteInput(displayMin);
                setKeyboardMode(prev => !prev);
              }}
              style={styles.modeToggleBtn}
            >
              <Ionicons
                name={keyboardMode ? 'time-outline' : 'keypad-outline'}
                size={21}
                color={colors.secondaryText}
              />
            </TouchableOpacity>

            <View style={styles.footerActions}>
              <TouchableOpacity accessibilityRole="button" onPress={onCancel} style={styles.footerTextBtn}>
                <Text style={[styles.footerBtnLabel, { color: colors.accent }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" onPress={commitAndConfirm} style={styles.footerTextBtn}>
                <Text style={[styles.footerBtnLabel, { color: colors.accent }]}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.68)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  dialog: {
    width: '100%',
    maxWidth: 332,
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 16,
  },
  caption: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  timeBox: {
    width: 84,
    height: 68,
    borderRadius: radii.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeText: {
    fontSize: 38,
    fontWeight: '600',
    letterSpacing: -0.5,
  },
  timeInputText: {
    width: '100%',
    textAlign: 'center',
    fontSize: 36,
    fontWeight: '600',
  },
  colon: {
    fontSize: 36,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  ampmCol: {
    width: 50,
    height: 68,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  ampmBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ampmText: {
    fontSize: 13,
  },
  dialWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  dialCircle: {
    width: DIAL_SIZE,
    height: DIAL_SIZE,
    borderRadius: DIAL_SIZE / 2,
    position: 'relative',
  },
  handAxis: {
    position: 'absolute',
    left: CENTER - 1,
    top: CENTER - NUMBER_RADIUS,
    width: 2,
    height: NUMBER_RADIUS * 2,
    alignItems: 'center',
  },
  handStem: {
    width: 2,
    height: NUMBER_RADIUS,
  },
  handTail: {
    width: 2,
    height: NUMBER_RADIUS,
    backgroundColor: 'transparent',
  },
  centerDot: {
    position: 'absolute',
    left: CENTER - 4,
    top: CENTER - 4,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dialItem: {
    position: 'absolute',
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: ITEM_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialItemText: {
    fontSize: 14,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  modeToggleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  footerTextBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.full,
  },
  footerBtnLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
});
