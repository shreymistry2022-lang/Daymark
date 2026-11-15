// src/services/updateService.ts
import { Alert, Platform } from 'react-native';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';

export interface UpdateInfo {
  appVersion: string;
  runtimeVersion: string;
  updateId: string;
  channel: string;
  isEnabled: boolean;
  isEmbeddedLaunch: boolean;
}

export const getUpdateInfo = (): UpdateInfo => {
  const appVersion = Constants.expoConfig?.version || '1.0.5';
  let runtimeVersion = '1.0.5';
  let updateId = 'Embedded';
  let channel = 'preview';
  let isEnabled = false;
  let isEmbeddedLaunch = true;

  try {
    isEnabled = Boolean(Updates.isEnabled);
    runtimeVersion = Updates.runtimeVersion || appVersion;
    updateId = Updates.updateId ? Updates.updateId.slice(0, 8) : 'Embedded';
    channel = Updates.channel || 'preview';
    isEmbeddedLaunch = Boolean(Updates.isEmergencyLaunch);
  } catch {
    // Non-native or testing environments
  }

  return {
    appVersion,
    runtimeVersion,
    updateId,
    channel,
    isEnabled,
    isEmbeddedLaunch,
  };
};

/**
 * Checks for updates over the air, downloads if available, and prompts user to reload.
 */
export const checkForAppUpdates = async (interactive = true): Promise<boolean> => {
  if (__DEV__ || Platform.OS === 'web') {
    if (interactive) {
      Alert.alert(
        'Development Mode',
        'Over-the-air updates are active in installed APK builds. While developing, code changes reload live in 0.5s via Metro bundler.'
      );
    }
    return false;
  }

  try {
    if (!Updates.isEnabled) {
      if (interactive) {
        Alert.alert(
          'Updates Disabled',
          'Automatic over-the-air updates are not enabled on this build.'
        );
      }
      return false;
    }

    const check = await Updates.checkForUpdateAsync();
    if (check.isAvailable) {
      const fetchResult = await Updates.fetchUpdateAsync();
      if (fetchResult.isNew) {
        Alert.alert(
          'Update Ready 🚀',
          'A new update of Daymark has been downloaded! Tap Reload to apply it now.',
          [
            { text: 'Later', style: 'cancel' },
            {
              text: 'Reload Now',
              style: 'default',
              onPress: async () => {
                try {
                  await Updates.reloadAsync();
                } catch (e) {
                  console.warn('Failed to reload:', e);
                }
              },
            },
          ]
        );
        return true;
      }
    } else {
      if (interactive) {
        Alert.alert(
          'Up to Date ✨',
          `You are already running the latest version of Daymark.\n(Update ID: ${Updates.updateId ? Updates.updateId.slice(0, 8) : 'Embedded'})`
        );
      }
    }
    return false;
  } catch (error: any) {
    console.warn('Update check failed:', error);
    if (interactive) {
      Alert.alert(
        'Update Check',
        `Could not fetch update: ${error?.message || 'Please check your internet connection and try again.'}`
      );
    }
    return false;
  }
};
