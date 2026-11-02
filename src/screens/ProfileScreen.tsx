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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing, radii, THEME_OPTIONS } from '../theme/tokens';
import { useHabits } from '../services/HabitContext';
import { useTheme } from '../theme/ThemeProvider';
import { useAuth } from '../services/AuthProvider';

export const ProfileScreen = () => {
  const insets = useSafeAreaInsets();
  const { habits, stats, restartOnboarding, exportDataJson } = useHabits();
  const { mode, setMode, colors } = useTheme();
  const { user, isGuest, signOut } = useAuth();

  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);

  const handleExportData = () => {
    const json = exportDataJson();
    Alert.alert(
      'Export Recorded Data',
      `Data export ready (${habits.length} habits, ${stats.totalCompletions} total check-ins):\n\n${json.slice(0, 180)}...`,
      [{ text: 'Copy / Done' }, { text: 'Close', style: 'cancel' }]
    );
  };

  const handleSignOut = () => {
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
                  onPress={() => setMode(t.id)}
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

        {/* Notifications & Toggles */}
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionHeader, { color: colors.secondaryText }]}>SYSTEM & NOTIFICATIONS</Text>

          <View style={[styles.toggleRow, { borderBottomColor: colors.border }]}>
            <View style={styles.toggleMeta}>
              <Text style={[styles.toggleTitle, { color: colors.primaryText }]}>Daily Reminders</Text>
              <Text style={[styles.toggleSubtitle, { color: colors.mutedText }]}>Receive prompt at 08:00 AM</Text>
            </View>
            <Switch
              value={remindersEnabled}
              onValueChange={setRemindersEnabled}
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
              value={hapticsEnabled}
              onValueChange={setHapticsEnabled}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor="#FFF"
            />
          </View>
        </View>

        {/* Data & Account Actions */}
        <View style={[styles.actionGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
            onPress={handleExportData}
            activeOpacity={0.7}
          >
            <Ionicons name="download-outline" size={20} color={colors.primaryText} />
            <Text style={[styles.actionButtonText, { color: colors.primaryText }]}>Export Progress (CSV)</Text>
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
            style={[styles.actionButton, styles.signOutButton]}
            onPress={handleSignOut}
            activeOpacity={0.7}
          >
            <Ionicons name="log-out-outline" size={20} color={colors.error} />
            <Text style={[styles.signOutText, { color: colors.error }]}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
});
