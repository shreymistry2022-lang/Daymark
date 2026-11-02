// src/services/AuthProvider.tsx
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from './supabase';
import type { Session } from '@supabase/supabase-js';

export interface AppUser {
  id: string;
  email: string;
  fullName: string;
  isGuest?: boolean;
}

type AuthContextType = {
  user: AppUser | null;
  session: Session | null;
  isLoading: boolean;
  isGuest: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error?: string }>;
  continueAsGuest: () => void;
  signOut: () => Promise<void>;
};

const STORAGE_KEYS = {
  LOCAL_USER: '@daymark_local_user',
  GUEST_MODE: '@daymark_guest_mode',
  REGISTERED_USERS: '@daymark_registered_users',
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [isGuest, setIsGuest] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Restore initial auth state from Supabase or AsyncStorage
  useEffect(() => {
    let isMounted = true;

    const restoreSession = async () => {
      try {
        // 1. Check if user was in guest mode
        const savedGuest = await AsyncStorage.getItem(STORAGE_KEYS.GUEST_MODE);
        if (savedGuest === 'true' && isMounted) {
          setIsGuest(true);
          setIsLoading(false);
          return;
        }

        // 2. Check Supabase session if configured
        if (isSupabaseConfigured) {
          const { data } = await supabase.auth.getSession();
          if (data.session && isMounted) {
            setSession(data.session);
            setUser({
              id: data.session.user.id,
              email: data.session.user.email || '',
              fullName:
                data.session.user.user_metadata?.full_name ||
                data.session.user.email?.split('@')[0] ||
                'Daymark Member',
              isGuest: false,
            });
            setIsLoading(false);
            return;
          }
        }

        // 3. Check persistent local account
        const savedUserJson = await AsyncStorage.getItem(STORAGE_KEYS.LOCAL_USER);
        if (savedUserJson && isMounted) {
          const parsedUser = JSON.parse(savedUserJson) as AppUser;
          setUser(parsedUser);
        }
      } catch (err) {
        console.error('Failed to restore auth session:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    restoreSession();

    // Supabase auth subscription
    let subscription: { unsubscribe: () => void } | null = null;
    if (isSupabaseConfigured) {
      const { data } = supabase.auth.onAuthStateChange((_event, sess) => {
        if (!isMounted) return;
        setSession(sess);
        if (sess?.user) {
          setUser({
            id: sess.user.id,
            email: sess.user.email || '',
            fullName:
              sess.user.user_metadata?.full_name ||
              sess.user.email?.split('@')[0] ||
              'Daymark Member',
            isGuest: false,
          });
          setIsGuest(false);
        }
      });
      subscription = data.subscription;
    }

    return () => {
      isMounted = false;
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, []);

  const signIn = async (email: string, password: string): Promise<{ error?: string }> => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      return { error: 'Please enter both email and password.' };
    }

    // Try Supabase first if configured
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password: trimmedPassword,
        });

        if (error) {
          return { error: error.message };
        }

        if (data.user) {
          const appUser: AppUser = {
            id: data.user.id,
            email: data.user.email || trimmedEmail,
            fullName:
              data.user.user_metadata?.full_name ||
              data.user.email?.split('@')[0] ||
              'Daymark Member',
            isGuest: false,
          };
          setUser(appUser);
          setIsGuest(false);
          await AsyncStorage.removeItem(STORAGE_KEYS.GUEST_MODE);
          await AsyncStorage.setItem(STORAGE_KEYS.LOCAL_USER, JSON.stringify(appUser));
          return {};
        }
      } catch (err: unknown) {
        console.warn('Supabase signIn error, falling back to local credentials:', err);
      }
    }

    // Offline / Local registered account fallback
    try {
      const regJson = await AsyncStorage.getItem(STORAGE_KEYS.REGISTERED_USERS);
      const registeredMap = regJson ? JSON.parse(regJson) : {};

      if (registeredMap[trimmedEmail]) {
        const record = registeredMap[trimmedEmail];
        if (record.password !== trimmedPassword) {
          return { error: 'Incorrect password. Please try again.' };
        }
        const appUser: AppUser = {
          id: record.id,
          email: record.email,
          fullName: record.fullName,
          isGuest: false,
        };
        setUser(appUser);
        setIsGuest(false);
        await AsyncStorage.removeItem(STORAGE_KEYS.GUEST_MODE);
        await AsyncStorage.setItem(STORAGE_KEYS.LOCAL_USER, JSON.stringify(appUser));
        return {};
      }

      // If user hasn't created account locally yet, provide helpful message
      return {
        error:
          'No account found with this email. Switch to "Create Account" above to register.',
      };
    } catch {
      return { error: 'Failed to authenticate. Please try again.' };
    }
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string
  ): Promise<{ error?: string }> => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();
    const trimmedName = fullName.trim() || trimmedEmail.split('@')[0] || 'Daymark Member';

    if (!trimmedEmail || !trimmedPassword) {
      return { error: 'Please enter your email and password.' };
    }

    if (trimmedPassword.length < 6) {
      return { error: 'Password must be at least 6 characters.' };
    }

    // Try Supabase first if configured
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password: trimmedPassword,
          options: {
            data: { full_name: trimmedName },
          },
        });

        if (error) {
          return { error: error.message };
        }

        if (data.user) {
          const appUser: AppUser = {
            id: data.user.id,
            email: data.user.email || trimmedEmail,
            fullName: trimmedName,
            isGuest: false,
          };
          setUser(appUser);
          setIsGuest(false);
          await AsyncStorage.removeItem(STORAGE_KEYS.GUEST_MODE);
          await AsyncStorage.setItem(STORAGE_KEYS.LOCAL_USER, JSON.stringify(appUser));
          return {};
        }
      } catch (err: unknown) {
        console.warn('Supabase signUp error, falling back to local credentials:', err);
      }
    }

    // Offline / Local registration
    try {
      const regJson = await AsyncStorage.getItem(STORAGE_KEYS.REGISTERED_USERS);
      const registeredMap = regJson ? JSON.parse(regJson) : {};

      const newUserId = `u_${Date.now()}`;
      registeredMap[trimmedEmail] = {
        id: newUserId,
        email: trimmedEmail,
        password: trimmedPassword,
        fullName: trimmedName,
      };

      await AsyncStorage.setItem(STORAGE_KEYS.REGISTERED_USERS, JSON.stringify(registeredMap));

      const appUser: AppUser = {
        id: newUserId,
        email: trimmedEmail,
        fullName: trimmedName,
        isGuest: false,
      };

      setUser(appUser);
      setIsGuest(false);
      await AsyncStorage.removeItem(STORAGE_KEYS.GUEST_MODE);
      await AsyncStorage.setItem(STORAGE_KEYS.LOCAL_USER, JSON.stringify(appUser));
      return {};
    } catch {
      return { error: 'Failed to create account. Please try again.' };
    }
  };

  const continueAsGuest = () => {
    setIsGuest(true);
    setUser({
      id: 'guest_user',
      email: 'guest@daymark.local',
      fullName: 'Daymark Guest',
      isGuest: true,
    });
    AsyncStorage.setItem(STORAGE_KEYS.GUEST_MODE, 'true').catch(() => {});
  };

  const signOut = async () => {
    try {
      if (isSupabaseConfigured) {
        await supabase.auth.signOut();
      }
      await AsyncStorage.removeItem(STORAGE_KEYS.LOCAL_USER);
      await AsyncStorage.removeItem(STORAGE_KEYS.GUEST_MODE);
    } catch (err) {
      console.error('Error during sign out:', err);
    } finally {
      setSession(null);
      setUser(null);
      setIsGuest(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        isLoading,
        isGuest,
        signIn,
        signUp,
        continueAsGuest,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
