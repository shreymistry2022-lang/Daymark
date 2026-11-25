import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import type { AppUser } from './AuthProvider';
import { isSupabaseConfigured, supabase } from './supabase';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isValidCloudUserId = (id?: string | null): id is string =>
  Boolean(id && UUID_REGEX.test(id));

/**
 * Resolves an active, authenticated Supabase session and valid UUID user ID.
 * Falls back to `supabase.auth.getSession()` when React context state has not
 * yet propagated (e.g. immediately after sign-up during onboarding).
 */
export const resolveCloudAuth = async (
  user?: AppUser | null,
  session?: Session | null,
): Promise<{ userId: string; session: Session } | null> => {
  if (!isSupabaseConfigured || user?.isGuest) return null;

  let activeSession = session ?? null;
  if (!activeSession) {
    try {
      const { data } = await supabase.auth.getSession();
      activeSession = data?.session ?? null;
    } catch {
      activeSession = null;
    }
  }
  if (!activeSession) return null;

  const userId =
    user && !user.isGuest && isValidCloudUserId(user.id)
      ? user.id
      : activeSession.user?.id;

  if (!isValidCloudUserId(userId)) return null;
  return { userId, session: activeSession };
};

export const readStorageJson = async <T>(key: string, fallback: T): Promise<T> => {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

export const writeStorageJson = async <T>(key: string, value: T): Promise<void> => {
  await AsyncStorage.setItem(key, JSON.stringify(value));
};
