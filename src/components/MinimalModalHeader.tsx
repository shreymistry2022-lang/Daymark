import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, ThemePalette } from '../theme/tokens';

interface MinimalModalHeaderProps {
  title: string;
  subtitle?: string;
  colors: ThemePalette;
  onClose?: () => void;
  closeIcon?: 'chevron-back' | 'close';
  closeAccessibilityLabel?: string;
  rightElement?: React.ReactNode;
  showHandle?: boolean;
}

/** Minimalist centered modal/sub-screen header with a circular back/close button. */
export const MinimalModalHeader: React.FC<MinimalModalHeaderProps> = ({
  title,
  subtitle,
  colors,
  onClose,
  closeIcon = 'chevron-back',
  closeAccessibilityLabel = 'Close',
  rightElement,
  showHandle = false,
}) => (
  <View style={styles.wrapper}>
    {showHandle && (
      <View style={styles.handleRow}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
      </View>
    )}
    <View style={styles.bar}>
      <View style={styles.side}>
        {onClose ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={closeAccessibilityLabel}
            onPress={onClose}
            style={[
              styles.circleBtn,
              { backgroundColor: colors.secondaryBackground, borderColor: colors.border },
            ]}
          >
            <Ionicons
              name={closeIcon}
              size={closeIcon === 'chevron-back' ? 19 : 18}
              color={colors.primaryText}
            />
          </TouchableOpacity>
        ) : (
          <View style={styles.spacer} />
        )}
      </View>

      <View style={styles.titleBox}>
        <Text numberOfLines={1} style={[styles.title, { color: colors.primaryText }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={[styles.subtitle, { color: colors.mutedText }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <View style={[styles.side, styles.rightSide]}>
        {rightElement ?? <View style={styles.spacer} />}
      </View>
    </View>
  </View>
);

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  handleRow: {
    alignItems: 'center',
    paddingBottom: spacing.sm,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 40,
  },
  side: {
    minWidth: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  rightSide: {
    alignItems: 'flex-end',
  },
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spacer: {
    width: 38,
    height: 38,
  },
  titleBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500',
  },
});
