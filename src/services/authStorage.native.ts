import AsyncStorage from '@react-native-async-storage/async-storage';

// Direct AsyncStorage adapter following official Supabase Expo / React Native guidelines.
// This prevents Android Keystore chunking errors, crashes, and unpredictable session drops.
export const authStorage = AsyncStorage;
