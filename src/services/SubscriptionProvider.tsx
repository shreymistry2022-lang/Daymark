// src/services/SubscriptionProvider.tsx
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import Purchases, { CustomerInfo, PurchasesEntitlementInfo, PurchasesPackage } from 'react-native-purchases';
import { PRO_ENTITLEMENT_ID, SUBSCRIPTIONS_ENABLED, isWhitelistedProEmail } from './subscriptionEntitlements';

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
  const [isPro, setIsPro] = useState(false);
  const [entitlement, setEntitlement] = useState<PurchasesEntitlementInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [isConfigured, setIsConfigured] = useState(false);
  const [configured, setConfigured] = useState(false);

  const checkWhitelistedPro = useCallback(async (): Promise<boolean> => {
    // Check if dev/whitelisted email is stored locally
    try {
      const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
      const storedEmail = await AsyncStorage.getItem('@daymark_dev_email_v1');
      if (isWhitelistedProEmail(storedEmail ?? undefined)) return true;
    } catch {
      // ignore
    }
    return false;
  }, []);

  const loadStoreData = useCallback(async () => {
    const isSpecialPro = !SUBSCRIPTIONS_ENABLED || (await checkWhitelistedPro());
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
  }, [checkWhitelistedPro]);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      const isSpecialPro = !SUBSCRIPTIONS_ENABLED || (await checkWhitelistedPro());
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
          // Use anonymous ID always — no account required
          await Purchases.configure({ apiKey });
          if (active) {
            setIsConfigured(true);
            setConfigured(true);
          }
        }

        const [customerInfo, offerings] = await Promise.all([
          Purchases.getCustomerInfo(),
          Purchases.getOfferings(),
        ]);

        if (active) {
          setIsPro(hasProEntitlement(customerInfo));
          setEntitlement(getProEntitlement(customerInfo));
          setPackages(offerings.current?.availablePackages ?? []);
        }
      } catch (error) {
        console.warn('RevenueCat initialization error:', error);
        if (active) setIsConfigured(false);
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void initialize();
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isConfigured) return;
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') void loadStoreData();
    });
    return () => sub.remove();
  }, [isConfigured, loadStoreData]);

  const purchase = useCallback(async (item: PurchasesPackage) => {
    if (!isConfigured) return { error: 'Purchases are not configured yet.' };
    try {
      const { customerInfo } = await Purchases.purchasePackage(item);
      setIsPro(hasProEntitlement(customerInfo));
      setEntitlement(getProEntitlement(customerInfo));
      return hasProEntitlement(customerInfo) ? {} : { error: 'Purchase completed but Pro entitlement was not found.' };
    } catch (error: unknown) {
      const rcError = error as { userCancelled?: boolean; message?: string };
      if (rcError?.userCancelled) return { cancelled: true };
      return { error: rcError?.message || 'Purchase failed. Please try again.' };
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

  // No session required — canPurchase is true whenever RevenueCat is configured
  const canPurchase = Boolean(isConfigured && !isExpoGo);
  const value = useMemo(() => ({ isPro, entitlement, isConfigured, canPurchase, isLoading, packages, refresh: loadStoreData, purchase, restore }), [isPro, entitlement, isConfigured, canPurchase, isLoading, packages, loadStoreData, purchase, restore]);
  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
};

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (!context) throw new Error('useSubscription must be used inside SubscriptionProvider');
  return context;
};
