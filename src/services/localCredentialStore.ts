import AsyncStorage from '@react-native-async-storage/async-storage';

export interface LocalCredential {
  id: string;
  email: string;
  password: string;
  fullName: string;
}

const STORAGE_PREFIX = '@daymark_local_cred_';
const credKey = (email: string) => `${STORAGE_PREFIX}${email.toLowerCase()}`;

export const getLocalCredential = async (email: string): Promise<LocalCredential | null> => {
  try {
    const raw = await AsyncStorage.getItem(credKey(email));
    return raw ? JSON.parse(raw) as LocalCredential : null;
  } catch {
    return null;
  }
};

export const saveLocalCredential = async (credential: LocalCredential): Promise<boolean> => {
  try {
    await AsyncStorage.setItem(credKey(credential.email), JSON.stringify(credential));
    return true;
  } catch {
    return false;
  }
};

export const deleteLocalCredential = async (email: string): Promise<boolean> => {
  try {
    await AsyncStorage.removeItem(credKey(email));
    return true;
  } catch {
    return false;
  }
};

export const migrateLegacyCredentials = async (): Promise<void> => undefined;

