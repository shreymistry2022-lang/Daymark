import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { LocalCredential } from './localCredentialStore';

const LEGACY_KEY = '@daymark_registered_users';
const credentialKey = (email: string) => `daymark.local-credential.${encodeURIComponent(email.toLowerCase())}`;

export const getLocalCredential = async (email: string): Promise<LocalCredential | null> => {
  const key = credentialKey(email);
  const saved = await SecureStore.getItemAsync(key);
  if (saved) return JSON.parse(saved) as LocalCredential;
  const legacy = await AsyncStorage.getItem(LEGACY_KEY);
  if (!legacy) return null;
  const records = JSON.parse(legacy) as Record<string, LocalCredential>;
  const record = records[email.toLowerCase()];
  if (!record) return null;
  await SecureStore.setItemAsync(key, JSON.stringify(record));
  delete records[email.toLowerCase()];
  if (Object.keys(records).length) await AsyncStorage.setItem(LEGACY_KEY, JSON.stringify(records));
  else await AsyncStorage.removeItem(LEGACY_KEY);
  return record;
};

export const saveLocalCredential = async (credential: LocalCredential): Promise<boolean> => {
  await SecureStore.setItemAsync(credentialKey(credential.email), JSON.stringify(credential));
  return true;
};

export const deleteLocalCredential = async (email: string): Promise<boolean> => {
  await SecureStore.deleteItemAsync(credentialKey(email));
  return true;
};

export const migrateLegacyCredentials = async (): Promise<void> => {
  const legacy = await AsyncStorage.getItem(LEGACY_KEY);
  if (!legacy) return;
  const records = JSON.parse(legacy) as Record<string, LocalCredential>;
  for (const [email, record] of Object.entries(records)) {
    await SecureStore.setItemAsync(credentialKey(email), JSON.stringify(record));
  }
  await AsyncStorage.removeItem(LEGACY_KEY);
};
