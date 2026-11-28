// src/screens/ProfileScreen.tsx
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  Modal,
} from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing, radii, THEME_OPTIONS } from '../theme/tokens';
import { useHabits } from '../services/HabitContext';
import { useTheme } from '../theme/ThemeProvider';
import { useAuth } from '../services/AuthProvider';
import { useSubscription } from '../services/SubscriptionProvider';
import { canAccessFeature, SUBSCRIPTIONS_ENABLED } from '../services/subscriptionEntitlements';
import { PaywallModal } from '../components/PaywallModal';
import { FeedbackModal } from '../components/FeedbackModal';
import { MinimalModalHeader } from '../components/MinimalModalHeader';
import { checkForAppUpdates, getUpdateInfo } from '../services/updateService';
import { RoutinesScreen } from './RoutinesScreen';
import { GoalsScreen } from './GoalsScreen';
import { JournalScreen } from './JournalScreen';
import { AchievementsScreen } from './AchievementsScreen';
import { ReportsScreen } from './ReportsScreen';
import { SearchScreen } from './SearchScreen';
import { PreferencesScreen } from './PreferencesScreen';
import { InsightsScreen } from './InsightsScreen';
import { usePreferences } from '../services/PreferencesContext';
import { useNavigation, useRoute } from '@react-navigation/native';
import { buildDaymarkCsv, buildDaymarkJson, DaymarkExport } from '../domain/exportEngine';
import { useRoutines } from '../services/RoutinesContext';
import { useGoals } from '../services/GoalsContext';
import { useJournal } from '../services/JournalContext';
import { useAchievements } from '../services/AchievementsContext';

type SettingsRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  label: string;
  valueLabel?: string;
  onPress: () => void;
  isLast?: boolean;
  labelColor?: string;
  colors: any;
};

const SettingsRow = ({ icon, iconColor, label, valueLabel, onPress, isLast, labelColor, colors }: SettingsRowProps) => (
  <TouchableOpacity
    style={[
      styles.settingsRow,
      !isLast && { borderBottomWidth: 1, borderBottomColor: colors.border },
    ]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <View style={[styles.rowIconSquircle, { backgroundColor: `${iconColor}20` }]}>
      <Ionicons name={icon} size={18} color={iconColor} />
    </View>
    <Text style={[styles.rowLabel, { color: labelColor ?? colors.primaryText }]} numberOfLines={1}>
      {label}
    </Text>
    {valueLabel ? <Text style={[styles.rowValueLabel, { color: colors.secondaryText }]}>{valueLabel}</Text> : null}
    <Ionicons name="chevron-forward" size={16} color={colors.mutedText} />
  </TouchableOpacity>
);

export const ProfileScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { habits, allHabits, stats, restartOnboarding, syncAllHabitsNow } = useHabits();
  const { mode, setMode, colors } = useTheme();
  const { user, signOut, deleteAccount } = useAuth();
  const { isPro } = useSubscription();
  const { preferences } = usePreferences();
  const { routines, retryRoutineSync } = useRoutines();
  const { goals, retryGoalSync } = useGoals();
  const { entries, retryJournalSync } = useJournal();
  const { achievements } = useAchievements();

  const [paywallVisible, setPaywallVisible] = useState(false);
  const [routinesVisible, setRoutinesVisible] = useState(false);
  const [goalsVisible, setGoalsVisible] = useState(false);
  const [journalVisible, setJournalVisible] = useState(false);
  const [achievementsVisible, setAchievementsVisible] = useState(false);
  const [reportsVisible, setReportsVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [preferencesVisible, setPreferencesVisible] = useState(false);
  const [insightsVisible, setInsightsVisible] = useState(false);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [themeExpanded, setThemeExpanded] = useState(false);
  const [initialRoutineId, setInitialRoutineId] = useState<string | null>(null);
  const [initialGoalId, setInitialGoalId] = useState<string | null>(null);
  const [initialJournalId, setInitialJournalId] = useState<string | null>(null);
  const updateInfo = useMemo(() => getUpdateInfo(), []);

  const closePreferences = () => {
    setPreferencesVisible(false);
    if (route.params?.openPreferences) navigation.setParams({ openPreferences: undefined });
  };

  const handleExportData = async (format: 'json' | 'csv') => {
    try {
      const data: DaymarkExport = {
        exportedAt: new Date().toISOString(), timezone: preferences.timezone,
        statistics: { ...stats, activeHabits: habits.length, archivedHabits: allHabits.filter(habit => habit.archivedAt).length },
        habits: allHabits, routines: routines.map(routine => ({ id: routine.id, name: routine.name, description: routine.description, createdAt: routine.createdAt, updatedAt: routine.updatedAt, archivedAt: routine.archivedAt, metadata: routine })),
        goals: goals.map(goal => ({ id: goal.id, name: goal.name, description: goal.description, createdAt: goal.createdAt, updatedAt: goal.updatedAt, archivedAt: goal.archivedAt, metadata: goal })),
        journal: entries, achievements: achievements.map(({ key, title, progress, target, unlockedAt }) => ({ key, title, progress, target, unlockedAt })),
      };
      const content = format === 'json' ? buildDaymarkJson(data) : buildDaymarkCsv(data);
      const fileName = `daymark-export-${new Date().toISOString().slice(0, 10)}.${format}`;
      if (Platform.OS === 'web') {
        const blob = new Blob([content], { type: format === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = url; link.download = fileName; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
      } else {
        const file = new File(Paths.cache, fileName);
        file.create({ overwrite: true });
        await file.write(content);
        if (!(await Sharing.isAvailableAsync())) { Alert.alert('Sharing unavailable', `The export file was created at ${file.uri}.`); return; }
        await Sharing.shareAsync(file.uri, { mimeType: format === 'json' ? 'application/json' : 'text/csv', dialogTitle: `Export Daymark ${format.toUpperCase()}` });
      }
    } catch (error) {
      console.warn('Could not create data export:', error);
      Alert.alert('Export failed', 'Daymark could not create or share the export. Check available storage and try again.');
    }
  };

  const handleOpenUrl = async (url: string) => {
    try {
      if (Platform.OS === 'web') window.open(url, '_blank');
      else await WebBrowser.openBrowserAsync(url);
    } catch {
      Alert.alert('Unable to open link', `Could not open ${url}. Please try again later.`);
    }
  };

  const handleSyncNow = async () => {
    if (!user || user.isGuest) {
      Alert.alert('Guest Mode', 'Sign in with an account to back up and sync your data to the cloud.');
      return;
    }
    await Promise.all([
      syncAllHabitsNow(),
      retryGoalSync(),
      retryRoutineSync(),
      retryJournalSync(),
    ]);
    Alert.alert('Cloud Sync Complete', 'All habits, goals, routines, and journal entries are synced to your account.');
  };

  const handleSignOut = async () => {
    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined' && window.confirm ? window.confirm('Are you sure you want to sign out?') : true;
      if (confirmed) await signOut();
      return;
    }
    Alert.alert('Sign Out', 'Are you sure you want to sign out? Cloud data stays safely synced to your account.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => { await signOut(); } },
    ]);
  };

  const handleDeleteAccount = async () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to permanently delete your account and all data? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: async () => {
            const res = await deleteAccount();
            if (res?.error) Alert.alert('Delete Account Failed', res.error);
          },
        },
      ]
    );
  };

  const displayName = user?.fullName || user?.email?.split('@')[0] || 'Daymark Member';
  const displayRole = user?.email
    ? isPro ? `${user.email} · Pro` : `${user.email} · Free`
    : 'Guest Account';

  const currentThemeLabel = THEME_OPTIONS.find(t => t.id === mode)?.label ?? 'Automatic';

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 110 }]} showsVerticalScrollIndicator={false}>
        {/* Centered Header (Reference Image 8) */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.primaryText }]}>Settings</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="View user details"
            style={[styles.circleInfoBtn, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}
            onPress={() => Alert.alert('Account Details', `Name: ${displayName}\nAccount: ${displayRole}${user?.id ? `\nUser ID: ${user.id}` : ''}`)}
          >
            <Ionicons name="person-outline" size={18} color={colors.primaryText} />
          </TouchableOpacity>
        </View>

        {/* Hero Pro Card (Reference Image 8) */}
        <View style={[styles.proHeroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.proHeroTop}>
            <View style={[styles.proIconBadge, { backgroundColor: `${colors.accent}22` }]}>
              <Ionicons name="sparkles" size={24} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.proHeroTitle, { color: colors.primaryText }]}>
                Daymark <Text style={{ color: colors.accent }}>Pro</Text>
              </Text>
              <Text style={[styles.proHeroSub, { color: colors.secondaryText }]} numberOfLines={2}>
                {isPro ? 'All unlimited habits, analytics & themes unlocked.' : 'Unlimited habits, routines, goals & advanced insights.'}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.proPillBtn, { backgroundColor: colors.accent }]}
            onPress={() => {
              if (SUBSCRIPTIONS_ENABLED) setPaywallVisible(true);
              else Alert.alert('Daymark Full Edition', 'All features are unlocked on this build.');
            }}
          >
            <Text style={styles.proPillBtnText}>
              {isPro ? 'Manage Daymark Pro' : 'Get Daymark Pro  ➔'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Compact Account + Cloud Sync Card (Reference Image 6) */}
        <View style={[styles.accountCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.avatarCircle, { backgroundColor: `${colors.accent}1E` }]}>
            <Ionicons name="person" size={22} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.userName, { color: colors.primaryText }]} numberOfLines={1}>{displayName}</Text>
            <Text style={[styles.userRole, { color: colors.secondaryText }]} numberOfLines={1}>{displayRole}</Text>
          </View>
          <TouchableOpacity
            style={[styles.syncPillBtn, { backgroundColor: `${colors.accent}1A` }]}
            onPress={() => void handleSyncNow()}
            activeOpacity={0.75}
          >
            <Ionicons name="cloud-done-outline" size={14} color={colors.accent} />
            <Text style={[styles.syncPillText, { color: colors.accent }]}>Sync</Text>
          </TouchableOpacity>
        </View>

        {/* Section: APP */}
        <Text style={[styles.groupTitle, { color: colors.secondaryText }]}>APP</Text>
        <View style={[styles.groupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingsRow
            icon="options-outline"
            iconColor="#7C83FF"
            label="General & Reminders"
            onPress={() => setPreferencesVisible(true)}
            colors={colors}
          />
          <SettingsRow
            icon="color-palette-outline"
            iconColor="#F59E0B"
            label="Theme"
            valueLabel={currentThemeLabel}
            onPress={() => setThemeExpanded(p => !p)}
            colors={colors}
          />
          {themeExpanded ? (
            <View style={[styles.themeDrawer, { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
              {THEME_OPTIONS.map(t => {
                const isActive = mode === t.id;
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[
                      styles.themeChip,
                      {
                        backgroundColor: isActive ? `${colors.accent}20` : colors.secondaryBackground,
                        borderColor: isActive ? colors.accent : colors.border,
                      },
                    ]}
                    onPress={() => {
                      if (t.id === 'pure' && !canAccessFeature('premium_themes', isPro)) setPaywallVisible(true);
                      else setMode(t.id);
                    }}
                  >
                    <View style={[styles.swatchDot, { backgroundColor: t.preview.bg, borderColor: t.preview.accent }]} />
                    <Text style={[styles.themeChipText, { color: isActive ? colors.accent : colors.primaryText }]}>
                      {t.label.split(' ')[0]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
          <SettingsRow icon="layers-outline" iconColor="#14B8A6" label="Routines" onPress={() => setRoutinesVisible(true)} colors={colors} />
          <SettingsRow icon="flag-outline" iconColor="#38BDF8" label="Goals" onPress={() => setGoalsVisible(true)} colors={colors} />
          <SettingsRow icon="book-outline" iconColor="#EC4899" label="Journal" onPress={() => setJournalVisible(true)} colors={colors} />
          <SettingsRow icon="ribbon-outline" iconColor="#A78BFA" label="Achievements" onPress={() => setAchievementsVisible(true)} colors={colors} />
          <SettingsRow icon="document-text-outline" iconColor="#10B981" label="Reports" onPress={() => setReportsVisible(true)} colors={colors} />
          <SettingsRow icon="search-outline" iconColor="#94A3B8" label="Search Everything" onPress={() => setSearchVisible(true)} isLast colors={colors} />
        </View>

        {/* Section: BACKUP & EXPORT */}
        <Text style={[styles.groupTitle, { color: colors.secondaryText }]}>BACKUP & EXPORT</Text>
        <View style={[styles.groupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingsRow
            icon="cloud-upload-outline"
            iconColor="#38BDF8"
            label="Sync Data to Cloud"
            valueLabel={user && !user.isGuest ? '● Auto' : 'Guest'}
            onPress={() => void handleSyncNow()}
            colors={colors}
          />
          <SettingsRow
            icon="download-outline"
            iconColor="#10B981"
            label="Export Progress (CSV)"
            onPress={() => {
              if (!canAccessFeature('advanced_export', isPro)) setPaywallVisible(true);
              else void handleExportData('csv');
            }}
            colors={colors}
          />
          <SettingsRow
            icon="code-download-outline"
            iconColor="#7C83FF"
            label="Export Backup (JSON)"
            onPress={() => {
              if (!canAccessFeature('advanced_export', isPro)) setPaywallVisible(true);
              else void handleExportData('json');
            }}
            isLast
            colors={colors}
          />
        </View>

        {/* Section: HELP & ABOUT */}
        <Text style={[styles.groupTitle, { color: colors.secondaryText }]}>HELP & ABOUT</Text>
        <View style={[styles.groupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingsRow icon="compass-outline" iconColor="#FF7A00" label="Show Onboarding" onPress={restartOnboarding} colors={colors} />
          <SettingsRow icon="paper-plane-outline" iconColor="#94A3B8" label="Send Feedback" onPress={() => setFeedbackVisible(true)} colors={colors} />
          <SettingsRow icon="refresh-circle-outline" iconColor="#38BDF8" label="Check for Updates" onPress={() => { void checkForAppUpdates(true); }} colors={colors} />
          <SettingsRow
            icon="lock-closed-outline"
            iconColor="#EC4899"
            label="Privacy Policy"
            onPress={() => void handleOpenUrl(process.env.EXPO_PUBLIC_PRIVACY_URL || 'https://shreymistry2022-lang.github.io/Daymark/privacy.html')}
            colors={colors}
          />
          <SettingsRow
            icon="shield-checkmark-outline"
            iconColor="#10B981"
            label="Terms of Service"
            onPress={() => void handleOpenUrl(process.env.EXPO_PUBLIC_TERMS_URL || 'https://shreymistry2022-lang.github.io/Daymark/terms.html')}
            isLast
            colors={colors}
          />
        </View>

        {/* Section: ACCOUNT */}
        <Text style={[styles.groupTitle, { color: colors.secondaryText }]}>ACCOUNT</Text>
        <View style={[styles.groupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingsRow icon="log-out-outline" iconColor={colors.secondaryText} label="Sign Out" onPress={handleSignOut} colors={colors} />
          <SettingsRow
            icon="trash-outline"
            iconColor={colors.error}
            label="Delete Account & Data"
            labelColor={colors.error}
            onPress={handleDeleteAccount}
            isLast
            colors={colors}
          />
        </View>

        <Text style={[styles.appVersionText, { color: colors.mutedText }]}>
          Daymark {updateInfo.appVersion} ({updateInfo.updateId})
        </Text>
      </ScrollView>

      <PaywallModal visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
      <FeedbackModal visible={feedbackVisible} onClose={() => setFeedbackVisible(false)} />
      <Modal visible={routinesVisible} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setRoutinesVisible(false)}>
        <RoutinesScreen initialRoutineId={initialRoutineId} onInitialRoutineHandled={() => setInitialRoutineId(null)} onClose={() => { setRoutinesVisible(false); setInitialRoutineId(null); }} />
      </Modal>
      <Modal visible={goalsVisible} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setGoalsVisible(false)}>
        <GoalsScreen initialGoalId={initialGoalId} onInitialGoalHandled={() => setInitialGoalId(null)} onClose={() => { setGoalsVisible(false); setInitialGoalId(null); }} />
      </Modal>
      <Modal visible={journalVisible} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setJournalVisible(false)}>
        <JournalScreen initialEntryId={initialJournalId} onInitialEntryHandled={() => setInitialJournalId(null)} onClose={() => { setJournalVisible(false); setInitialJournalId(null); }} />
      </Modal>
      <Modal visible={achievementsVisible} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setAchievementsVisible(false)}>
        <AchievementsScreen onClose={() => setAchievementsVisible(false)} />
      </Modal>
      <Modal visible={reportsVisible} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setReportsVisible(false)}>
        <ReportsScreen onClose={() => setReportsVisible(false)} />
      </Modal>
      <Modal visible={searchVisible} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setSearchVisible(false)}>
        <SearchScreen
          onClose={() => setSearchVisible(false)}
          onOpenHabit={id => { setSearchVisible(false); navigation.navigate('Habits', { focusHabitId: id }); }}
          onOpenRoutine={id => { setSearchVisible(false); setInitialRoutineId(id); setRoutinesVisible(true); }}
          onOpenGoal={id => { setSearchVisible(false); setInitialGoalId(id); setGoalsVisible(true); }}
          onOpenJournal={id => { setSearchVisible(false); setInitialJournalId(id); setJournalVisible(true); }}
        />
      </Modal>
      <Modal visible={preferencesVisible || Boolean(route.params?.openPreferences)} animationType="slide" presentationStyle="fullScreen" onRequestClose={closePreferences}>
        <PreferencesScreen onClose={closePreferences} />
      </Modal>
      <Modal visible={insightsVisible} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setInsightsVisible(false)}>
        <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
          <MinimalModalHeader
            title="Insights"
            colors={colors}
            onClose={() => setInsightsVisible(false)}
            closeIcon="close"
            closeAccessibilityLabel="Close insights"
            showHandle
          />
          <InsightsScreen />
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.4 },
  circleInfoBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  proHeroCard: {
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: 14,
  },
  proHeroTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  proIconBadge: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proHeroTitle: { fontSize: 19, fontWeight: '800' },
  proHeroSub: { fontSize: 12, marginTop: 2, lineHeight: 17 },
  proPillBtn: {
    height: 46,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proPillBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: 14,
    gap: 12,
    marginBottom: spacing.lg,
  },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userName: { fontSize: 15, fontWeight: '700' },
  userRole: { fontSize: 12, marginTop: 1 },
  syncPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.full,
  },
  syncPillText: { fontSize: 12, fontWeight: '700' },

  groupTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 4,
  },
  groupCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
  },
  rowIconSquircle: {
    width: 34,
    height: 34,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  rowValueLabel: { fontSize: 13, fontWeight: '600', marginRight: 2 },

  themeDrawer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 12,
  },
  themeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.full,
    borderWidth: 1,
  },
  swatchDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5 },
  themeChipText: { fontSize: 12, fontWeight: '700' },

  appVersionText: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: spacing.md,
  },
});
