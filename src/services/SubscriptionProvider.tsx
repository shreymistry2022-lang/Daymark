import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import Purchases, { CustomerInfo, PurchasesEntitlementInfo, PurchasesPackage } from 'react-native-purchases';
import { useAuth } from './AuthProvider';
import { PRO_ENTITLEMENT_ID, isWhitelistedProEmail } from './subscriptionEntitlements';
import { supabase, isSupabaseConfigured } from './supabase';

type SubscriptionContextValue = {
  isPro: boolean;
  entitlement: PurchasesEntitlementInfo | null;
  isConfigured: boolean;
  canPurchase: boolean;
  isLoading: boolean;
  packages: PurchasesPackage[];
  refresh: () => Promise<void>;
  purchase: (item: PurchasesPackage) => Promise<{ error?: string; cancelled?: boolean }>;
  restore: () => Promise<{ error?: string }>;
};

const SubscriptionContext = createContext<SubscriptionContextValue | undefined>(undefined);
const apiKey = Platform.OS === 'ios'
  ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY
  : Platform.OS === 'android'
    ? process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY
    : undefined;
const isExpoGo = Constants.appOwnership === 'expo';

const hasProEntitlement = (info: CustomerInfo) => Boolean(info.entitlements.active[PRO_ENTITLEMENT_ID]);
const getProEntitlement = (info: CustomerInfo) => info.entitlements.active[PRO_ENTITLEMENT_ID] ?? null;

export const SubscriptionProvider = ({ children }: { children: ReactNode }) => {
  const { user, session, isLoading: isAuthLoading } = useAuth();
  const [isPro, setIsPro] = useState(false);
  const [entitlement, setEntitlement] = useState<PurchasesEntitlementInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [isConfigured, setIsConfigured] = useState(false);
  const [configured, setConfigured] = useState(false);

  const checkCloudOrWhitelistedPro = useCallback(async (): Promise<boolean> => {
    if (isWhitelistedProEmail(user?.email)) {
      return true;
    }
    if (isSupabaseConfigured && user?.id && !user.isGuest) {
      try {
        const { data: profile } = await supabase
          .from('subscription_profiles')
          .select('entitlement_status, expires_at')
          .eq('user_id', user.id)
          .maybeSingle();

        if (profile?.entitlement_status === 'active') {
          const notExpired = !profile.expires_at || new Date(profile.expires_at) > new Date();
          if (notExpired) return true;
        }
      } catch (err) {
        console.warn('Could not check Supabase subscription profile:', err);
      }
    }
    return false;
  }, [user]);

  const loadStoreData = useCallback(async () => {
    const isSpecialPro = await checkCloudOrWhitelistedPro();
    if (isSpecialPro) {
      setIsPro(true);
      setIsLoading(false);
      return;
    }

    if (!apiKey || Platform.OS === 'web' || isExpoGo) {
      setIsPro(false);
      setEntitlement(null);
      setPackages([]);
      setIsLoading(false);
      return;
    }
    try {
      const [customerInfo, offerings] = await Promise.all([
        Purchases.getCustomerInfo(),
        Purchases.getOfferings(),
      ]);
      setIsPro(hasProEntitlement(customerInfo));
      setEntitlement(getProEntitlement(customerInfo));
      setPackages(offerings.current?.availablePackages ?? []);
    } catch (error) {
      console.warn('Unable to refresh subscription information:', error);
    } finally {
      setIsLoading(false);
    }
  }, [checkCloudOrWhitelistedPro]);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      if (isAuthLoading) return;

      const isSpecialPro = await checkCloudOrWhitelistedPro();
      if (isSpecialPro) {
        if (active) {
          setIsPro(true);
          setIsLoading(false);
        }
        return;
      }

      if (!apiKey || Platform.OS === 'web' || isExpoGo) {
        setIsConfigured(false);
        setIsPro(false);
        setEntitlement(null);
        setPackages([]);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        if (!configured) {
          Purchases.setLogLevel(__DEV__ ? Purchases.LOG_LEVEL.DEBUG : Purchases.LOG_LEVEL.ERROR);
          await Purchases.configure({ apiKey, appUserID: user?.isGuest ? undefined : user?.id });
          if (active) setConfigured(true);
        } else if (user?.id && !user.isGuest) {
          await Purchases.logIn(user.id);
        } else {
          await Purchases.logOut().catch(() => undefined);
        }
        if (!active) return;
        setIsConfigured(true);
        await loadStoreData();
      } catch (error) {
        console.warn('RevenueCat is not available:', error);
        if (active) setIsConfigured(false);
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void initialize();
    return () => { active = false; };
  }, [configured, isAuthLoading, user, loadStoreData, checkCloudOrWhitelistedPro]);

  useEffect(() => {
    if (!isConfigured || Platform.OS === 'web') return;
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void loadStoreData();
    });
    return () => subscription.remove();
  }, [isConfigured, loadStoreData]);

  const purchase = useCallback(async (item: PurchasesPackage) => {
    if (!isConfigured) return { error: 'Purchases are not configured yet.' };
    try {
      const { customerInfo } = await Purchases.purchasePackage(item);
      setIsPro(hasProEntitlement(customerInfo));
      setEntitlement(getProEntitlement(customerInfo));
      return hasProEntitlement(customerInfo) ? {} : { error: 'The store purchase completed, but Pro is not active yet. Try Restore Purchases.' };
    } catch (error: unknown) {
      const purchaseError = error as { userCancelled?: boolean; message?: string };
      if (purchaseError.userCancelled) return { cancelled: true };
      return { error: purchaseError.message || 'Purchase could not be completed. Please try again.' };
    }
  }, [isConfigured]);

  const restore = useCallback(async () => {
    if (!isConfigured) return { error: 'Purchases are not configured yet.' };
    try {
      const customerInfo = await Purchases.restorePurchases();
      setIsPro(hasProEntitlement(customerInfo));
      setEntitlement(getProEntitlement(customerInfo));
      return hasProEntitlement(customerInfo) ? {} : { error: 'No active Daymark Pro purchase was found.' };
    } catch (error: unknown) {
      return { error: (error as { message?: string }).message || 'Restore failed. Please try again.' };
    }
  }, [isConfigured]);

  const canPurchase = Boolean(session && isConfigured && !isExpoGo);
  const value = useMemo(() => ({ isPro, entitlement, isConfigured, canPurchase, isLoading, packages, refresh: loadStoreData, purchase, restore }), [isPro, entitlement, isConfigured, canPurchase, isLoading, packages, loadStoreData, purchase, restore]);
  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
};

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (!context) throw new Error('useSubscription must be used inside SubscriptionProvider');
  return context;
};
