import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const CHUNK_SIZE = 1600;
const countKey = (key: string) => `${key}:secure-chunk-count`;
const chunkKey = (key: string, index: number) => `${key}:secure-chunk:${index}`;

const getCount = async (key: string) => Number(await SecureStore.getItemAsync(countKey(key)) ?? 0);

const removeChunks = async (key: string, count: number) => {
  await Promise.all(Array.from({ length: count }, (_, index) => SecureStore.deleteItemAsync(chunkKey(key, index))));
};

const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = await getCount(key);
    if (count > 0) {
      const chunks = await Promise.all(Array.from({ length: count }, (_, index) => SecureStore.getItemAsync(chunkKey(key, index))));
      if (chunks.some(chunk => chunk == null)) throw new Error('Secure session storage is incomplete. Sign in again to restore this session.');
      return chunks.join('');
    }
    const secureValue = await SecureStore.getItemAsync(key);
    if (secureValue !== null) return secureValue;
    const legacyValue = await AsyncStorage.getItem(key);
    if (legacyValue === null) return null;
    await this.setItem(key, legacyValue);
    await AsyncStorage.removeItem(key);
    return legacyValue;
  },
  async setItem(key: string, value: string): Promise<void> {
    const previousCount = await getCount(key);
    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      await SecureStore.deleteItemAsync(countKey(key));
      await removeChunks(key, previousCount);
      return;
    }
    await SecureStore.deleteItemAsync(key);
    const chunks: string[] = [];
    for (let index = 0; index < value.length; index += CHUNK_SIZE) chunks.push(value.slice(index, index + CHUNK_SIZE));
    try {
      await Promise.all(chunks.map((chunk, index) => SecureStore.setItemAsync(chunkKey(key, index), chunk)));
      await SecureStore.setItemAsync(countKey(key), String(chunks.length));
      if (previousCount > chunks.length) await removeChunks(key, previousCount - chunks.length);
    } catch (error) {
      await removeChunks(key, chunks.length).catch(() => {});
      await SecureStore.deleteItemAsync(countKey(key)).catch(() => {});
      throw error;
    }
  },
  async removeItem(key: string): Promise<void> {
    const count = await getCount(key);
    await Promise.all([SecureStore.deleteItemAsync(key), SecureStore.deleteItemAsync(countKey(key)), removeChunks(key, count)]);
    await AsyncStorage.removeItem(key);
  },
};

export const authStorage = secureStorage;
