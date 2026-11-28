// src/services/googleDriveBackup.ts
// Google Drive AppDataFolder backup & restore using @react-native-google-signin/google-signin.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const BACKUP_FILE_NAME = 'daymark-backup.json';
const DRIVE_STATE_KEY = '@daymark_gdrive_backup_state_v1';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface GoogleDriveBackupState {
  enabled: boolean;
  email: string | null;
  lastBackupAt: string | null;
}

export interface DriveBackupFileInfo {
  id: string;
  name: string;
  modifiedTime?: string;
  size?: string;
}

const isExpoGo = Constants.appOwnership === 'expo';

let configured = false;

const getGoogleSignin = () => {
  if (Platform.OS === 'web' || isExpoGo) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@react-native-google-signin/google-signin');
    return mod?.GoogleSignin ?? null;
  } catch {
    return null;
  }
};

const ensureConfigured = () => {
  const gs = getGoogleSignin();
  if (!gs) return null;
  if (!configured) {
    const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined;
    const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined;
    gs.configure({
      scopes: [DRIVE_SCOPE],
      ...(webClientId ? { webClientId } : {}),
      ...(iosClientId ? { iosClientId } : {}),
      offlineAccess: false,
    });
    configured = true;
  }
  return gs;
};

export const isGoogleDriveSupported = (): boolean => Boolean(getGoogleSignin());

export const getGoogleDriveState = async (): Promise<GoogleDriveBackupState> => {
  try {
    const raw = await AsyncStorage.getItem(DRIVE_STATE_KEY);
    if (raw) return JSON.parse(raw) as GoogleDriveBackupState;
  } catch {
    // ignore
  }
  return { enabled: false, email: null, lastBackupAt: null };
};

const saveGoogleDriveState = async (state: GoogleDriveBackupState) => {
  await AsyncStorage.setItem(DRIVE_STATE_KEY, JSON.stringify(state)).catch(() => {});
};

const getAccessToken = async (interactive: boolean): Promise<{ token: string; email: string | null }> => {
  const gs = ensureConfigured();
  if (!gs) {
    throw new Error('Google Drive backup requires a development or production build (not available in Expo Go or Web).');
  }

  if (Platform.OS === 'android') {
    await gs.hasPlayServices({ showPlayServicesUpdateDialog: true });
  }

  let email: string | null = gs.getCurrentUser()?.user?.email ?? null;
  if (!email) {
    const silent = await gs.signInSilently().catch(() => null);
    if (silent?.type === 'success') {
      email = silent.data.user.email;
    } else if (interactive) {
      const res = await gs.signIn();
      if (res.type !== 'success') {
        throw new Error('CANCELLED');
      }
      email = res.data.user.email;
      // Ensure drive.appdata scope is granted
      if (!res.data.scopes?.includes(DRIVE_SCOPE)) {
        const added = await gs.addScopes({ scopes: [DRIVE_SCOPE] });
        if (added && added.type !== 'success') {
          throw new Error('Google Drive permission was not granted.');
        }
      }
    } else {
      throw new Error('Not signed in to Google.');
    }
  }

  const tokens = await gs.getTokens();
  if (!tokens?.accessToken) {
    throw new Error('Could not obtain Google Drive access token.');
  }
  return { token: tokens.accessToken, email };
};

const findBackupFile = async (accessToken: string): Promise<DriveBackupFileInfo | null> => {
  const q = encodeURIComponent(`name='${BACKUP_FILE_NAME}' and trashed=false`);
  const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,name,modifiedTime,size)`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Google Drive lookup failed (${res.status}): ${errText}`);
  }
  const data = (await res.json()) as { files?: DriveBackupFileInfo[] };
  return data.files?.[0] ?? null;
};

export const connectAndBackupToGoogleDrive = async (
  jsonPayload: string
): Promise<{ state: GoogleDriveBackupState; error?: string; cancelled?: boolean }> => {
  try {
    const { token, email } = await getAccessToken(true);
    await uploadPayloadWithToken(token, jsonPayload);
    const next: GoogleDriveBackupState = {
      enabled: true,
      email,
      lastBackupAt: new Date().toISOString(),
    };
    await saveGoogleDriveState(next);
    return { state: next };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Google Drive backup failed.';
    if (msg === 'CANCELLED') {
      return { state: await getGoogleDriveState(), cancelled: true };
    }
    return { state: await getGoogleDriveState(), error: msg };
  }
};

const uploadPayloadWithToken = async (accessToken: string, jsonPayload: string): Promise<void> => {
  const existing = await findBackupFile(accessToken);

  if (existing) {
    const res = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: jsonPayload,
      }
    );
    if (!res.ok) {
      throw new Error(`Google Drive update failed (${res.status}).`);
    }
    return;
  }

  const boundary = 'daymark_drive_boundary_v1';
  const metadata = JSON.stringify({
    name: BACKUP_FILE_NAME,
    parents: ['appDataFolder'],
    mimeType: 'application/json',
  });
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${jsonPayload}\r\n` +
    `--${boundary}--`;

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`Google Drive upload failed (${res.status}).`);
  }
};

export const backupNowToGoogleDrive = async (
  jsonPayload: string
): Promise<{ state: GoogleDriveBackupState; error?: string }> => {
  try {
    const { token, email } = await getAccessToken(true);
    await uploadPayloadWithToken(token, jsonPayload);
    const next: GoogleDriveBackupState = {
      enabled: true,
      email,
      lastBackupAt: new Date().toISOString(),
    };
    await saveGoogleDriveState(next);
    return { state: next };
  } catch (err: unknown) {
    return {
      state: await getGoogleDriveState(),
      error: err instanceof Error ? err.message : 'Google Drive backup failed.',
    };
  }
};

export const restoreFromGoogleDrive = async (): Promise<{
  payload?: string;
  email?: string | null;
  modifiedTime?: string;
  error?: string;
  cancelled?: boolean;
}> => {
  try {
    const { token, email } = await getAccessToken(true);
    const existing = await findBackupFile(token);
    if (!existing) {
      return { error: 'No Daymark backup was found in this Google Drive account.' };
    }
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${existing.id}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return { error: `Could not download backup (${res.status}).` };
    }
    const payload = await res.text();
    return { payload, email, modifiedTime: existing.modifiedTime };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Could not restore from Google Drive.';
    if (msg === 'CANCELLED') return { cancelled: true };
    return { error: msg };
  }
};

export const disconnectGoogleDrive = async (): Promise<GoogleDriveBackupState> => {
  const gs = ensureConfigured();
  if (gs) {
    await gs.signOut().catch(() => {});
  }
  const next: GoogleDriveBackupState = { enabled: false, email: null, lastBackupAt: null };
  await saveGoogleDriveState(next);
  return next;
};

export const maybeRunDailyGoogleDriveBackup = async (getPayload: () => string): Promise<void> => {
  if (!isGoogleDriveSupported()) return;
  const state = await getGoogleDriveState();
  if (!state.enabled) return;

  if (state.lastBackupAt) {
    const elapsed = Date.now() - new Date(state.lastBackupAt).getTime();
    if (elapsed < ONE_DAY_MS) return;
  }

  try {
    const { token, email } = await getAccessToken(false);
    await uploadPayloadWithToken(token, getPayload());
    await saveGoogleDriveState({
      enabled: true,
      email: email ?? state.email,
      lastBackupAt: new Date().toISOString(),
    });
  } catch {
    // Silent background retry next day / foreground
  }
};
