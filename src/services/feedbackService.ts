// src/services/feedbackService.ts
import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

export interface FeedbackSubmission {
  rating: number; // 1 - 5
  sentiment: 'positive' | 'neutral' | 'negative';
  category: 'general' | 'bug' | 'feature_request' | 'design';
  feedbackText?: string;
  userId?: string | null;
  userEmail?: string | null;
}

const FEEDBACK_STORAGE_KEY = '@daymark_feedback_submitted_v1';
const PROMPT_HISTORY_KEY = '@daymark_feedback_prompted_v1';

const APP_STORE_URL = 'https://apps.apple.com/app/id6670614549?action=write-review';
const PLAY_STORE_URL = 'market://details?id=com.daymark.app';

export const getStoreReviewUrl = (): string =>
  Platform.OS === 'ios' ? APP_STORE_URL : PLAY_STORE_URL;

export const openStoreReview = async (): Promise<void> => {
  const url = getStoreReviewUrl();
  try {
    const supported = await Linking.canOpenURL(url);
    if (supported) await Linking.openURL(url);
  } catch (err) {
    console.warn('Could not open store review URL:', err);
  }
};

export const submitCustomerFeedback = async (submission: FeedbackSubmission): Promise<boolean> => {
  const appVersion = Constants.expoConfig?.version ?? 'unknown';
  const deviceInfo = `${Platform.OS} (${Platform.Version})`;
  try {
    await AsyncStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify({
      ...submission,
      appVersion,
      deviceInfo,
      submittedAt: new Date().toISOString(),
    }));
  } catch {
    // Non-critical local cache
  }
  return true;
};

export const hasUserProvidedFeedback = async (): Promise<boolean> => {
  try {
    const recorded = await AsyncStorage.getItem(FEEDBACK_STORAGE_KEY);
    return Boolean(recorded);
  } catch {
    return false;
  }
};

export const markFeedbackPrompted = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(PROMPT_HISTORY_KEY, new Date().toISOString());
  } catch {
    // Non-critical
  }
};
