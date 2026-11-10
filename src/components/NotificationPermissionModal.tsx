// src/components/NotificationPermissionModal.tsx
import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, radii } from '../theme/tokens';
import {
  ensureLocalReminderPermission,
  checkNotificationPermissionStatus,
} from '../services/localReminders';

interface NotificationPermissionModalProps {
  visible: boolean;
  onClose: () => void;
  onGranted?: () => void;
}

export const NotificationPermissionModal = ({
  visible,
  onClose,
  onGranted,
}: NotificationPermissionModalProps) => {
  const { colors } = useTheme();
  const [isRequesting, setIsRequesting] = useState(false);

  const handleEnable = async () => {
    setIsRequesting(true);
    try {
      const { granted: alreadyGranted, canAskAgain } = await checkNotificationPermissionStatus();
      if (alreadyGranted) {
        onGranted?.();
        onClose();
        return;
      }

      // If Android/iOS has permanently denied permission, direct the user to device settings
      if (!canAskAgain && Platform.OS !== 'web') {
        Alert.alert(
          'Notifications Disabled',
          'Notifications are currently disabled for Daymark in your phone settings. Would you like to open Settings to turn them on?',
          [
            { text: 'Cancel', style: 'cancel', onPress: onClose },
            {
              text: 'Open Settings',
              onPress: () => {
                void Linking.openSettings();
                onClose();
              },
            },
          ]
        );
        return;
      }

      // Request runtime permission from the OS (pops up the native system prompt)
      const granted = await ensureLocalReminderPermission();
      if (granted) {
        onGranted?.();
      }
      onClose();
    } catch (err) {
      console.warn('Failed to request notification permission:', err);
      onClose();
    } finally {
      setIsRequesting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Top glowing icon */}
          <View style={[styles.iconCircle, { backgroundColor: `${colors.accent}1F` }]}>
            <Ionicons name="notifications" size={32} color={colors.accent} />
          </View>

          <Text style={[styles.title, { color: colors.primaryText }]}>
            Enable Habit Reminders
          </Text>
          <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
            Daymark works best when it can notify you of your scheduled rituals, routines, and streak milestones on time.
          </Text>

          {/* Value props */}
          <View style={styles.features}>
            <View style={styles.featureItem}>
              <View style={[styles.featureIcon, { backgroundColor: `${colors.accent}18` }]}>
                <Ionicons name="time-outline" size={18} color={colors.accent} />
              </View>
              <View style={styles.featureText}>
                <Text style={[styles.featureTitle, { color: colors.primaryText }]}>
                  Timely Reminders
                </Text>
                <Text style={[styles.featureDesc, { color: colors.secondaryText }]}>
                  Receive nudges at your chosen AM/PM times so habits stay top of mind.
                </Text>
              </View>
            </View>

            <View style={styles.featureItem}>
              <View style={[styles.featureIcon, { backgroundColor: `${colors.accent}18` }]}>
                <Ionicons name="flame-outline" size={18} color={colors.accent} />
              </View>
              <View style={styles.featureText}>
                <Text style={[styles.featureTitle, { color: colors.primaryText }]}>
                  Streak Protection
                </Text>
                <Text style={[styles.featureDesc, { color: colors.secondaryText }]}>
                  Friendly heads-up before the day wraps up so you never break an active streak.
                </Text>
              </View>
            </View>

            <View style={styles.featureItem}>
              <View style={[styles.featureIcon, { backgroundColor: `${colors.accent}18` }]}>
                <Ionicons name="sunny-outline" size={18} color={colors.accent} />
              </View>
              <View style={styles.featureText}>
                <Text style={[styles.featureTitle, { color: colors.primaryText }]}>
                  Morning & Night Routines
                </Text>
                <Text style={[styles.featureDesc, { color: colors.secondaryText }]}>
                  Tailored kickoffs and wind-downs synced to your daily rhythm.
                </Text>
              </View>
            </View>
          </View>

          {/* Action buttons */}
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.accent }]}
            activeOpacity={0.8}
            onPress={handleEnable}
            disabled={isRequesting}
          >
            <Ionicons name="notifications-outline" size={18} color="#000" />
            <Text style={styles.primaryButtonText}>
              {isRequesting ? 'Requesting...' : 'Enable Notifications'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            activeOpacity={0.7}
            onPress={onClose}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.mutedText }]}>
              Maybe Later
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  container: {
    width: '100%',
    maxWidth: 380,
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.xl,
    alignItems: 'center',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  features: {
    width: '100%',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  featureIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: 11,
    lineHeight: 16,
  },
  primaryButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: radii.md,
    marginBottom: 10,
  },
  primaryButtonText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
