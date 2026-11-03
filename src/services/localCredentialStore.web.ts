import AsyncStorage from '@react-native-async-storage/async-storage';
import { LocalCredential } from './localCredentialStore';

const LEGACY_KEY = '@daymark_registered_users';
export const getLocalCredential = async (_email: string): Promise<LocalCredential | null> => null;
export const saveLocalCredential = async (_credential: LocalCredential): Promise<boolean> => false;
export const deleteLocalCredential = async (_email: string): Promise<boolean> => false;
export const migrateLegacyCredentials = async (): Promise<void> => {
  // Browser storage cannot protect reusable passwords like a native secure enclave/keychain.
  await AsyncStorage.removeItem(LEGACY_KEY);
};
