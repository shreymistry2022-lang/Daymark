// src/services/feedbackService.ts
import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { supabase, isSupabaseConfigured } from './supabase';

export interface FeedbackSubmission {
  rating: number; // 1 - 5
  sentiment: 'positive' | 'neutral' | 'negative';
  category: 'general' | 'bug' | 'feature_request' | 'design';
  feedbackText?: string;
  userId?: string | null;
  userEmail?: string | null;
}

const FEEDBACK_STORAGE_KEY = '@daymark_feedback_submitted_v1';
const PROMPT_HISTORY_KEY = '@daymark_feedback_prompt_history_v1';

export const PLAY_STORE_URL = 'market://details?id=com.daymark.habittracker.app';
export const PLAY_STORE_WEB_URL = 'https://play.google.com/store/apps/details?id=com.daymark.habittracker.app';

/**
 * Open the Google Play Store page so the user can leave a public 5-star review.
 */
export const openStoreReviewPage = async (): Promise<void> => {
  try {
    const supported = await Linking.canOpenURL(PLAY_STORE_URL);
    if (supported && Platform.OS === 'android') {
      await Linking.openURL(PLAY_STORE_URL);
    } else {
      await Linking.openURL(PLAY_STORE_WEB_URL);
    }
  } catch (error) {
    console.warn('Could not open store review URL, falling back to web:', error);
    try {
      await Linking.openURL(PLAY_STORE_WEB_URL);
    } catch {
      // Ignore
    }
  }
};

/**
 * Saves customer rating and feedback directly to Supabase cloud database.
 */
export const submitCustomerFeedback = async (submission: FeedbackSubmission): Promise<boolean> => {
  const appVersion = Constants.expoConfig?.version || '1.0.5';
  const deviceInfo = `${Platform.OS} (${Platform.Version})`;

  // Save submission locally in case offline
  try {
    await AsyncStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify({
      ...submission,
      submittedAt: new Date().toISOString(),
    }));
  } catch {
    // Non-critical local cache
  }

  // Record to Supabase
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.from('app_feedback').insert({
        user_id: submission.userId || null,
        user_email: submission.userEmail || null,
        rating: submission.rating,
        sentiment: submission.sentiment,
        category: submission.category,
        feedback_text: submission.feedbackText?.trim() || null,
        app_version: appVersion,
        device_info: deviceInfo,
        created_at: new Date().toISOString(),
      });

      if (error) {
        console.warn('Could not save feedback to Supabase:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('Failed to insert feedback:', err);
      return false;
    }
  }

  return true;
};

/**
 * Check if the user has already provided feedback or been prompted recently.
 */
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
