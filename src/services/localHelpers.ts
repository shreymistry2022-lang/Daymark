// src/services/localHelpers.ts
// Local-only utilities: UUID generation and AsyncStorage helpers.
// Replaces cloudSyncHelpers.ts (Supabase-specific functions removed).
import AsyncStorage from '@react-native-async-storage/async-storage';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isValidUuid = (id?: string | null): id is string =>
  Boolean(id && UUID_REGEX.test(id));

export const createUuid = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const random = Math.floor(Math.random() * 16);
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });

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
