import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Purchases, { PurchasesPackage } from 'react-native-purchases';
import { useSubscription } from '../services/SubscriptionProvider';
import { SUBSCRIPTIONS_ENABLED } from '../services/subscriptionEntitlements';

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

  if (!SUBSCRIPTIONS_ENABLED) {
    return (
      <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
        <View style={styles.promoBackdrop}>
          <View style={styles.promoCard}>
            <Ionicons name="sparkles" size={44} color={LIME} />
            <Text style={[styles.title, { fontSize: 26, textAlign: 'center', marginTop: 14 }]}>All Features Included</Text>
            <Text style={[styles.subtitle, { textAlign: 'center', marginTop: 8 }]}>
              Welcome to Daymark! You have complete complimentary access to all habits, custom themes, analytics, routines, and daily rhythm reminders.
            </Text>
            <TouchableOpacity style={styles.promoBtn} onPress={onClose}>
              <Text style={styles.continueText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  const buy = async (item?: PurchasesPackage) => {
    if (!canPurchase) {
      Alert.alert('Account required', 'Create an account or sign in before subscribing so your verified Pro access can sync across devices.');
      return;
    }
    if (!item) {
      Alert.alert(
        'Store Subscriptions Connecting',
        'In-app subscriptions are connecting to Google Play. Once your Google Play Store subscription setup is finalized, purchases will process directly through Google Play.'
      );
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
          <Text style={styles.title}>Your progress{'\n'}has no limits.</Text>
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
          {/* Annual Plan (Best Value - $23.99/year with 7-day trial) */}
          <TouchableOpacity
            style={[styles.plan, styles.annual]}
            onPress={() => void buy(annual)}
            disabled={busy}
            activeOpacity={0.8}
          >
            <View style={styles.bestValue}><Text style={styles.bestValueText}>SAVE 50% • BEST VALUE</Text></View>
            <View style={styles.planRow}>
              <View>
                <Text style={styles.planTitle}>Annual</Text>
                <Text style={styles.planSubtitle}>7-Day Free Trial included</Text>
              </View>
              <Text style={styles.price}>
                {annual?.product.priceString || '$23.99'}
                <Text style={styles.period}> / year</Text>
              </Text>
            </View>
            <Text style={styles.planCaption}>
              {annual ? '7-day free trial, then renews annually. Cancel anytime.' : 'Just ~$1.99/month. 7-day free trial, then $23.99/year.'}
            </Text>
          </TouchableOpacity>

          {/* Monthly Plan ($3.99/month) */}
          <TouchableOpacity
            style={styles.plan}
            onPress={() => void buy(monthly)}
            disabled={busy}
            activeOpacity={0.8}
          >
            <View style={styles.planRow}>
              <View>
                <Text style={styles.planTitle}>Monthly</Text>
                <Text style={styles.planSubtitle}>Flexible month-to-month</Text>
              </View>
              <Text style={styles.price}>
                {monthly?.product.priceString || '$3.99'}
                <Text style={styles.period}> / month</Text>
              </Text>
            </View>
            <Text style={styles.planCaption}>Renews automatically every month. Cancel anytime.</Text>
          </TouchableOpacity>

          {busy ? <ActivityIndicator color={LIME} style={{ margin: 12 }} /> : null}
          {isPro && entitlement ? (
            <Text style={styles.notice}>
              {entitlement.periodType === 'TRIAL'
                ? `Trial started ${trialStart ?? 'as shown by your store'}; renews ${activePeriodEnd ?? 'at the end of the trial'}${renewalPrice ? ` at ${renewalPrice}` : ''}.`
                : `Pro ${entitlement.willRenew ? 'renews' : 'access ends'} ${activePeriodEnd ?? 'according to your store'}${renewalPrice && entitlement.willRenew ? ` at ${renewalPrice}` : ''}.`}
              {' '}{entitlement.willRenew ? 'Automatically renews unless cancelled in your store account.' : 'You can keep Pro until the current period ends.'}
            </Text>
          ) : isPro ? (
            <Text style={styles.notice}>
              Daymark Pro is active on your account (Complimentary / VIP Access). All premium features are unlocked.
            </Text>
          ) : null}
          {!isConfigured && !isPro ? <Text style={styles.notice}>Store plans are not configured yet. Pro stays locked until a verified store entitlement is available.</Text> : null}
          {!isConfigured && !isPro && Platform.OS !== 'web' ? <Text style={styles.notice}>Real purchases require a development or release build with the RevenueCat SDK keys configured.</Text> : null}
          {isConfigured && !canPurchase && !isPro ? <Text style={styles.notice}>Sign in with an account to purchase and sync Pro across devices.</Text> : null}
          {isConfigured && !isLoading && !monthly && !annual && !isPro ? <Text style={styles.notice}>No subscription plans are available right now.</Text> : null}
          <Text style={styles.terms}>Subscriptions renew automatically unless cancelled through your store account. The store purchase sheet displays the applicable trial, renewal date and localized price before confirmation.</Text>

          <TouchableOpacity style={styles.restore} onPress={() => void handleRestore()} disabled={busy}><Text style={styles.restoreText}>Restore Purchases</Text></TouchableOpacity>
          {isPro ? <TouchableOpacity style={styles.restore} onPress={() => void manage()}><Text style={styles.restoreText}>Manage Subscription</Text></TouchableOpacity> : null}
          <TouchableOpacity style={styles.continue} onPress={onClose}><Text style={styles.continueText}>Continue with Free Version</Text></TouchableOpacity>
          <View style={styles.legalRow}>
            <TouchableOpacity onPress={() => void openLegal(process.env.EXPO_PUBLIC_TERMS_URL || 'https://shreymistry2022-lang.github.io/Daymark/terms.html')}><Text style={styles.legal}>Terms of Service</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => void openLegal(process.env.EXPO_PUBLIC_PRIVACY_URL || 'https://shreymistry2022-lang.github.io/Daymark/privacy.html')}><Text style={styles.legal}>Privacy Policy</Text></TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  promoBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  promoCard: { backgroundColor: '#171920', borderRadius: 20, padding: 24, alignItems: 'center', width: '100%', maxWidth: 360, borderWidth: 1, borderColor: '#363944' },
  promoBtn: { backgroundColor: BLUE, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28, marginTop: 20, width: '100%', alignItems: 'center' },
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
  planSubtitle: { color: '#A7ABB7', fontSize: 11, marginTop: 2, fontWeight: '500' },
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
