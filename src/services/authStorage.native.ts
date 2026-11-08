import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const CHUNK_SIZE = 1600;
const countKey = (key: string) => `${key}:secure-chunk-count`;
const chunkKey = (key: string, index: number) => `${key}:secure-chunk:${index}`;

const getCount = async (key: string) => {
  try {
    const val = await SecureStore.getItemAsync(countKey(key));
    return Number(val ?? 0);
  } catch {
    return 0;
  }
};

const removeChunks = async (key: string, count: number) => {
  if (count <= 0) return;
  await Promise.all(
    Array.from({ length: count }, (_, index) =>
      SecureStore.deleteItemAsync(chunkKey(key, index)).catch(() => {})
    )
  );
};

const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const count = await getCount(key);
      if (count > 0) {
        const chunks = await Promise.all(
          Array.from({ length: count }, (_, index) => SecureStore.getItemAsync(chunkKey(key, index)))
        );
        if (!chunks.some(chunk => chunk == null)) {
          return chunks.join('');
        }
      }
      const secureValue = await SecureStore.getItemAsync(key);
      if (secureValue !== null) return secureValue;
    } catch {
      // Keystore unavailable on device, fall back to AsyncStorage
    }

    // Fallback to AsyncStorage
    return AsyncStorage.getItem(key);
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      const previousCount = await getCount(key);
      if (value.length <= CHUNK_SIZE) {
        await SecureStore.setItemAsync(key, value);
        await SecureStore.deleteItemAsync(countKey(key)).catch(() => {});
        await removeChunks(key, previousCount);
        return;
      }
      await SecureStore.deleteItemAsync(key).catch(() => {});
      const chunks: string[] = [];
      for (let index = 0; index < value.length; index += CHUNK_SIZE) {
        chunks.push(value.slice(index, index + CHUNK_SIZE));
      }
      await Promise.all(
        chunks.map((chunk, index) => SecureStore.setItemAsync(chunkKey(key, index), chunk))
      );
      await SecureStore.setItemAsync(countKey(key), String(chunks.length));
      if (previousCount > chunks.length) {
        await removeChunks(key, previousCount - chunks.length);
      }
      return;
    } catch {
      // Fallback to AsyncStorage if SecureStore fails
      await AsyncStorage.setItem(key, value);
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      const count = await getCount(key);
      await Promise.all([
        SecureStore.deleteItemAsync(key).catch(() => {}),
        SecureStore.deleteItemAsync(countKey(key)).catch(() => {}),
        removeChunks(key, count),
      ]);
    } catch {
      // ignore
    }
    await AsyncStorage.removeItem(key);
  },
};

export const authStorage = secureStorage;
