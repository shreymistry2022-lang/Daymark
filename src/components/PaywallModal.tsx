import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Purchases, { PurchasesPackage } from 'react-native-purchases';
import { useSubscription } from '../services/SubscriptionProvider';

type Props = { visible: boolean; onClose: () => void };
const BLUE = '#315CFF';
const LIME = '#C8F169';
const MONTHLY_PRODUCT_ID = process.env.EXPO_PUBLIC_REVENUECAT_MONTHLY_PRODUCT_ID || 'daymark_pro_monthly';
const ANNUAL_PRODUCT_ID = process.env.EXPO_PUBLIC_REVENUECAT_ANNUAL_PRODUCT_ID || 'daymark_pro_annual';

const findPackage = (items: PurchasesPackage[], term: 'monthly' | 'annual') => items.find(item => {
  const key = `${item.identifier} ${item.product.identifier}`.toLowerCase();
  const productId = term === 'monthly' ? MONTHLY_PRODUCT_ID : ANNUAL_PRODUCT_ID;
  return item.product.identifier === productId || (term === 'monthly'
    ? key.includes('monthly') || key.includes('month')
    : key.includes('annual') || key.includes('year'));
});

export const PaywallModal = ({ visible, onClose }: Props) => {
  const { isPro, entitlement, isConfigured, canPurchase, isLoading, packages, purchase, restore } = useSubscription();
  const [busy, setBusy] = useState(false);
  const monthly = useMemo(() => findPackage(packages, 'monthly'), [packages]);
  const annual = useMemo(() => findPackage(packages, 'annual'), [packages]);
  const renewalPrice = packages.find(item => item.product.identifier === entitlement?.productIdentifier)?.product.priceString;
  const activePeriodEnd = entitlement?.expirationDate
    ? new Date(entitlement.expirationDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : undefined;
  const trialStart = entitlement?.originalPurchaseDate
    ? new Date(entitlement.originalPurchaseDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : undefined;

  const buy = async (item?: PurchasesPackage) => {
    if (!canPurchase) {
      Alert.alert('Account required', 'Create an account or sign in before subscribing so your verified Pro access can sync across devices.');
      return;
    }
    if (!item) {
      Alert.alert('Plan unavailable', 'This plan is not currently available from the app store. Please try again later.');
      return;
    }
    setBusy(true);
    const result = await purchase(item);
    setBusy(false);
    if (result.error) Alert.alert('Purchase unavailable', result.error);
    else if (!result.cancelled) onClose();
  };

  const handleRestore = async () => {
    setBusy(true);
    const result = await restore();
    setBusy(false);
    if (result.error) Alert.alert('Restore purchases', result.error);
    else onClose();
  };

  const openLegal = async (url?: string) => {
    if (!url) {
      Alert.alert('Link unavailable', 'Add the legal page URL in the app configuration before release.');
      return;
    }
    try { await Linking.openURL(url); }
    catch { Alert.alert('Unable to open link', 'Please try again later.'); }
  };

  const manage = async () => {
    if (!isConfigured || Platform.OS === 'web') return;
    try { await Purchases.showManageSubscriptions(); }
    catch { Alert.alert('Unable to open subscriptions', 'Manage your plan from your Apple App Store or Google Play account settings.'); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.root}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close paywall" style={styles.close} onPress={onClose}>
          <Ionicons name="close" size={22} color="#D4D8E2" />
        </TouchableOpacity>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.brand}>DAYMARK <Text style={{ color: LIME }}>PRO</Text></Text>
          <Text style={styles.title}>Your progress{ '\n' }has no limits.</Text>
          <Text style={styles.subtitle}>Build stronger routines. Understand your consistency. See the bigger picture.</Text>

          <View style={styles.benefits}>
            {['Unlimited habits', 'Complete yearly heatmaps', 'Advanced analytics', 'Unlimited routines', 'Smart reminders', 'Personal progress reports', 'Premium themes'].map(label => (
              <View key={label} style={styles.benefit}>
                <Ionicons name="checkmark-circle" size={19} color={LIME} />
                <Text style={styles.benefitText}>{label}</Text>
              </View>
            ))}
          </View>

          {isLoading ? <ActivityIndicator color={LIME} style={{ marginVertical: 18 }} /> : null}
          {annual ? (
            <TouchableOpacity style={[styles.plan, styles.annual]} onPress={() => void buy(annual)} disabled={busy}>
              <View style={styles.bestValue}><Text style={styles.bestValueText}>BEST VALUE</Text></View>
              <View style={styles.planRow}><Text style={styles.planTitle}>Annual</Text><Text style={styles.price}>{annual.product.priceString}<Text style={styles.period}> / year</Text></Text></View>
              <Text style={styles.planCaption}>7-day trial only when eligible and configured by the store.</Text>
            </TouchableOpacity>
          ) : null}
          {monthly ? (
            <TouchableOpacity style={styles.plan} onPress={() => void buy(monthly)} disabled={busy}>
              <View style={styles.planRow}><Text style={styles.planTitle}>Monthly</Text><Text style={styles.price}>{monthly.product.priceString}<Text style={styles.period}> / month</Text></Text></View>
            </TouchableOpacity>
          ) : null}

          {busy ? <ActivityIndicator color={LIME} style={{ margin: 12 }} /> : null}
          {isPro && entitlement ? (
            <Text style={styles.notice}>
              {entitlement.periodType === 'TRIAL'
                ? `Trial started ${trialStart ?? 'as shown by your store'}; renews ${activePeriodEnd ?? 'at the end of the trial'}${renewalPrice ? ` at ${renewalPrice}` : ''}.`
                : `Pro ${entitlement.willRenew ? 'renews' : 'access ends'} ${activePeriodEnd ?? 'according to your store'}${renewalPrice && entitlement.willRenew ? ` at ${renewalPrice}` : ''}.`}
              {' '}{entitlement.willRenew ? 'Automatically renews unless cancelled in your store account.' : 'You can keep Pro until the current period ends.'}
            </Text>
          ) : null}
          {!isConfigured ? <Text style={styles.notice}>Store plans are not configured yet. Pro stays locked until a verified store entitlement is available.</Text> : null}
          {!isConfigured && Platform.OS !== 'web' ? <Text style={styles.notice}>Real purchases require a development or release build with the RevenueCat SDK keys configured.</Text> : null}
          {isConfigured && !canPurchase ? <Text style={styles.notice}>Sign in with an account to purchase and sync Pro across devices.</Text> : null}
          {isConfigured && !isLoading && !monthly && !annual ? <Text style={styles.notice}>No subscription plans are available right now.</Text> : null}
          <Text style={styles.terms}>Subscriptions renew automatically unless cancelled through your store account. The store purchase sheet displays the applicable trial, renewal date and localized price before confirmation.</Text>

          <TouchableOpacity style={styles.restore} onPress={() => void handleRestore()} disabled={busy}><Text style={styles.restoreText}>Restore Purchases</Text></TouchableOpacity>
          {isPro ? <TouchableOpacity style={styles.restore} onPress={() => void manage()}><Text style={styles.restoreText}>Manage Subscription</Text></TouchableOpacity> : null}
          <TouchableOpacity style={styles.continue} onPress={onClose}><Text style={styles.continueText}>Continue with Free Version</Text></TouchableOpacity>
          <View style={styles.legalRow}>
            <TouchableOpacity onPress={() => void openLegal(process.env.EXPO_PUBLIC_TERMS_URL)}><Text style={styles.legal}>Terms of Service</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => void openLegal(process.env.EXPO_PUBLIC_PRIVACY_URL)}><Text style={styles.legal}>Privacy Policy</Text></TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#101116' },
  close: { alignSelf: 'flex-end', marginTop: 16, marginRight: 18, padding: 8 },
  content: { paddingHorizontal: 24, paddingBottom: 32 },
  brand: { color: '#FFFFFF', fontSize: 12, fontWeight: '900', letterSpacing: 2, marginTop: 6 },
  title: { color: '#FFFFFF', fontSize: 38, lineHeight: 43, fontWeight: '900', letterSpacing: -1.2, marginTop: 18 },
  subtitle: { color: '#A7ABB7', fontSize: 15, lineHeight: 22, marginTop: 12 },
  benefits: { marginTop: 22, marginBottom: 20, gap: 13 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  benefitText: { color: '#E9EAF0', fontSize: 14, fontWeight: '600' },
  plan: { borderWidth: 1, borderColor: '#363944', borderRadius: 16, padding: 16, marginBottom: 10, backgroundColor: '#171920' },
  annual: { borderColor: BLUE, paddingTop: 23 },
  bestValue: { position: 'absolute', top: 0, right: 14, backgroundColor: LIME, borderBottomLeftRadius: 7, borderBottomRightRadius: 7, paddingHorizontal: 9, paddingVertical: 4 },
  bestValueText: { color: '#14160E', fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  planRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  price: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  period: { color: '#A7ABB7', fontSize: 12, fontWeight: '500' },
  planCaption: { color: '#A7ABB7', fontSize: 11, marginTop: 8 },
  notice: { color: '#D2D5DD', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 10 },
  terms: { color: '#858A98', fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 10 },
  restore: { alignItems: 'center', padding: 12 },
  restoreText: { color: '#C9CED9', fontSize: 13, fontWeight: '700' },
  continue: { alignItems: 'center', padding: 12, marginTop: 2 },
  continueText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  legalRow: { flexDirection: 'row', justifyContent: 'center', gap: 24, marginTop: 12 },
  legal: { color: '#858A98', fontSize: 11, textDecorationLine: 'underline' },
});
