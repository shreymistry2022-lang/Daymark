import React, { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing, radii, THEME_OPTIONS, ThemeMode } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { DEFAULT_ACCENTS, DashboardSort, DateFormat, usePreferences } from '../services/PreferencesContext';
import { useSubscription } from '../services/SubscriptionProvider';
import { canAccessFeature } from '../services/subscriptionEntitlements';
import { PaywallModal } from '../components/PaywallModal';
import { checkNotificationPermissionStatus, sendTestNotificationAsync } from '../services/localReminders';

interface Props { onClose?: () => void }
const TIMEZONES = ['UTC', 'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney'];
export const PreferencesScreen = ({ onClose }: Props) => {
  const insets = useSafeAreaInsets(); const { colors, mode, setMode } = useTheme(); const { preferences, updatePreferences, error, clearError } = usePreferences(); const { isPro } = useSubscription();
  const [timezoneDraft, setTimezoneDraft] = useState(preferences.timezone); const [wakeDraft, setWakeDraft] = useState(preferences.wakeTime ?? ''); const [sleepDraft, setSleepDraft] = useState(preferences.sleepTime ?? ''); const [paywallVisible, setPaywallVisible] = useState(false);
  const [notiGranted, setNotiGranted] = useState<boolean | null>(null);

  useEffect(() => {
    void checkNotificationPermissionStatus().then(res => setNotiGranted(res.granted));
  }, []);
  // Sync local text drafts when preferences finish loading or change on another screen.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setTimezoneDraft(preferences.timezone); setWakeDraft(preferences.wakeTime ?? ''); setSleepDraft(preferences.sleepTime ?? ''); }, [preferences.timezone, preferences.wakeTime, preferences.sleepTime]);
  const chooseTheme = (theme: ThemeMode) => { if (theme === 'pure' && !canAccessFeature('premium_themes', isPro)) { setPaywallVisible(true); return; } setMode(theme); };
  const commitTimezone = () => { const value = timezoneDraft.trim(); try { new Intl.DateTimeFormat('en-US', { timeZone: value }).format(); updatePreferences({ timezone: value }); } catch { Alert.alert('Timezone not recognized', 'Enter a valid IANA timezone, such as Asia/Kolkata or America/New_York.'); setTimezoneDraft(preferences.timezone); } };
  const commitTime = (field: 'wakeTime' | 'sleepTime', value: string) => { const time = value.trim(); if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) { Alert.alert('Use 24-hour time', 'Enter a time in HH:mm format, such as 07:30.'); if (field === 'wakeTime') setWakeDraft(preferences.wakeTime ?? ''); else setSleepDraft(preferences.sleepTime ?? ''); return; } updatePreferences({ [field]: time || null }); };
  const handleTestReminder = async () => {
    try {
      const scheduled = await sendTestNotificationAsync();
      setNotiGranted(scheduled);
      if (scheduled) {
        Alert.alert('Test Reminder Scheduled', 'Look for your test habit notification on your phone in about 2 seconds.');
      } else {
        Alert.alert('Notifications Disabled', 'Notification permission is currently off. Please enable notifications for Daymark in your phone settings.');
      }
    } catch (err: any) {
      Alert.alert('Test Notification Error', err?.message || 'Could not schedule test notification.');
    }
  };
  return <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
    <View style={styles.header}><View><Text style={[styles.eyebrow, { color: colors.accent }]}>YOUR DAYMARK</Text><Text style={[styles.title, { color: colors.primaryText }]}>Preferences</Text></View><TouchableOpacity accessibilityRole="button" accessibilityLabel="Close preferences" onPress={onClose} style={styles.close}><Ionicons name="close" size={23} color={colors.primaryText} /></TouchableOpacity></View>
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}>
      {!!error && (
        <View style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="cloud-offline-outline" size={18} color={colors.accent} />
          <Text style={[styles.noticeText, { color: colors.secondaryText, flex: 1 }]}>{error}</Text>
          <TouchableOpacity accessibilityLabel="Dismiss notice" onPress={clearError} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={18} color={colors.secondaryText} />
          </TouchableOpacity>
        </View>
      )}
      <Section title="APPEARANCE" colors={colors}><Text style={[styles.caption, { color: colors.secondaryText }]}>Automatic follows the device light and dark setting.</Text><View style={styles.choiceWrap}>{THEME_OPTIONS.map(option => <Choice key={option.id} label={option.label} active={mode === option.id} onPress={() => chooseTheme(option.id)} colors={colors} />)}</View><Text style={[styles.label, { color: colors.secondaryText }]}>ACCENT COLOUR</Text><View style={styles.swatches}>{DEFAULT_ACCENTS.map(color => <TouchableOpacity key={color} accessibilityRole="button" accessibilityLabel={`Set accent colour ${color}`} accessibilityState={{ selected: preferences.accentColor === color }} onPress={() => updatePreferences({ accentColor: color })} style={[styles.swatch, { backgroundColor: color, borderColor: preferences.accentColor === color ? colors.primaryText : colors.border }]}>{preferences.accentColor === color && <Ionicons name="checkmark" size={15} color="#fff" />}</TouchableOpacity>)}</View></Section>
      <Section title="CALENDAR AND TIME" colors={colors}><Text style={[styles.label, { color: colors.secondaryText }]}>WEEK STARTS ON</Text><View style={styles.choiceWrap}>{[{ label: 'Monday', value: 1 }, { label: 'Sunday', value: 0 }].map(item => <Choice key={item.value} label={item.label} active={preferences.weekStart === item.value} onPress={() => updatePreferences({ weekStart: item.value })} colors={colors} />)}</View><Text style={[styles.label, { color: colors.secondaryText }]}>DATE FORMAT</Text><View style={styles.choiceWrap}>{([{ label: 'System', value: 'system' }, { label: 'MM/DD/YYYY', value: 'us' }, { label: 'DD/MM/YYYY', value: 'uk' }, { label: 'YYYY-MM-DD', value: 'iso' }] as { label: string; value: DateFormat }[]).map(item => <Choice key={item.value} label={item.label} active={preferences.dateFormat === item.value} onPress={() => updatePreferences({ dateFormat: item.value })} colors={colors} />)}</View><Text style={[styles.label, { color: colors.secondaryText }]}>TIMEZONE</Text><TextInput accessibilityLabel="Timezone" value={timezoneDraft} onChangeText={setTimezoneDraft} onBlur={commitTimezone} onSubmitEditing={commitTimezone} autoCapitalize="none" placeholder="IANA timezone" placeholderTextColor={colors.mutedText} style={[styles.input, { color: colors.primaryText, backgroundColor: colors.secondaryBackground, borderColor: colors.border }]} /><View style={styles.choiceWrap}>{TIMEZONES.map(zone => <Choice key={zone} label={zone} active={preferences.timezone === zone} onPress={() => { setTimezoneDraft(zone); updatePreferences({ timezone: zone }); }} colors={colors} />)}</View></Section>
      <Section title="DAILY RHYTHM" colors={colors}><Text style={[styles.caption, { color: colors.secondaryText }]}>Optional times for future planning and reminder suggestions.</Text><View style={styles.timeRow}><View style={{ flex: 1 }}><Text style={[styles.label, { color: colors.secondaryText }]}>WAKE UP</Text><TextInput accessibilityLabel="Wake up time" value={wakeDraft} onChangeText={setWakeDraft} onBlur={() => commitTime('wakeTime', wakeDraft)} onSubmitEditing={() => commitTime('wakeTime', wakeDraft)} placeholder="07:00" placeholderTextColor={colors.mutedText} style={[styles.input, { color: colors.primaryText, backgroundColor: colors.secondaryBackground, borderColor: colors.border }]} /></View><View style={{ flex: 1 }}><Text style={[styles.label, { color: colors.secondaryText }]}>SLEEP</Text><TextInput accessibilityLabel="Sleep time" value={sleepDraft} onChangeText={setSleepDraft} onBlur={() => commitTime('sleepTime', sleepDraft)} onSubmitEditing={() => commitTime('sleepTime', sleepDraft)} placeholder="22:00" placeholderTextColor={colors.mutedText} style={[styles.input, { color: colors.primaryText, backgroundColor: colors.secondaryBackground, borderColor: colors.border }]} /></View></View></Section>
      <Section title="DASHBOARD" colors={colors}><Text style={[styles.label, { color: colors.secondaryText }]}>DEFAULT HABIT ORDER</Text><View style={styles.choiceWrap}>{([{ label: 'Custom', value: 'custom' }, { label: 'Alphabetical', value: 'alphabetical' }, { label: 'Consistency', value: 'consistency' }, { label: 'Completion', value: 'completion' }] as { label: string; value: DashboardSort }[]).map(item => <Choice key={item.value} label={item.label} active={preferences.dashboardSort === item.value} onPress={() => updatePreferences({ dashboardSort: item.value })} colors={colors} />)}</View></Section>
      <Section title="FEEDBACK AND REMINDERS" colors={colors}>
        {notiGranted === false && (
          <View style={[styles.permBanner, { backgroundColor: `${colors.error}14`, borderColor: colors.error }]}>
            <Ionicons name="notifications-off-outline" size={18} color={colors.error} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.permBannerTitle, { color: colors.primaryText }]}>Notifications are disabled</Text>
              <Text style={[styles.permBannerSub, { color: colors.secondaryText }]}>Enable notifications in device settings so your habit reminders can sound on time.</Text>
            </View>
            <TouchableOpacity
              style={[styles.openSettingsBtn, { backgroundColor: colors.accent }]}
              onPress={() => Linking.openSettings()}
            >
              <Text style={styles.openSettingsText}>Settings</Text>
            </TouchableOpacity>
          </View>
        )}
        <Toggle label="Haptic feedback" detail="Vibrate for small confirmations" value={preferences.hapticsEnabled} onChange={value => updatePreferences({ hapticsEnabled: value })} colors={colors} />
        <Toggle label="Sound" detail="Allow notification sounds" value={preferences.soundEnabled} onChange={value => updatePreferences({ soundEnabled: value })} colors={colors} />
        <Toggle label="Habit reminders" detail="Enable scheduled habit notifications" value={preferences.notifications.daily} onChange={value => updatePreferences({ notifications: { daily: value } })} colors={colors} />
        <Toggle label="Routine reminders" detail="Enable routine notifications" value={preferences.notifications.routine} onChange={value => updatePreferences({ notifications: { routine: value } })} colors={colors} />
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Send test habit reminder"
          onPress={handleTestReminder}
          style={[styles.testReminderBtn, { backgroundColor: `${colors.accent}15`, borderColor: colors.accent }]}
        >
          <Ionicons name="notifications-outline" size={16} color={colors.accent} />
          <Text style={[styles.testReminderText, { color: colors.accent }]}>Send Test Habit Reminder (2 seconds)</Text>
        </TouchableOpacity>
      </Section>
      <Text style={[styles.footer, { color: colors.mutedText }]}>Settings save on this device and sync to your account when signed in.</Text>
    </ScrollView>
    <PaywallModal visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
  </View>;
};
const Section = ({ title, colors, children }: { title: string; colors: any; children: React.ReactNode }) => <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.sectionTitle, { color: colors.secondaryText }]}>{title}</Text>{children}</View>;
const Choice = ({ label, active, onPress, colors }: { label: string; active: boolean; onPress: () => void; colors: any }) => <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.choice, { backgroundColor: active ? `${colors.accent}20` : colors.secondaryBackground, borderColor: active ? colors.accent : colors.border }]}><Text style={{ color: active ? colors.accent : colors.secondaryText, fontSize: 11, fontWeight: '700' }}>{label}</Text></TouchableOpacity>;
const Toggle = ({ label, detail, value, onChange, colors }: { label: string; detail: string; value: boolean; onChange: (value: boolean) => void; colors: any }) => <View style={[styles.toggle, { borderBottomColor: colors.border }]}><View style={styles.toggleMeta}><Text style={[styles.toggleTitle, { color: colors.primaryText }]}>{label}</Text><Text style={[styles.caption, { color: colors.mutedText }]}>{detail}</Text></View><Switch value={value} onValueChange={onChange} trackColor={{ false: colors.border, true: colors.accent }} thumbColor="#FFF" /></View>;
const styles = StyleSheet.create({ screen: { flex: 1 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md }, eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.3 }, title: { fontSize: 29, fontWeight: '800', marginTop: 3 }, close: { padding: 8 }, content: { paddingHorizontal: spacing.lg, gap: spacing.md }, section: { borderWidth: 1, borderRadius: radii.lg, padding: spacing.md }, sectionTitle: { fontSize: 10, letterSpacing: 1.1, fontWeight: '800', marginBottom: spacing.sm }, caption: { fontSize: 11, lineHeight: 17 }, choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: spacing.sm }, choice: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 10, paddingVertical: 8 }, label: { fontSize: 9, letterSpacing: 1, fontWeight: '800', marginTop: spacing.md }, swatches: { flexDirection: 'row', gap: 12, paddingTop: spacing.sm }, swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' }, input: { borderWidth: 1, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: 10, marginTop: 6 }, timeRow: { flexDirection: 'row', gap: spacing.md }, toggle: { flexDirection: 'row', alignItems: 'center', minHeight: 58, borderBottomWidth: StyleSheet.hairlineWidth }, toggleMeta: { flex: 1 }, toggleTitle: { fontSize: 13, fontWeight: '700' }, footer: { textAlign: 'center', fontSize: 10, padding: spacing.sm }, notice: { borderWidth: 1, borderRadius: radii.md, padding: spacing.md, flexDirection: 'row', gap: 8 }, noticeText: { flex: 1 },
  testReminderBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: radii.md, borderWidth: 1, marginTop: spacing.md },
  testReminderText: { fontSize: 13, fontWeight: '700' },
  permBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: spacing.md, borderRadius: radii.md, borderWidth: 1, marginBottom: spacing.md },
  permBannerTitle: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  permBannerSub: { fontSize: 11, lineHeight: 15 },
  openSettingsBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.sm },
  openSettingsText: { color: '#000', fontSize: 11, fontWeight: '800' },
});
