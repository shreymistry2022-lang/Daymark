import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radii, spacing } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

interface MonthYearPickerModalProps {
  visible: boolean;
  monthIndex: number; // 0-11
  year: number;
  minYear?: number;
  maxYear?: number;
  accentColor?: string;
  onCancel: () => void;
  onConfirm: (monthIndex: number, year: number) => void;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const ITEM_HEIGHT = 44;
const VISIBLE_ROWS = 5;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ROWS;
const CENTER_PAD = ITEM_HEIGHT * Math.floor(VISIBLE_ROWS / 2);

/** Dual-column snapping wheel picker sheet for choosing Month and Year. */
export const MonthYearPickerModal: React.FC<MonthYearPickerModalProps> = ({
  visible,
  monthIndex,
  year,
  minYear = 2020,
  maxYear = new Date().getFullYear() + 2,
  accentColor,
  onCancel,
  onConfirm,
}) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const activeColor = accentColor ?? colors.accent;

  const years = useMemo(
    () => Array.from({ length: Math.max(1, maxYear - minYear + 1) }, (_, idx) => minYear + idx),
    [minYear, maxYear],
  );

  const [draftMonth, setDraftMonth] = useState(monthIndex);
  const [draftYear, setDraftYear] = useState(year);

  const monthScrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const yearScrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    if (!visible) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraftMonth(monthIndex);
    setDraftYear(year);
    const yIndex = Math.max(0, years.indexOf(year));
    const timer = setTimeout(() => {
      monthScrollRef.current?.scrollTo({ y: monthIndex * ITEM_HEIGHT, animated: false });
      yearScrollRef.current?.scrollTo({ y: yIndex * ITEM_HEIGHT, animated: false });
    }, 40);
    return () => clearTimeout(timer);
  }, [visible, monthIndex, year, years]);

  const handleMonthScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.max(0, Math.min(MONTH_NAMES.length - 1, Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT)));
    setDraftMonth(idx);
  };

  const handleYearScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.max(0, Math.min(years.length - 1, Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT)));
    setDraftYear(years[idx]);
  };

  const selectMonth = (idx: number) => {
    setDraftMonth(idx);
    monthScrollRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: true });
  };

  const selectYear = (yr: number, idx: number) => {
    setDraftYear(yr);
    yearScrollRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: true });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.dismissArea} activeOpacity={1} onPress={onCancel} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              paddingBottom: insets.bottom + spacing.md,
            },
          ]}
        >
          <View style={styles.handleRow}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
          </View>

          <Text style={[styles.title, { color: colors.primaryText }]}>Choose month</Text>

          <View style={styles.columnsRow}>
            {/* MONTH Wheel */}
            <View style={styles.column}>
              <Text style={[styles.columnLabel, { color: colors.mutedText }]}>MONTH</Text>
              <View style={styles.wheelBox}>
                <View
                  pointerEvents="none"
                  style={[
                    styles.selectionBand,
                    { backgroundColor: colors.secondaryBackground, borderColor: colors.border },
                  ]}
                />
                <ScrollView
                  ref={monthScrollRef}
                  showsVerticalScrollIndicator={false}
                  snapToInterval={ITEM_HEIGHT}
                  decelerationRate="fast"
                  nestedScrollEnabled
                  contentContainerStyle={{ paddingVertical: CENTER_PAD }}
                  onMomentumScrollEnd={handleMonthScrollEnd}
                  onScrollEndDrag={handleMonthScrollEnd}
                >
                  {MONTH_NAMES.map((name, idx) => {
                    const selected = idx === draftMonth;
                    const dist = Math.abs(idx - draftMonth);
                    return (
                      <TouchableOpacity
                        key={name}
                        activeOpacity={0.75}
                        onPress={() => selectMonth(idx)}
                        style={styles.wheelItem}
                      >
                        <Text
                          style={[
                            styles.wheelItemText,
                            {
                              color: selected ? colors.primaryText : colors.secondaryText,
                              fontWeight: selected ? '700' : '500',
                              opacity: selected ? 1 : dist === 1 ? 0.68 : 0.35,
                              fontSize: selected ? 16 : dist === 1 ? 15 : 13,
                            },
                          ]}
                        >
                          {name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </View>

            {/* YEAR Wheel */}
            <View style={styles.column}>
              <Text style={[styles.columnLabel, { color: colors.mutedText }]}>YEAR</Text>
              <View style={styles.wheelBox}>
                <View
                  pointerEvents="none"
                  style={[
                    styles.selectionBand,
                    { backgroundColor: colors.secondaryBackground, borderColor: colors.border },
                  ]}
                />
                <ScrollView
                  ref={yearScrollRef}
                  showsVerticalScrollIndicator={false}
                  snapToInterval={ITEM_HEIGHT}
                  decelerationRate="fast"
                  nestedScrollEnabled
                  contentContainerStyle={{ paddingVertical: CENTER_PAD }}
                  onMomentumScrollEnd={handleYearScrollEnd}
                  onScrollEndDrag={handleYearScrollEnd}
                >
                  {years.map((yr, idx) => {
                    const selected = yr === draftYear;
                    const dist = Math.abs(yr - draftYear);
                    return (
                      <TouchableOpacity
                        key={yr}
                        activeOpacity={0.75}
                        onPress={() => selectYear(yr, idx)}
                        style={styles.wheelItem}
                      >
                        <Text
                          style={[
                            styles.wheelItemText,
                            {
                              color: selected ? colors.primaryText : colors.secondaryText,
                              fontWeight: selected ? '700' : '500',
                              opacity: selected ? 1 : dist === 1 ? 0.68 : 0.35,
                              fontSize: selected ? 16 : dist === 1 ? 15 : 13,
                            },
                          ]}
                        >
                          {yr}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => onConfirm(draftMonth, draftYear)}
            style={[styles.confirmBtn, { backgroundColor: activeColor }]}
            activeOpacity={0.85}
          >
            <Text style={styles.confirmBtnText}>Show month</Text>
          </TouchableOpacity>

          <TouchableOpacity accessibilityRole="button" onPress={onCancel} style={styles.cancelBtn}>
            <Text style={[styles.cancelBtnText, { color: activeColor }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.68)',
    justifyContent: 'flex-end',
  },
  dismissArea: { flex: 1 },
  sheet: {
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  handleRow: { alignItems: 'center', paddingBottom: spacing.sm },
  handle: { width: 36, height: 4, borderRadius: 2 },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: spacing.md,
  },
  columnsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  column: { flex: 1 },
  columnLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.9,
    textAlign: 'center',
    marginBottom: 8,
  },
  wheelBox: {
    height: WHEEL_HEIGHT,
    position: 'relative',
    overflow: 'hidden',
  },
  selectionBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: CENTER_PAD,
    height: ITEM_HEIGHT,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  wheelItem: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelItemText: { textAlign: 'center' },
  confirmBtn: {
    height: 52,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  cancelBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  cancelBtnText: { fontSize: 15, fontWeight: '700' },
});
