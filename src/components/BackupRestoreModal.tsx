// src/components/BackupRestoreModal.tsx
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useHabits } from '../services/HabitContext';
import { radii, spacing } from '../theme/tokens';
import {
  backupNowToGoogleDrive,
  connectAndBackupToGoogleDrive,
  disconnectGoogleDrive,
  getGoogleDriveState,
  GoogleDriveBackupState,
  restoreFromGoogleDrive,
} from '../services/googleDriveBackup';

const LOCAL_BACKUP_KEY = '@daymark_local_backup_snapshot_v1';

interface BackupSnapshotMeta {
  savedAt: string;
  totalHabits: number;
  payload: string;
}

interface BackupRestoreModalProps {
  visible: boolean;
  onClose: () => void;
  onExportJson: () => Promise<void>;
  onExportCsv: () => Promise<void>;
}

export const BackupRestoreModal = ({
  visible,
  onClose,
  onExportJson,
  onExportCsv,
}: BackupRestoreModalProps) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { allHabits, exportDataJson, importHabitsJson } = useHabits();
  const [driveState, setDriveState] = useState<GoogleDriveBackupState>({
    enabled: false,
    email: null,
    lastBackupAt: null,
  });
  const [driveBusy, setDriveBusy] = useState(false);
  const [snapshotMeta, setSnapshotMeta] = useState<BackupSnapshotMeta | null>(null);
  const [showRestorePanel, setShowRestorePanel] = useState(false);
  const [pastedJson, setPastedJson] = useState('');

  useEffect(() => {
    if (!visible) return;
    void getGoogleDriveState().then(setDriveState);
    AsyncStorage.getItem(LOCAL_BACKUP_KEY)
      .then(raw => {
        if (raw) setSnapshotMeta(JSON.parse(raw) as BackupSnapshotMeta);
        else setSnapshotMeta(null);
      })
      .catch(() => setSnapshotMeta(null));
  }, [visible]);

  const handleClose = () => {
    setShowRestorePanel(false);
    setPastedJson('');
    onClose();
  };

  const handleTurnOnDrive = async () => {
    setDriveBusy(true);
    const res = await connectAndBackupToGoogleDrive(exportDataJson());
    setDriveBusy(false);
    setDriveState(res.state);
    if (res.cancelled) return;
    if (res.error) {
      Alert.alert('Google Drive Backup', res.error);
      return;
    }
    Alert.alert(
      'Google Drive Backup Enabled',
      `Backed up ${allHabits.length} habit${allHabits.length === 1 ? '' : 's'} to ${res.state.email ?? 'Google Drive'}. Daymark will now back up once a day.`
    );
  };

  const handleDriveBackupNow = async () => {
    setDriveBusy(true);
    const res = await backupNowToGoogleDrive(exportDataJson());
    setDriveBusy(false);
    setDriveState(res.state);
    if (res.error) {
      Alert.alert('Backup Failed', res.error);
      return;
    }
    Alert.alert('Backup Complete', 'Your habits are backed up to Google Drive.');
  };

  const handleTurnOffDrive = () => {
    Alert.alert(
      'Turn off Google Drive backup?',
      'Your existing backup file in Google Drive will stay safe, but automatic daily backups will stop.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Turn Off',
          style: 'destructive',
          onPress: async () => {
            const next = await disconnectGoogleDrive();
            setDriveState(next);
          },
        },
      ]
    );
  };

  const handleRestoreDrive = async () => {
    setDriveBusy(true);
    const res = await restoreFromGoogleDrive();
    setDriveBusy(false);
    if (res.cancelled) return;
    if (res.error || !res.payload) {
      Alert.alert('Restore from Google Drive', res.error || 'No backup found.');
      return;
    }
    const imported = importHabitsJson(res.payload);
    if (imported.error) {
      Alert.alert('Restore Failed', imported.error);
      return;
    }
    Alert.alert(
      'Backup Restored',
      `Restored ${imported.count ?? 0} habit${imported.count === 1 ? '' : 's'} from ${res.email ?? 'Google Drive'}.`
    );
    setShowRestorePanel(false);
  };

  const handleSaveLocalBackup = async () => {
    try {
      const payload = exportDataJson();
      const meta: BackupSnapshotMeta = {
        savedAt: new Date().toISOString(),
        totalHabits: allHabits.length,
        payload,
      };
      await AsyncStorage.setItem(LOCAL_BACKUP_KEY, JSON.stringify(meta));
      setSnapshotMeta(meta);
      Alert.alert(
        'Device Backup Saved',
        `Saved ${allHabits.length} habit${allHabits.length === 1 ? '' : 's'} to this device.`
      );
    } catch {
      Alert.alert('Backup Failed', 'Could not save the backup snapshot on this device.');
    }
  };

  const handleRestoreSnapshot = () => {
    if (!snapshotMeta) return;
    const res = importHabitsJson(snapshotMeta.payload);
    if (res.error) {
      Alert.alert('Restore Failed', res.error);
      return;
    }
    Alert.alert('Backup Restored', `Restored ${res.count ?? 0} habit${res.count === 1 ? '' : 's'} from your device backup.`);
    setShowRestorePanel(false);
  };

  const handleRestorePasted = () => {
    const trimmed = pastedJson.trim();
    if (!trimmed) {
      Alert.alert('Paste Backup JSON', 'Paste the contents of a Daymark JSON export file first.');
      return;
    }
    const res = importHabitsJson(trimmed);
    if (res.error) {
      Alert.alert('Restore Failed', res.error);
      return;
    }
    Alert.alert('Backup Restored', `Restored ${res.count ?? 0} habit${res.count === 1 ? '' : 's'}.`);
    setPastedJson('');
    setShowRestorePanel(false);
  };

  const formattedDriveDate = driveState.lastBackupAt
    ? new Date(driveState.lastBackupAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  const formattedSnapshotDate = snapshotMeta
    ? new Date(snapshotMeta.savedAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        {/* Centered Header with Circle Back Button (HabitKit style) */}
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Close Backup & Restore"
            onPress={handleClose}
            style={[styles.circleBackBtn, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}
            activeOpacity={0.75}
          >
            <Ionicons name="chevron-back" size={20} color={colors.primaryText} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.primaryText }]}>Backup & Restore</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Top Hero Card: Back up your habits (matches HabitKit screenshot) */}
          <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.heroTopRow}>
              <View style={[styles.heroIconBox, { backgroundColor: colors.secondaryBackground }]}>
                <Ionicons
                  name={driveState.enabled ? 'cloud-done-outline' : 'cloud-upload-outline'}
                  size={22}
                  color={driveState.enabled ? '#10B981' : colors.secondaryText}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.heroTitle, { color: colors.primaryText }]}>
                  {driveState.enabled ? 'Google Drive backup is on' : 'Back up your habits'}
                </Text>
                <Text style={[styles.heroSub, { color: colors.secondaryText }]}>
                  {driveState.enabled
                    ? `Backing up once a day to ${driveState.email ?? 'your Google Drive'}.`
                    : 'Daymark backs up to Google Drive once a day, so a new device never means starting over.'}
                </Text>
                {formattedDriveDate && (
                  <Text style={[styles.lastBackupText, { color: colors.accent }]}>
                    Last Google Drive backup: {formattedDriveDate}
                  </Text>
                )}
              </View>
            </View>

            {driveState.enabled ? (
              <View style={styles.driveActionsRow}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  disabled={driveBusy}
                  style={[styles.heroPillBtn, { flex: 1, backgroundColor: colors.accent }]}
                  onPress={() => void handleDriveBackupNow()}
                >
                  {driveBusy ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="cloud-upload-outline" size={18} color="#FFFFFF" />
                      <Text style={styles.heroPillText}>Back up now</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.75}
                  disabled={driveBusy}
                  style={[styles.turnOffBtn, { borderColor: colors.border, backgroundColor: colors.secondaryBackground }]}
                  onPress={handleTurnOffDrive}
                >
                  <Text style={[styles.turnOffText, { color: colors.secondaryText }]}>Turn off</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={driveBusy}
                style={[styles.heroPillBtn, { backgroundColor: colors.accent }]}
                onPress={() => void handleTurnOnDrive()}
              >
                {driveBusy ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="cloud-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.heroPillText}>Turn on Google Drive backup</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* RESTORE Section */}
          <Text style={[styles.sectionLabel, { color: colors.secondaryText }]}>RESTORE</Text>
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => setShowRestorePanel(p => !p)}
            style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={[styles.rowIconBox, { backgroundColor: '#10B98120' }]}>
              <Ionicons name="refresh-circle-outline" size={20} color="#10B981" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.primaryText }]}>Restore a backup</Text>
              <Text style={[styles.rowSub, { color: colors.secondaryText }]}>
                From Google Drive, this device or a file
              </Text>
            </View>
            <Ionicons
              name={showRestorePanel ? 'chevron-down' : 'chevron-forward'}
              size={18}
              color={colors.mutedText}
            />
          </TouchableOpacity>

          {showRestorePanel && (
            <View style={[styles.restorePanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TouchableOpacity
                style={[styles.driveRestoreBtn, { backgroundColor: '#10B981' }]}
                onPress={() => void handleRestoreDrive()}
                disabled={driveBusy}
                activeOpacity={0.85}
              >
                {driveBusy ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="logo-google" size={16} color="#FFFFFF" />
                    <Text style={styles.driveRestoreBtnText}>Restore from Google Drive</Text>
                  </>
                )}
              </TouchableOpacity>

              {snapshotMeta ? (
                <View style={[styles.snapshotBox, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.snapshotTitle, { color: colors.primaryText }]}>Device Snapshot</Text>
                    <Text style={[styles.snapshotSub, { color: colors.secondaryText }]}>
                      {formattedSnapshotDate} · {snapshotMeta.totalHabits} habits
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: colors.accent }]}
                    onPress={handleRestoreSnapshot}
                  >
                    <Text style={styles.smallBtnText}>Restore</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.snapshotBox, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}
                  onPress={() => void handleSaveLocalBackup()}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.snapshotTitle, { color: colors.primaryText }]}>Save a Device Snapshot</Text>
                    <Text style={[styles.snapshotSub, { color: colors.secondaryText }]}>
                      Store a local restore point on this phone
                    </Text>
                  </View>
                  <Ionicons name="save-outline" size={18} color={colors.accent} />
                </TouchableOpacity>
              )}

              <Text style={[styles.pasteLabel, { color: colors.secondaryText }]}>OR PASTE EXPORTED JSON</Text>
              <TextInput
                multiline
                value={pastedJson}
                onChangeText={setPastedJson}
                placeholder='{"format": "daymark-export-v1", "habits": [...]}'
                placeholderTextColor={colors.mutedText}
                style={[
                  styles.jsonInput,
                  {
                    backgroundColor: colors.secondaryBackground,
                    borderColor: colors.border,
                    color: colors.primaryText,
                  },
                ]}
              />
              <TouchableOpacity
                style={[styles.restoreJsonBtn, { backgroundColor: colors.accent }]}
                onPress={handleRestorePasted}
                activeOpacity={0.85}
              >
                <Text style={styles.restoreJsonBtnText}>Restore from JSON</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={[styles.helperCaption, { color: colors.mutedText }]}>
            New phone or tablet? Install Daymark, tap Restore a backup and choose the Google account you backed up with.
          </Text>

          {/* YOUR OWN COPY Section */}
          <Text style={[styles.sectionLabel, { color: colors.secondaryText }]}>YOUR OWN COPY</Text>
          <View style={[styles.groupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => void onExportJson()}
              style={[styles.groupRow, { borderBottomWidth: 1, borderBottomColor: colors.border }]}
            >
              <View style={[styles.rowIconBox, { backgroundColor: `${colors.accent}20` }]}>
                <Ionicons name="document-text-outline" size={19} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.primaryText }]}>Export a copy</Text>
                <Text style={[styles.rowSub, { color: colors.secondaryText }]}>Save a JSON file anywhere you like</Text>
              </View>
              <Ionicons name="share-outline" size={18} color={colors.mutedText} />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => void onExportCsv()}
              style={styles.groupRow}
            >
              <View style={[styles.rowIconBox, { backgroundColor: '#10B98120' }]}>
                <Ionicons name="grid-outline" size={19} color="#10B981" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.primaryText }]}>Export spreadsheet (CSV)</Text>
                <Text style={[styles.rowSub, { color: colors.secondaryText }]}>For Excel, Numbers, or Sheets</Text>
              </View>
              <Ionicons name="share-outline" size={18} color={colors.mutedText} />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  circleBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  headerSpacer: { width: 38 },
  scrollContent: { paddingHorizontal: spacing.lg },
  heroCard: {
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    gap: 16,
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  heroIconBox: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  heroSub: { fontSize: 13, lineHeight: 19 },
  lastBackupText: { fontSize: 12, fontWeight: '600', marginTop: 6 },
  heroPillBtn: {
    height: 48,
    borderRadius: radii.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  heroPillText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  driveActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  turnOffBtn: {
    height: 48,
    paddingHorizontal: 18,
    borderRadius: radii.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  turnOffText: { fontSize: 14, fontWeight: '700' },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 4,
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  rowIconBox: {
    width: 38,
    height: 38,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowSub: { fontSize: 12, marginTop: 2 },
  helperCaption: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
    marginBottom: spacing.lg,
    marginHorizontal: 4,
  },
  groupCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  restorePanel: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: 14,
    marginTop: 8,
    gap: 12,
  },
  driveRestoreBtn: {
    height: 44,
    borderRadius: radii.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  driveRestoreBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  snapshotBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  snapshotTitle: { fontSize: 14, fontWeight: '700' },
  snapshotSub: { fontSize: 12, marginTop: 2 },
  smallBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.full,
  },
  smallBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  pasteLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  jsonInput: {
    borderRadius: radii.md,
    borderWidth: 1,
    padding: 10,
    minHeight: 84,
    fontSize: 12,
    textAlignVertical: 'top',
  },
  restoreJsonBtn: {
    height: 42,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restoreJsonBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
