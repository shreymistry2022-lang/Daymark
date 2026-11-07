// src/screens/ProfileScreen.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
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
import { canAccessFeature } from '../services/subscriptionEntitlements';
import { PaywallModal } from '../components/PaywallModal';
import { RoutinesScreen } from './RoutinesScreen';
import { GoalsScreen } from './GoalsScreen';
import { JournalScreen } from './JournalScreen';
import { AchievementsScreen } from './AchievementsScreen';
import { ReportsScreen } from './ReportsScreen';
import { SearchScreen } from './SearchScreen';
import { PreferencesScreen } from './PreferencesScreen';
import { usePreferences } from '../services/PreferencesContext';
import { useNavigation, useRoute } from '@react-navigation/native';
import { buildDaymarkCsv, buildDaymarkJson, DaymarkExport } from '../domain/exportEngine';
import { useRoutines } from '../services/RoutinesContext';
import { useGoals } from '../services/GoalsContext';
import { useJournal } from '../services/JournalContext';
import { useAchievements } from '../services/AchievementsContext';

export const ProfileScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { habits, allHabits, stats, restartOnboarding } = useHabits();
  const { mode, setMode, colors } = useTheme();
  const { user, isGuest, signOut, deleteAccount } = useAuth();
  const { isPro } = useSubscription();
  const { preferences, updatePreferences } = usePreferences();
  const { routines } = useRoutines();
  const { goals } = useGoals();
  const { entries } = useJournal();
  const { achievements } = useAchievements();
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [routinesVisible, setRoutinesVisible] = useState(false);
  const [goalsVisible, setGoalsVisible] = useState(false);
  const [journalVisible, setJournalVisible] = useState(false);
  const [achievementsVisible, setAchievementsVisible] = useState(false);
  const [reportsVisible, setReportsVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [preferencesVisible, setPreferencesVisible] = useState(false);
  const [initialRoutineId, setInitialRoutineId] = useState<string | null>(null);
  const [initialGoalId, setInitialGoalId] = useState<string | null>(null);
  const [initialJournalId, setInitialJournalId] = useState<string | null>(null);

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
      if (Platform.OS === 'web') {
        window.open(url, '_blank');
      } else {
        await WebBrowser.openBrowserAsync(url);
      }
    } catch {
      Alert.alert('Unable to open link', `Could not open ${url}. Please try again later.`);
    }
  };

  const handleSignOut = async () => {
    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined' && window.confirm
        ? window.confirm('Are you sure you want to sign out?')
        : true;
      if (confirmed) {
        await signOut();
      }
      return;
    }

    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out? Your habits will remain safely stored on this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
          },
        },
      ]
    );
  };

  const handleDeleteAccount = async () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to permanently delete your account and all data? This action is irreversible and wipes all habits, routines, goals, and journal entries.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: async () => {
            const res = await deleteAccount();
            if (res?.error) {
              Alert.alert('Delete Account Failed', res.error);
            }
          },
        },
      ]
    );
  };

  const displayName = user?.fullName || (isGuest ? 'Guest User' : 'Daymark Member');
  const displayRole = user?.email
    ? `${user.email} • Cloud Synced`
    : isGuest
    ? 'Local Storage (Offline)'
    : 'Consistent Tracker • Pro';

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 110 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>SETTINGS & ACCOUNT</Text>
          <Text style={[styles.title, { color: colors.primaryText }]}>Profile</Text>
        </View>

        {/* User Card */}
        <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.avatar, { backgroundColor: `${colors.accent}18` }]}>
            <Ionicons name="person" size={32} color={colors.accent} />
          </View>
          <View style={styles.userInfo}>
            <Text style={[styles.userName, { color: colors.primaryText }]}>{displayName}</Text>
            <Text style={[styles.userRole, { color: colors.secondaryText }]}>{displayRole}</Text>
          </View>
          <TouchableOpacity
            style={styles.editProfileBtn}
            onPress={() => Alert.alert('User Details', `Signed in as: ${displayName}\n${displayRole}`)}
          >
            <Ionicons name="information-circle-outline" size={20} color={colors.secondaryText} />
          </TouchableOpacity>
        </View>

        {/* Fast Stats Row */}
        <View style={styles.statsRow}>
          <View style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statDigit, { color: colors.accent }]}>{habits.length}</Text>
            <Text style={[styles.statTag, { color: colors.secondaryText }]}>Active Habits</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statDigit, { color: colors.accent }]}>{stats.bestStreak}d</Text>
            <Text style={[styles.statTag, { color: colors.secondaryText }]}>Best Streak</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statDigit, { color: colors.accent }]}>{stats.totalCompletions}</Text>
            <Text style={[styles.statTag, { color: colors.secondaryText }]}>Check-ins</Text>
          </View>
        </View>

        {/* Dynamic Appearance / Theme Selector */}
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionHeader, { color: colors.secondaryText, marginBottom: 0 }]}>
              APPEARANCE (LIVE THEME)
            </Text>
            <View style={[styles.activeThemeBadge, { backgroundColor: `${colors.accent}1F` }]}>
              <Text style={[styles.activeThemeBadgeText, { color: colors.accent }]}>
                {mode.toUpperCase()}
              </Text>
            </View>
          </View>
          <Text style={[styles.sectionSubtext, { color: colors.mutedText }]}>
            Instantly switch the app visual mood & contrast.
          </Text>

          <View style={styles.themeSelector}>
            {THEME_OPTIONS.map(t => {
              const isActive = mode === t.id;
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[
                    styles.themeOption,
                    {
                      backgroundColor: colors.secondaryBackground,
                      borderColor: isActive ? colors.accent : colors.border,
                      borderWidth: isActive ? 1.5 : 1,
                    },
                    isActive && {
                      backgroundColor: `${colors.accent}0D`,
                    },
                  ]}
                  onPress={() => {
                    if (t.id === 'pure' && !canAccessFeature('premium_themes', isPro)) setPaywallVisible(true);
                    else setMode(t.id);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={isActive ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={isActive ? colors.accent : colors.mutedText}
                  />

                  <View style={styles.themeOptionTextCol}>
                    <Text
                      style={[
                        styles.themeText,
                        { color: colors.primaryText },
                        isActive && { fontWeight: '700', color: colors.primaryText },
                      ]}
                    >
                      {t.label}
                    </Text>
                    <Text style={[styles.themeDesc, { color: colors.secondaryText }]}>
                      {t.desc}
                    </Text>
                  </View>

                  {/* Visual Color Swatches Preview */}
                  <View style={styles.swatchGroup}>
                    <View style={[styles.swatchDot, { backgroundColor: t.preview.bg, borderColor: colors.border }]} />
                    <View style={[styles.swatchDot, { backgroundColor: t.preview.card, borderColor: colors.border }]} />
                    <View style={[styles.swatchDot, { backgroundColor: t.preview.accent }]} />
                  </View>

                  {isActive && (
                    <View style={[styles.checkBadge, { backgroundColor: colors.accent }]}>
                      <Ionicons name="checkmark" size={12} color="#000" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <TouchableOpacity style={[styles.actionButton, styles.proButton]} onPress={() => setPaywallVisible(true)} activeOpacity={0.75}>
          <Ionicons name={isPro ? 'star' : 'sparkles'} size={20} color={isPro ? '#C8F169' : '#315CFF'} />
          <Text style={[styles.actionButtonText, { color: colors.primaryText }]}>{isPro ? 'Daymark Pro — Manage plan' : 'Explore Daymark Pro'}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.secondaryText} />
        </TouchableOpacity>

        {/* Notifications & Toggles */}
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionHeader, { color: colors.secondaryText }]}>SYSTEM & NOTIFICATIONS</Text>

          <View style={[styles.toggleRow, { borderBottomColor: colors.border }]}>
            <View style={styles.toggleMeta}>
              <Text style={[styles.toggleTitle, { color: colors.primaryText }]}>Daily Reminders</Text>
            <Text style={[styles.toggleSubtitle, { color: colors.mutedText }]}>Use your saved habit reminder schedule</Text>
            </View>
            <Switch
              value={preferences.notifications.daily}
              onValueChange={value => updatePreferences({ notifications: { daily: value } })}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor="#FFF"
            />
          </View>

          <View style={[styles.toggleRow, { borderBottomWidth: 0 }]}>
            <View style={styles.toggleMeta}>
              <Text style={[styles.toggleTitle, { color: colors.primaryText }]}>Haptic Feedback</Text>
              <Text style={[styles.toggleSubtitle, { color: colors.mutedText }]}>Vibrate on habit completion</Text>
            </View>
            <Switch
              value={preferences.hapticsEnabled}
              onValueChange={value => updatePreferences({ hapticsEnabled: value })}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor="#FFF"
            />
          </View>
        </View>

        {/* Data & Account Actions */}
        <View style={[styles.actionGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity style={[styles.actionButton, { borderBottomColor: colors.border }]} onPress={() => setPreferencesVisible(true)} activeOpacity={0.7}>
            <Ionicons name="options-outline" size={20} color={colors.accent} />
            <Text style={[styles.actionButtonText, { color: colors.primaryText }]}>Personalisation & Preferences</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedText} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, { borderBottomColor: colors.border }]} onPress={() => setSearchVisible(true)} activeOpacity={0.7}>
            <Ionicons name="search-outline" size={20} color={colors.accent} />
            <Text style={[styles.actionButtonText, { color: colors.primaryText }]}>Search everything</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedText} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, { borderBottomColor: colors.border }]} onPress={() => setRoutinesVisible(true)} activeOpacity={0.7}>
            <Ionicons name="layers-outline" size={20} color={colors.accent} />
            <Text style={[styles.actionButtonText, { color: colors.primaryText }]}>Routines</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedText} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, { borderBottomColor: colors.border }]} onPress={() => setGoalsVisible(true)} activeOpacity={0.7}>
            <Ionicons name="flag-outline" size={20} color={colors.accent} />
            <Text style={[styles.actionButtonText, { color: colors.primaryText }]}>Goals</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedText} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, { borderBottomColor: colors.border }]} onPress={() => setJournalVisible(true)} activeOpacity={0.7}>
            <Ionicons name="book-outline" size={20} color={colors.accent} />
            <Text style={[styles.actionButtonText, { color: colors.primaryText }]}>Journal</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedText} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, { borderBottomColor: colors.border }]} onPress={() => setAchievementsVisible(true)} activeOpacity={0.7}>
            <Ionicons name="ribbon-outline" size={20} color={colors.accent} />
            <Text style={[styles.actionButtonText, { color: colors.primaryText }]}>Achievements</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedText} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, { borderBottomColor: colors.border }]} onPress={() => setReportsVisible(true)} activeOpacity={0.7}>
            <Ionicons name="document-text-outline" size={20} color={colors.accent} />
            <Text style={[styles.actionButtonText, { color: colors.primaryText }]}>Reports</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedText} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, { borderBottomColor: colors.border }]}
            onPress={restartOnboarding}
            activeOpacity={0.7}
          >
            <Ionicons name="compass-outline" size={20} color={colors.accent} />
            <Text style={[styles.actionButtonText, { color: colors.primaryText }]}>Replay Onboarding Tour</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedText} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { borderBottomColor: colors.border }]}
            onPress={() => { void handleExportData('csv'); }}
            activeOpacity={0.7}
          >
            <Ionicons name="download-outline" size={20} color={colors.primaryText} />
            <Text style={[styles.actionButtonText, { color: colors.primaryText }]}>Export Progress (CSV)</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedText} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, { borderBottomColor: colors.border }]} onPress={() => { void handleExportData('json'); }} activeOpacity={0.7}>
            <Ionicons name="code-download-outline" size={20} color={colors.primaryText} />
            <Text style={[styles.actionButtonText, { color: colors.primaryText }]}>Export Backup (JSON)</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedText} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { borderBottomColor: colors.border }]}
            onPress={() => Alert.alert('Support', 'Daymark Support: contact@daymark.app')}
            activeOpacity={0.7}
          >
            <Ionicons name="help-circle-outline" size={20} color={colors.primaryText} />
            <Text style={[styles.actionButtonText, { color: colors.primaryText }]}>Help & Documentation</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedText} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { borderBottomColor: colors.border }]}
            onPress={() => void handleOpenUrl(process.env.EXPO_PUBLIC_PRIVACY_URL || 'https://shreymistry2022-lang.github.io/Daymark/privacy.html')}
            activeOpacity={0.7}
          >
            <Ionicons name="shield-checkmark-outline" size={20} color={colors.primaryText} />
            <Text style={[styles.actionButtonText, { color: colors.primaryText }]}>Privacy Policy</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedText} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { borderBottomColor: colors.border }]}
            onPress={() => void handleOpenUrl(process.env.EXPO_PUBLIC_TERMS_URL || 'https://shreymistry2022-lang.github.io/Daymark/terms.html')}
            activeOpacity={0.7}
          >
            <Ionicons name="document-text-outline" size={20} color={colors.primaryText} />
            <Text style={[styles.actionButtonText, { color: colors.primaryText }]}>Terms of Service</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedText} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.signOutButton, { borderBottomColor: colors.border }]}
            onPress={handleSignOut}
            activeOpacity={0.7}
          >
            <Ionicons name="log-out-outline" size={20} color={colors.secondaryText} />
            <Text style={[styles.signOutText, { color: colors.primaryText }]}>Sign Out</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.signOutButton]}
            onPress={handleDeleteAccount}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={20} color={colors.error} />
            <Text style={[styles.signOutText, { color: colors.error }]}>Delete Account & Data</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.appVersionContainer}>
          <Text style={[styles.appVersionText, { color: colors.mutedText }]}>Daymark v1.0.0 (Build 1)</Text>
        </View>
      </ScrollView>
      <PaywallModal visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
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
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
  },
  header: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 2,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
  },
  userRole: {
    fontSize: 13,
    marginTop: 2,
  },
  editProfileBtn: {
    padding: spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: spacing.lg,
  },
  statBox: {
    flex: 1,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
  },
  statDigit: {
    fontSize: 22,
    fontWeight: '800',
  },
  statTag: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: '600',
  },
  sectionCard: {
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  sectionSubtext: {
    fontSize: 12,
    marginBottom: spacing.md,
  },
  activeThemeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  activeThemeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  themeSelector: {
    gap: 10,
  },
  themeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: 12,
  },
  themeOptionTextCol: {
    flex: 1,
  },
  swatchGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginRight: 4,
  },
  swatchDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
  },
  checkBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeText: {
    fontSize: 14,
    fontWeight: '500',
  },
  themeDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  toggleMeta: {
    flex: 1,
  },
  toggleTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  toggleSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  actionGroup: {
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
  },
  proButton: {
    backgroundColor: '#171920',
    borderColor: '#363944',
    borderWidth: 1,
    borderRadius: radii.lg,
    marginTop: spacing.md,
  },
  actionButtonText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    marginLeft: spacing.md,
  },
  signOutButton: {
    borderBottomWidth: 0,
  },
  signOutText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    marginLeft: spacing.md,
  },
  appVersionContainer: {
    alignItems: 'center',
    marginVertical: spacing.xl,
  },
  appVersionText: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
});
