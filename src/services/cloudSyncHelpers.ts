import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import type { AppUser } from './AuthProvider';
import { isSupabaseConfigured, supabase } from './supabase';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isValidCloudUserId = (id?: string | null): id is string =>
  Boolean(id && UUID_REGEX.test(id));

export const isValidUuid = (id?: string | null): id is string =>
  Boolean(id && UUID_REGEX.test(id));

export const createUuid = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const random = Math.floor(Math.random() * 16);
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });

/** Detects network/offline/transient transport or missing-schema errors that should queue silently. */
export const isTransientCloudError = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') return false;
  const record = err as Record<string, unknown>;
  const msg = String(record.message ?? '').toLowerCase();
  const details = String(record.details ?? '').toLowerCase();
  const code = String(record.code ?? '');
  const status = typeof record.status === 'number' ? record.status : undefined;
  return (
    status === 0 ||
    status === 404 ||
    status === 408 ||
    status === 429 ||
    (status !== undefined && status >= 500) ||
    code === 'PGRST205' ||
    code === 'PGRST204' ||
    code === '42P01' ||
    code === '42703' ||
    msg.includes('failed to fetch') ||
    msg.includes('network request failed') ||
    msg.includes('network error') ||
    msg.includes('load failed') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('abort') ||
    msg.includes('offline') ||
    msg.includes('schema cache') ||
    msg.includes('could not find the table') ||
    msg.includes('does not exist') ||
    details.includes('failed to fetch') ||
    details.includes('network')
  );
};

/** Detects RLS ownership or primary-key conflicts from cross-account/legacy local IDs. */
export const isOwnershipOrConflictError = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') return false;
  const record = err as Record<string, unknown>;
  const code = String(record.code ?? '');
  const msg = String(record.message ?? '').toLowerCase();
  return (
    code === '42501' ||
    code === '23505' ||
    msg.includes('row-level security') ||
    msg.includes('duplicate key')
  );
};

/**
 * Resolves an active, authenticated Supabase session and valid UUID user ID.
 * Refreshes expired/expiring JWTs and falls back to `supabase.auth.getSession()`
 * when React context state has not yet propagated.
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

  const expiresAtMs = (activeSession.expires_at ?? 0) * 1000;
  if (expiresAtMs > 0 && expiresAtMs <= Date.now() + 30_000) {
    try {
      const { data: refreshed } = await supabase.auth.refreshSession();
      if (refreshed?.session) {
        activeSession = refreshed.session;
      }
    } catch {
      // Keep active session; transient network errors will retry later.
    }
  }

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
