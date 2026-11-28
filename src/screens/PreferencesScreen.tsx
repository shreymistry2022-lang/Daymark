import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing, radii, THEME_OPTIONS, ThemeMode } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { DEFAULT_ACCENTS, DashboardSort, DateFormat, usePreferences } from '../services/PreferencesContext';
import { useSubscription } from '../services/SubscriptionProvider';
import { canAccessFeature } from '../services/subscriptionEntitlements';
import { PaywallModal } from '../components/PaywallModal';
import { MinimalModalHeader } from '../components/MinimalModalHeader';
import {
  checkNotificationPermissionStatus,
  ensureLocalReminderPermission,
  parseTimeString,
  sendTestNotificationAsync,
} from '../services/localReminders';
import { checkForAppUpdates, getUpdateInfo } from '../services/updateService';

interface Props {
  onClose?: () => void;
}

const TIMEZONES = [
  'UTC',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
  'Australia/Sydney',
];

const THEME_ICON: Record<ThemeMode, keyof typeof Ionicons.glyphMap> = {
  automatic: 'phone-portrait-outline',
  light: 'sunny-outline',
  midnight: 'moon-outline',
  pure: 'contrast-outline',
};

export const PreferencesScreen = ({ onClose }: Props) => {
  const insets = useSafeAreaInsets();
  const { colors, mode, setMode } = useTheme();
  const { preferences, updatePreferences, error, clearError } = usePreferences();
  const { isPro } = useSubscription();

  const [timezoneDraft, setTimezoneDraft] = useState(preferences.timezone);
  const [wakeDraft, setWakeDraft] = useState(preferences.wakeTime ?? '');
  const [sleepDraft, setSleepDraft] = useState(preferences.sleepTime ?? '');
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [notiGranted, setNotiGranted] = useState<boolean | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const updateInfo = useMemo(() => getUpdateInfo(), []);

  const handleCheckUpdates = async () => {
    setIsCheckingUpdate(true);
    try {
      await checkForAppUpdates(true);
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const refreshPermission = useCallback(async () => {
    try {
      const res = await checkNotificationPermissionStatus();
      setNotiGranted(res.granted);
    } catch {
      setNotiGranted(null);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshPermission();
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        void refreshPermission();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [refreshPermission]);

  // Sync local text drafts when preferences finish loading or change on another screen.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTimezoneDraft(preferences.timezone);
    setWakeDraft(preferences.wakeTime ?? '');
    setSleepDraft(preferences.sleepTime ?? '');
  }, [preferences.timezone, preferences.wakeTime, preferences.sleepTime]);

  const chooseTheme = (theme: ThemeMode) => {
    if (theme === 'pure' && !canAccessFeature('premium_themes', isPro)) {
      setPaywallVisible(true);
      return;
    }
    setMode(theme);
  };

  const commitTimezone = () => {
    const value = timezoneDraft.trim();
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
      updatePreferences({ timezone: value });
    } catch {
      Alert.alert(
        'Timezone not recognized',
        'Enter a valid IANA timezone, such as Asia/Kolkata or America/New_York.',
      );
      setTimezoneDraft(preferences.timezone);
    }
  };

  const commitTime = (field: 'wakeTime' | 'sleepTime', value: string) => {
    const time = value.trim();
    if (!time) {
      updatePreferences({ [field]: null });
      return;
    }
    const parsed = parseTimeString(time);
    if (!parsed) {
      Alert.alert('Invalid Time', 'Enter a valid time such as 07:00, 7:00 AM, or 10:30 PM.');
      if (field === 'wakeTime') setWakeDraft(preferences.wakeTime ?? '');
      else setSleepDraft(preferences.sleepTime ?? '');
      return;
    }
    const formatted = `${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}`;
    updatePreferences({ [field]: formatted });
  };

  const handleTestReminder = async () => {
    try {
      const scheduled = await sendTestNotificationAsync();
      if (scheduled) {
        setNotiGranted(true);
        Alert.alert(
          'Test Reminder Scheduled 🔔',
          'Look for your test habit notification on your phone in about 2 seconds.',
        );
      } else {
        const status = await checkNotificationPermissionStatus();
        setNotiGranted(status.granted);
        Alert.alert(
          'Notifications Disabled',
          'Notification permission is currently off. Please enable notifications for Daymark in your phone settings.',
        );
      }
    } catch (err: any) {
      Alert.alert('Test Notification Error', err?.message || 'Could not schedule test notification.');
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <MinimalModalHeader
        title="Preferences"
        colors={colors}
        onClose={onClose}
        closeIcon="chevron-back"
        closeAccessibilityLabel="Close preferences"
        showHandle
      />

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        {!!error && (
          <View style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="cloud-offline-outline" size={18} color={colors.accent} />
            <Text style={[styles.noticeText, { color: colors.secondaryText }]}>{error}</Text>
            <TouchableOpacity
              accessibilityLabel="Dismiss notice"
              onPress={clearError}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={18} color={colors.secondaryText} />
            </TouchableOpacity>
          </View>
        )}

        <GroupLabel title="THEME" colors={colors} />
        <View style={[styles.groupedCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {THEME_OPTIONS.map((option, idx) => {
            const active = mode === option.id;
            const isLast = idx === THEME_OPTIONS.length - 1;
            const locked = option.id === 'pure' && !canAccessFeature('premium_themes', isPro);
            return (
              <TouchableOpacity
                key={option.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => chooseTheme(option.id)}
                style={[
                  styles.checkRow,
                  !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                ]}
              >
                <View style={styles.rowLeft}>
                  <Ionicons
                    name={THEME_ICON[option.id]}
                    size={19}
                    color={active ? colors.accent : colors.secondaryText}
                  />
                  <Text style={[styles.rowTitle, { color: colors.primaryText }]}>{option.label}</Text>
                  {locked && (
                    <View style={[styles.proTag, { backgroundColor: `${colors.accent}20` }]}>
                      <Text style={[styles.proTagText, { color: colors.accent }]}>PRO</Text>
                    </View>
                  )}
                </View>
                {active ? (
                  <View style={[styles.checkCircle, { backgroundColor: colors.accent }]}>
                    <Ionicons name="checkmark" size={14} color="#FFF" />
                  </View>
                ) : (
                  <View style={[styles.uncheckCircle, { borderColor: colors.border }]} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={[styles.groupHint, { color: colors.mutedText }]}>
          Automatic follows your device light and dark mode.
        </Text>

        <GroupLabel title="ACCENT COLOUR" colors={colors} />
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.swatches}>
            {DEFAULT_ACCENTS.map(color => {
              const selected = preferences.accentColor === color;
              return (
                <TouchableOpacity
                  key={color}
                  accessibilityRole="button"
                  accessibilityLabel={`Set accent colour ${color}`}
                  accessibilityState={{ selected }}
                  onPress={() => updatePreferences({ accentColor: color })}
                  style={[
                    styles.swatch,
                    {
                      backgroundColor: color,
                      borderColor: selected ? colors.primaryText : 'transparent',
                    },
                  ]}
                >
                  {selected && <Ionicons name="checkmark" size={16} color="#fff" />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <GroupLabel title="CALENDAR & TIME" colors={colors} />
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>Week starts on</Text>
          <View style={styles.choiceWrap}>
            {[
              { label: 'Monday', value: 1 },
              { label: 'Sunday', value: 0 },
            ].map(item => (
              <Choice
                key={item.value}
                label={item.label}
                active={preferences.weekStart === item.value}
                onPress={() => updatePreferences({ weekStart: item.value })}
                colors={colors}
              />
            ))}
          </View>

          <View style={[styles.innerDivider, { backgroundColor: colors.border }]} />

          <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>Date format</Text>
          <View style={styles.choiceWrap}>
            {(
              [
                { label: 'System', value: 'system' },
                { label: 'MM/DD/YYYY', value: 'us' },
                { label: 'DD/MM/YYYY', value: 'uk' },
                { label: 'YYYY-MM-DD', value: 'iso' },
              ] as { label: string; value: DateFormat }[]
            ).map(item => (
              <Choice
                key={item.value}
                label={item.label}
                active={preferences.dateFormat === item.value}
                onPress={() => updatePreferences({ dateFormat: item.value })}
                colors={colors}
              />
            ))}
          </View>

          <View style={[styles.innerDivider, { backgroundColor: colors.border }]} />

          <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>Timezone</Text>
          <TextInput
            accessibilityLabel="Timezone"
            value={timezoneDraft}
            onChangeText={setTimezoneDraft}
            onBlur={commitTimezone}
            onSubmitEditing={commitTimezone}
            autoCapitalize="none"
            placeholder="IANA timezone"
            placeholderTextColor={colors.mutedText}
            style={[
              styles.input,
              {
                color: colors.primaryText,
                backgroundColor: colors.secondaryBackground,
                borderColor: colors.border,
              },
            ]}
          />
          <View style={styles.choiceWrap}>
            {TIMEZONES.map(zone => (
              <Choice
                key={zone}
                label={zone}
                active={preferences.timezone === zone}
                onPress={() => {
                  setTimezoneDraft(zone);
                  updatePreferences({ timezone: zone });
                }}
                colors={colors}
              />
            ))}
          </View>
        </View>

        <GroupLabel title="DAILY RHYTHM" colors={colors} />
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.caption, { color: colors.secondaryText }]}>
            Your wake-up and sleep schedule. Daymark automatically sends rhythm reminders at these times.
          </Text>
          <View style={styles.timeRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.secondaryText, marginTop: spacing.sm }]}>
                Wake up
              </Text>
              <TextInput
                accessibilityLabel="Wake up time"
                value={wakeDraft}
                onChangeText={setWakeDraft}
                onBlur={() => commitTime('wakeTime', wakeDraft)}
                onSubmitEditing={() => commitTime('wakeTime', wakeDraft)}
                placeholder="07:00 or 7:00 AM"
                placeholderTextColor={colors.mutedText}
                style={[
                  styles.input,
                  {
                    color: colors.primaryText,
                    backgroundColor: colors.secondaryBackground,
                    borderColor: colors.border,
                  },
                ]}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.secondaryText, marginTop: spacing.sm }]}>
                Sleep
              </Text>
              <TextInput
                accessibilityLabel="Sleep time"
                value={sleepDraft}
                onChangeText={setSleepDraft}
                onBlur={() => commitTime('sleepTime', sleepDraft)}
                onSubmitEditing={() => commitTime('sleepTime', sleepDraft)}
                placeholder="22:00 or 10:00 PM"
                placeholderTextColor={colors.mutedText}
                style={[
                  styles.input,
                  {
                    color: colors.primaryText,
                    backgroundColor: colors.secondaryBackground,
                    borderColor: colors.border,
                  },
                ]}
              />
            </View>
          </View>
        </View>

        <GroupLabel title="DASHBOARD" colors={colors} />
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>Default habit order</Text>
          <View style={styles.choiceWrap}>
            {(
              [
                { label: 'Custom', value: 'custom' },
                { label: 'Alphabetical', value: 'alphabetical' },
                { label: 'Consistency', value: 'consistency' },
                { label: 'Completion', value: 'completion' },
              ] as { label: string; value: DashboardSort }[]
            ).map(item => (
              <Choice
                key={item.value}
                label={item.label}
                active={preferences.dashboardSort === item.value}
                onPress={() => updatePreferences({ dashboardSort: item.value })}
                colors={colors}
              />
            ))}
          </View>
        </View>

        <GroupLabel title="REMINDERS & FEEDBACK" colors={colors} />
        {notiGranted === false && (
          <View style={[styles.permBanner, { backgroundColor: `${colors.error}14`, borderColor: `${colors.error}55` }]}>
            <Ionicons name="notifications-off-outline" size={18} color={colors.error} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.permBannerTitle, { color: colors.primaryText }]}>Notifications are disabled</Text>
              <Text style={[styles.permBannerSub, { color: colors.secondaryText }]}>
                Enable notifications in device settings so reminders sound on time.
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.openSettingsBtn, { backgroundColor: colors.accent }]}
              onPress={async () => {
                const ok = await ensureLocalReminderPermission();
                if (ok) {
                  setNotiGranted(true);
                } else {
                  void Linking.openSettings();
                }
              }}
            >
              <Text style={styles.openSettingsText}>Enable</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={[styles.groupedCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Toggle
            label="Haptic feedback"
            detail="Vibrate for small confirmations"
            value={preferences.hapticsEnabled}
            onChange={value => updatePreferences({ hapticsEnabled: value })}
            colors={colors}
          />
          <Toggle
            label="Sound"
            detail="Allow notification sounds"
            value={preferences.soundEnabled}
            onChange={value => updatePreferences({ soundEnabled: value })}
            colors={colors}
          />
          <Toggle
            label="Habit reminders"
            detail="Enable scheduled habit notifications"
            value={preferences.notifications.daily}
            onChange={value => updatePreferences({ notifications: { daily: value } })}
            colors={colors}
          />
          <Toggle
            label="Daily rhythm & routines"
            detail="Wake-up, bedtime, and routine notifications"
            value={preferences.notifications.routine}
            onChange={value => updatePreferences({ notifications: { routine: value } })}
            colors={colors}
            isLast
          />
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Send test habit reminder"
          onPress={handleTestReminder}
          style={[styles.pillOutlineBtn, { backgroundColor: `${colors.accent}16`, borderColor: `${colors.accent}55` }]}
        >
          <Ionicons name="notifications-outline" size={17} color={colors.accent} />
          <Text style={[styles.pillBtnText, { color: colors.accent }]}>Send Test Habit Reminder (2s)</Text>
        </TouchableOpacity>

        <GroupLabel title="APP UPDATES" colors={colors} />
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.caption, { color: colors.secondaryText }]}>
            Daymark supports instant Over-The-Air updates without reinstalling.
          </Text>
          <View style={styles.updateMetaBox}>
            <Text style={[styles.updateMetaText, { color: colors.secondaryText }]}>
              Version <Text style={{ color: colors.primaryText, fontWeight: '700' }}>v{updateInfo.appVersion}</Text> · Runtime{' '}
              <Text style={{ color: colors.primaryText, fontWeight: '700' }}>{updateInfo.runtimeVersion}</Text>
            </Text>
            <Text style={[styles.updateMetaText, { color: colors.mutedText }]}>
              Update ID: {updateInfo.updateId} ({updateInfo.channel})
            </Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Check for updates"
            onPress={handleCheckUpdates}
            disabled={isCheckingUpdate}
            style={[styles.pillPrimaryBtn, { backgroundColor: colors.accent }]}
          >
            {isCheckingUpdate ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Ionicons name="cloud-download-outline" size={17} color="#FFF" />
            )}
            <Text style={[styles.pillBtnText, { color: '#FFF' }]}>
              {isCheckingUpdate ? 'Checking for Updates...' : 'Check for App Updates'}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.footer, { color: colors.mutedText }]}>
          Settings save on this device and sync to your account when signed in.
        </Text>
      </ScrollView>

      <PaywallModal visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
    </View>
  );
};

const GroupLabel = ({ title, colors }: { title: string; colors: any }) => (
  <Text style={[styles.groupLabel, { color: colors.mutedText }]}>{title}</Text>
);

const Choice = ({
  label,
  active,
  onPress,
  colors,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: any;
}) => (
  <TouchableOpacity
    accessibilityRole="button"
    accessibilityState={{ selected: active }}
    onPress={onPress}
    style={[
      styles.choice,
      {
        backgroundColor: active ? colors.accent : colors.secondaryBackground,
        borderColor: active ? colors.accent : colors.border,
      },
    ]}
  >
    <Text style={{ color: active ? '#FFF' : colors.secondaryText, fontSize: 12, fontWeight: '700' }}>
      {label}
    </Text>
  </TouchableOpacity>
);

const Toggle = ({
  label,
  detail,
  value,
  onChange,
  colors,
  isLast = false,
}: {
  label: string;
  detail: string;
  value: boolean;
  onChange: (value: boolean) => void;
  colors: any;
  isLast?: boolean;
}) => (
  <View
    style={[
      styles.toggle,
      !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    ]}
  >
    <View style={styles.toggleMeta}>
      <Text style={[styles.toggleTitle, { color: colors.primaryText }]}>{label}</Text>
      <Text style={[styles.toggleDetail, { color: colors.mutedText }]}>{detail}</Text>
    </View>
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ false: colors.border, true: colors.accent }}
      thumbColor="#FFF"
    />
  </View>
);

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs },
  groupLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.9,
    marginTop: spacing.lg,
    marginBottom: spacing.xs + 2,
    marginLeft: 4,
  },
  groupHint: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
    marginLeft: 4,
  },
  groupedCard: {
    borderWidth: 1,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  sectionCard: {
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    minHeight: 54,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  proTag: {
    borderRadius: radii.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  proTagText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
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
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  innerDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.md,
  },
  caption: {
    fontSize: 13,
    lineHeight: 19,
  },
  choiceWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: spacing.sm,
  },
  choice: {
    borderWidth: 1,
    borderRadius: radii.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    marginTop: 8,
    fontSize: 14,
  },
  timeRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    minHeight: 60,
  },
  toggleMeta: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  toggleTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  toggleDetail: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  footer: {
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 17,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  notice: {
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
  },
  pillOutlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: radii.full,
    borderWidth: 1,
    marginTop: spacing.sm + 4,
  },
  pillPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: radii.full,
    marginTop: spacing.md,
  },
  pillBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  updateMetaBox: {
    marginTop: 10,
    gap: 4,
  },
  updateMetaText: {
    fontSize: 12,
    lineHeight: 17,
  },
  permBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginBottom: spacing.sm + 4,
  },
  permBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  permBannerSub: {
    fontSize: 12,
    lineHeight: 16,
  },
  openSettingsBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.full,
  },
  openSettingsText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
