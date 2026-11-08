// src/services/AuthProvider.tsx
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from './supabase';
import type { Session } from '@supabase/supabase-js';
import { makeRedirectUri } from 'expo-auth-session';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { deleteLocalCredential, getLocalCredential, migrateLegacyCredentials, saveLocalCredential } from './localCredentialStore';

WebBrowser.maybeCompleteAuthSession();

export type SocialProvider = 'google' | 'apple';

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
  passwordRecoveryRequested: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error?: string }>;
  sendPasswordRecovery: (email: string) => Promise<{ error?: string }>;
  updatePassword: (password: string) => Promise<{ error?: string }>;
  signInWithProvider: (provider: SocialProvider) => Promise<{ error?: string }>;
  deleteAccount: () => Promise<{ error?: string }>;
  continueAsGuest: () => void;
  signOut: () => Promise<void>;
};

const STORAGE_KEYS = {
  LOCAL_USER: '@daymark_local_user',
  GUEST_MODE: '@daymark_guest_mode',
};
const OAUTH_REDIRECT = () => makeRedirectUri({ scheme: 'daymark', path: 'auth/callback' });
const LOCAL_DATA_KEYS = ['@daymark_habits_v1', '@daymark_onboarding_v1', '@daymark_routines_v1', '@daymark_routine_delete_queue_v1', '@daymark_goals_v1', '@daymark_goal_delete_queue_v1', '@daymark_journal_v1', '@daymark_journal_delete_queue_v1'];

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
  const [passwordRecoveryRequested, setPasswordRecoveryRequested] = useState(false);

  // Restore initial auth state from Supabase or AsyncStorage
  useEffect(() => {
    let isMounted = true;

    const restoreSession = async () => {
      try {
        await migrateLegacyCredentials().catch(error => console.warn('Could not migrate legacy local credentials securely:', error));
        // Clear legacy guest mode since free tier requires account sign up
        await AsyncStorage.removeItem(STORAGE_KEYS.GUEST_MODE);

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
      const { data } = supabase.auth.onAuthStateChange((event, sess) => {
        if (!isMounted) return;
        if (event === 'PASSWORD_RECOVERY') setPasswordRecoveryRequested(true);
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
        } else if (event === 'SIGNED_OUT' || !sess) {
          setUser(null);
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
          const lower = error.message.toLowerCase();
          if (lower.includes('email not confirmed')) {
            return {
              error:
                'Email not confirmed yet! To log in instantly without email verification, turn OFF "Confirm email" in your Supabase Dashboard (Authentication -> Providers -> Email).',
            };
          }

          // Check if local credentials exist for this account (e.g. offline or previously saved)
          const localRecord = await getLocalCredential(trimmedEmail);
          if (localRecord) {
            if (localRecord.password === trimmedPassword) {
              const appUser: AppUser = {
                id: localRecord.id,
                email: localRecord.email,
                fullName: localRecord.fullName,
                isGuest: false,
              };
              setUser(appUser);
              setIsGuest(false);
              await AsyncStorage.removeItem(STORAGE_KEYS.GUEST_MODE);
              await AsyncStorage.setItem(STORAGE_KEYS.LOCAL_USER, JSON.stringify(appUser));

              // Attempt background sync to Supabase so cloud account is also synced
              supabase.auth
                .signUp({
                  email: trimmedEmail,
                  password: trimmedPassword,
                  options: { data: { full_name: localRecord.fullName } },
                })
                .catch(() => {});

              return {};
            } else {
              return { error: 'Incorrect password. Please try again or tap "Forgot?" to reset.' };
            }
          }

          if (
            lower.includes('invalid login credentials') ||
            lower.includes('invalid grant') ||
            lower.includes('user not found')
          ) {
            return {
              error:
                'Invalid email or password. If you have not created an account yet, tap "Create Account" above. If you already have an account, tap "Forgot?" to reset your password.',
            };
          }

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
          await saveLocalCredential({
            id: appUser.id,
            email: trimmedEmail,
            password: trimmedPassword,
            fullName: appUser.fullName,
          });
          return {};
        }
      } catch (err: unknown) {
        console.warn('Supabase signIn error, falling back to local credentials:', err);
      }
    }

    // Offline / Local registered account fallback
    try {
      const record = await getLocalCredential(trimmedEmail);
      if (record) {
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
          const lower = error.message.toLowerCase();
          if (lower.includes('rate limit')) {
            return {
              error:
                'Supabase email rate limit reached! To fix this immediately: Open your Supabase Dashboard -> Authentication -> Providers -> Email, and toggle OFF "Confirm email". If you already created an account, tap "Sign In" above!',
            };
          }
          if (lower.includes('already registered')) {
            return {
              error:
                'This email is already registered! Please switch to the "Sign In" tab above and enter your password.',
            };
          }
          return { error: error.message };
        }

        // If email confirmation is enabled in Supabase, data.session will be null
        if (data.user && !data.session) {
          return {
            error:
              'Account created! Please check your email to confirm your account (or in Supabase Dashboard -> Authentication -> Providers -> Email, turn OFF "Confirm email" to enable instant login).',
          };
        }

        if (data.user && data.session) {
          setSession(data.session);
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
          await saveLocalCredential({
            id: appUser.id,
            email: trimmedEmail,
            password: trimmedPassword,
            fullName: trimmedName,
          });
          return {};
        }
      } catch (err: unknown) {
        console.warn('Supabase signUp error, falling back to local credentials:', err);
      }
    }

    // Offline / Local registration
    try {
      const newUserId = `u_${Date.now()}`;
      await saveLocalCredential({
        id: newUserId,
        email: trimmedEmail,
        password: trimmedPassword,
        fullName: trimmedName,
      });

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

  const sendPasswordRecovery = async (email: string): Promise<{ error?: string }> => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) return { error: 'Please enter your email address.' };
    if (!isSupabaseConfigured) {
      return { error: 'Password recovery requires an active cloud connection. Please configure Supabase in your environment.' };
    }
    try {
      const redirectUri = makeRedirectUri({ scheme: 'daymark', path: 'auth/reset' });
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: redirectUri,
      });
      if (error) return { error: error.message };
      return {};
    } catch (err: any) {
      return { error: err?.message || 'Failed to send password recovery email.' };
    }
  };

  const updatePassword = async (password: string): Promise<{ error?: string }> => {
    const trimmedPassword = password.trim();
    if (trimmedPassword.length < 6) {
      return { error: 'Password must be at least 6 characters.' };
    }
    if (!isSupabaseConfigured) {
      return { error: 'Password update requires an active cloud connection.' };
    }
    try {
      const { error } = await supabase.auth.updateUser({ password: trimmedPassword });
      if (error) return { error: error.message };
      setPasswordRecoveryRequested(false);
      return {};
    } catch (err: any) {
      return { error: err?.message || 'Failed to update password.' };
    }
  };

  const signInWithProvider = async (provider: SocialProvider): Promise<{ error?: string }> => {
    if (!isSupabaseConfigured) {
      return { error: 'Social sign-in requires online Supabase authentication to be configured.' };
    }
    try {
      const redirectUri = OAUTH_REDIRECT();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectUri,
          skipBrowserRedirect: false,
        },
      });
      if (error) return { error: error.message };
      if (!data.url) return { error: 'Could not obtain OAuth authorization URL.' };

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);
      if (result.type === 'success' && result.url) {
        const parsed = Linking.parse(result.url);
        if (parsed.queryParams?.code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
            String(parsed.queryParams.code)
          );
          if (exchangeError) return { error: exchangeError.message };
        }
      }
      return {};
    } catch (err: any) {
      return { error: err?.message || `${provider} sign-in failed.` };
    }
  };

  const deleteAccount = async (): Promise<{ error?: string }> => {
    try {
      // If signed in via Supabase, invoke account deletion function / endpoint if present
      if (isSupabaseConfigured && user && !user.isGuest) {
        try {
          await supabase.functions.invoke('delete-account').catch(() => {});
        } catch {
          // Continue local wipe even if edge function not deployed yet
        }
      }

      // Delete local credentials if registered locally
      if (user?.email) {
        await deleteLocalCredential(user.email).catch(() => {});
      }

      // Wipe all local storage keys
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.LOCAL_USER,
        STORAGE_KEYS.GUEST_MODE,
        ...LOCAL_DATA_KEYS,
      ]).catch(() => {});

      await signOut();
      return {};
    } catch (err: any) {
      return { error: err?.message || 'Failed to delete account.' };
    }
  };

  const continueAsGuest = () => {
    // Deprecated: free tier requires an account to be created
    setIsGuest(false);
  };

  const signOut = async () => {
    try {
      if (isSupabaseConfigured) {
        await supabase.auth.signOut().catch(() => {});
      }
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.LOCAL_USER,
        STORAGE_KEYS.GUEST_MODE,
      ]);
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
        passwordRecoveryRequested,
        signIn,
        signUp,
        sendPasswordRecovery,
        updatePassword,
        signInWithProvider,
        deleteAccount,
        continueAsGuest,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
