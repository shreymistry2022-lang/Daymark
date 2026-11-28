import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Purchases, { PurchasesPackage } from 'react-native-purchases';
import { useSubscription } from '../services/SubscriptionProvider';
import { SUBSCRIPTIONS_ENABLED } from '../services/subscriptionEntitlements';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing } from '../theme/tokens';

type Props = { visible: boolean; onClose: () => void };

const MONTHLY_PRODUCT_ID = process.env.EXPO_PUBLIC_REVENUECAT_MONTHLY_PRODUCT_ID || 'daymark_pro_monthly';
const ANNUAL_PRODUCT_ID = process.env.EXPO_PUBLIC_REVENUECAT_ANNUAL_PRODUCT_ID || 'daymark_pro_annual';
const LIFETIME_PRODUCT_ID = process.env.EXPO_PUBLIC_REVENUECAT_LIFETIME_PRODUCT_ID || 'daymark_pro_lifetime';

const findPackage = (items: PurchasesPackage[], term: 'monthly' | 'annual' | 'lifetime') => items.find(item => {
  const key = `${item.identifier} ${item.product.identifier}`.toLowerCase();
  const productId = term === 'monthly' ? MONTHLY_PRODUCT_ID : term === 'annual' ? ANNUAL_PRODUCT_ID : LIFETIME_PRODUCT_ID;
  if (item.product.identifier === productId) return true;
  if (term === 'monthly') return key.includes('monthly') || key.includes('month');
  if (term === 'annual') return key.includes('annual') || key.includes('year');
  return key.includes('lifetime') || key.includes('forever');
});

const PRO_UNLOCK_FEATURES: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  title: string;
  desc: string;
}[] = [
  {
    icon: 'infinite-outline',
    color: '#10B981',
    title: 'Unlimited number of habits',
    desc: 'Create as many active habits as you like beyond the 5-habit limit.',
  },
  {
    icon: 'grid-outline',
    color: '#38BDF8',
    title: 'Complete Yearly Heatmaps',
    desc: 'Visualize your full-year consistency and multi-month activity grids.',
  },
  {
    icon: 'trending-up-outline',
    color: '#F59E0B',
    title: 'Charts & Advanced Analytics',
    desc: 'Unlock 90-day & all-time trends, completion stats, and streak insights.',
  },
  {
    icon: 'flag-outline',
    color: '#7C83FF',
    title: 'Goals & Daily Routines',
    desc: 'Group habits into structured routines and track long-term milestones.',
  },
  {
    icon: 'color-palette-outline',
    color: '#EC4899',
    title: 'Pure OLED Black Theme',
    desc: 'High-contrast pure black appearance and full visual customization.',
  },
  {
    icon: 'download-outline',
    color: '#14B8A6',
    title: 'Data Export (CSV & JSON)',
    desc: 'Export your complete habit history, logs, and journal entries anytime.',
  },
  {
    icon: 'document-text-outline',
    color: '#A78BFA',
    title: 'Personal Progress Reports',
    desc: 'Weekly & monthly summary reports to review your momentum.',
  },
  {
    icon: 'sparkles',
    color: '#FB7185',
    title: 'Support Indie Development',
    desc: 'Your subscription directly supports ongoing improvements to Daymark.',
  },
];

export const PaywallModal = ({ visible, onClose }: Props) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { isPro, entitlement, isConfigured, canPurchase, isLoading, packages, purchase, restore } = useSubscription();
  const [selectedPlan, setSelectedPlan] = useState<'annual' | 'monthly' | 'lifetime'>('annual');
  const [busy, setBusy] = useState(false);

  const monthly = useMemo(() => findPackage(packages, 'monthly'), [packages]);
  const annual = useMemo(() => findPackage(packages, 'annual'), [packages]);
  const lifetime = useMemo(() => findPackage(packages, 'lifetime'), [packages]);
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
          <View style={[styles.promoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="sparkles" size={40} color={colors.accent} />
            <Text style={[styles.promoTitle, { color: colors.primaryText }]}>All Features Included</Text>
            <Text style={[styles.promoSubtitle, { color: colors.secondaryText }]}>
              Welcome to Daymark! You have complete complimentary access to all habits, themes, analytics, routines, and reminders.
            </Text>
            <TouchableOpacity style={[styles.ctaPill, { backgroundColor: colors.accent }]} onPress={onClose}>
              <Text style={styles.ctaPillText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  const buy = async (item?: PurchasesPackage) => {
    if (!canPurchase) {
      Alert.alert(
        'Store Subscriptions Connecting',
        'In-app subscriptions are connecting to Google Play. Once your Google Play Store subscription setup is finalized, purchases will process directly through Google Play.'
      );
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

  const handleContinue = () => {
    if (isPro) {
      if (isConfigured && Platform.OS !== 'web') {
        void manage();
      } else {
        onClose();
      }
      return;
    }
    void buy(selectedPlan === 'annual' ? annual : selectedPlan === 'monthly' ? monthly : lifetime);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: Math.max(insets.top, 12) }]}>
        <View style={[styles.handleBar, { backgroundColor: colors.border }]} />

        {/* Centered Header with Circle Back Button */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Close paywall"
            style={[styles.circleBackBtn, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}
            onPress={onClose}
            activeOpacity={0.75}
          >
            <Ionicons name="chevron-back" size={20} color={colors.primaryText} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.primaryText }]}>
            Unlock Daymark <Text style={{ color: colors.accent }}>Pro</Text>
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {isLoading ? <ActivityIndicator color={colors.accent} style={{ marginVertical: 14 }} /> : null}

          {/* Plan Selection Cards (Reference Radio Style) */}
          <View style={styles.plansStack}>
            {/* Annual Plan ($14.99/year with 7-day free trial) */}
            <TouchableOpacity
              accessibilityRole="radio"
              accessibilityState={{ checked: selectedPlan === 'annual' }}
              activeOpacity={0.85}
              disabled={busy}
              onPress={() => setSelectedPlan('annual')}
              style={[
                styles.planCard,
                {
                  backgroundColor: selectedPlan === 'annual' ? `${colors.accent}14` : colors.card,
                  borderColor: selectedPlan === 'annual' ? colors.accent : colors.border,
                  borderWidth: selectedPlan === 'annual' ? 1.5 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.radioOuter,
                  {
                    borderColor: selectedPlan === 'annual' ? colors.accent : colors.mutedText,
                    backgroundColor: selectedPlan === 'annual' ? colors.accent : 'transparent',
                  },
                ]}
              >
                {selectedPlan === 'annual' ? <View style={styles.radioInnerDot} /> : null}
              </View>

              <View style={styles.planMeta}>
                <View style={styles.planTitleRow}>
                  <Text style={[styles.planTitle, { color: colors.primaryText }]}>Annual</Text>
                  <View style={[styles.savePill, { backgroundColor: `${colors.accent}26` }]}>
                    <Text style={[styles.savePillText, { color: colors.accent }]}>SAVE 58%</Text>
                  </View>
                </View>
                <Text style={[styles.planSub, { color: colors.secondaryText }]}>
                  7-day free trial · Recurring billing. Cancel anytime.
                </Text>
              </View>

              <View style={styles.priceCol}>
                <Text style={[styles.priceValue, { color: colors.primaryText }]}>
                  {annual?.product.priceString || '$14.99'}
                </Text>
                <Text style={[styles.pricePeriod, { color: colors.secondaryText }]}>/ year</Text>
              </View>
            </TouchableOpacity>

            {/* Monthly Plan ($2.99/month) */}
            <TouchableOpacity
              accessibilityRole="radio"
              accessibilityState={{ checked: selectedPlan === 'monthly' }}
              activeOpacity={0.85}
              disabled={busy}
              onPress={() => setSelectedPlan('monthly')}
              style={[
                styles.planCard,
                {
                  backgroundColor: selectedPlan === 'monthly' ? `${colors.accent}14` : colors.card,
                  borderColor: selectedPlan === 'monthly' ? colors.accent : colors.border,
                  borderWidth: selectedPlan === 'monthly' ? 1.5 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.radioOuter,
                  {
                    borderColor: selectedPlan === 'monthly' ? colors.accent : colors.mutedText,
                    backgroundColor: selectedPlan === 'monthly' ? colors.accent : 'transparent',
                  },
                ]}
              >
                {selectedPlan === 'monthly' ? <View style={styles.radioInnerDot} /> : null}
              </View>

              <View style={styles.planMeta}>
                <Text style={[styles.planTitle, { color: colors.primaryText }]}>Monthly</Text>
                <Text style={[styles.planSub, { color: colors.secondaryText }]}>
                  Recurring billing. Cancel anytime.
                </Text>
              </View>

              <View style={styles.priceCol}>
                <Text style={[styles.priceValue, { color: colors.primaryText }]}>
                  {monthly?.product.priceString || '$2.99'}
                </Text>
                <Text style={[styles.pricePeriod, { color: colors.secondaryText }]}>/ month</Text>
              </View>
            </TouchableOpacity>

            {/* Lifetime Plan ($24.99 one-time) */}
            <TouchableOpacity
              accessibilityRole="radio"
              accessibilityState={{ checked: selectedPlan === 'lifetime' }}
              activeOpacity={0.85}
              disabled={busy}
              onPress={() => setSelectedPlan('lifetime')}
              style={[
                styles.planCard,
                {
                  backgroundColor: selectedPlan === 'lifetime' ? `${colors.accent}14` : colors.card,
                  borderColor: selectedPlan === 'lifetime' ? colors.accent : colors.border,
                  borderWidth: selectedPlan === 'lifetime' ? 1.5 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.radioOuter,
                  {
                    borderColor: selectedPlan === 'lifetime' ? colors.accent : colors.mutedText,
                    backgroundColor: selectedPlan === 'lifetime' ? colors.accent : 'transparent',
                  },
                ]}
              >
                {selectedPlan === 'lifetime' ? <View style={styles.radioInnerDot} /> : null}
              </View>

              <View style={styles.planMeta}>
                <View style={styles.planTitleRow}>
                  <Text style={[styles.planTitle, { color: colors.primaryText }]}>Lifetime</Text>
                  <View style={[styles.savePill, { backgroundColor: '#10B98126' }]}>
                    <Text style={[styles.savePillText, { color: '#10B981' }]}>ONE-TIME</Text>
                  </View>
                </View>
                <Text style={[styles.planSub, { color: colors.secondaryText }]}>
                  Pay once, own Daymark Pro forever.
                </Text>
              </View>

              <View style={styles.priceCol}>
                <Text style={[styles.priceValue, { color: colors.primaryText }]}>
                  {lifetime?.product.priceString || '$24.99'}
                </Text>
                <Text style={[styles.pricePeriod, { color: colors.secondaryText }]}>forever</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Restore Purchase Link */}
          <TouchableOpacity style={styles.restoreLinkBtn} onPress={() => void handleRestore()} disabled={busy}>
            <Text style={[styles.restoreLinkText, { color: colors.accent }]}>
              Already subscribed? Restore purchase
            </Text>
          </TouchableOpacity>

          {/* Active Pro Status or Store Notice */}
          {isPro && entitlement ? (
            <Text style={[styles.statusNotice, { color: colors.secondaryText }]}>
              {entitlement.periodType === 'TRIAL'
                ? `Trial started ${trialStart ?? 'as shown by your store'}; renews ${activePeriodEnd ?? 'at the end of the trial'}${renewalPrice ? ` at ${renewalPrice}` : ''}.`
                : `Pro ${entitlement.willRenew ? 'renews' : 'access ends'} ${activePeriodEnd ?? 'according to your store'}${renewalPrice && entitlement.willRenew ? ` at ${renewalPrice}` : ''}.`}
            </Text>
          ) : isPro ? (
            <Text style={[styles.statusNotice, { color: colors.accent }]}>
              Daymark Pro is active on your account. All premium features are unlocked.
            </Text>
          ) : !isConfigured && Platform.OS !== 'web' ? (
            <Text style={[styles.statusNotice, { color: colors.mutedText }]}>
              Plans connect directly through Google Play once store billing is linked.
            </Text>
          ) : null}

          {/* Feature List Section (Reference Image Cards) */}
          <Text style={[styles.unlockEyebrow, { color: colors.secondaryText }]}>
            BY SUBSCRIBING YOU&apos;LL ALSO UNLOCK:
          </Text>

          <View style={styles.featuresStack}>
            {PRO_UNLOCK_FEATURES.map(item => (
              <View
                key={item.title}
                style={[styles.featureCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={[styles.featureSquircle, { backgroundColor: `${item.color}20` }]}>
                  <Ionicons name={item.icon} size={19} color={item.color} />
                </View>
                <View style={styles.featureMeta}>
                  <Text style={[styles.featureTitle, { color: colors.primaryText }]}>{item.title}</Text>
                  <Text style={[styles.featureDesc, { color: colors.secondaryText }]}>{item.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Pinned Bottom Full-Pill CTA + Legal Footer */}
        <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 16) }]}>
          <TouchableOpacity
            activeOpacity={0.85}
            disabled={busy}
            onPress={handleContinue}
            style={[styles.ctaPill, { backgroundColor: colors.accent }]}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.ctaPillText}>
                {isPro ? (isConfigured && Platform.OS !== 'web' ? 'Manage Subscription' : 'Done') : 'Continue'}
              </Text>
            )}
          </TouchableOpacity>
          <View style={styles.legalRow}>
            <TouchableOpacity onPress={() => void openLegal(process.env.EXPO_PUBLIC_TERMS_URL || 'https://shreymistry2022-lang.github.io/Daymark/terms.html')}>
              <Text style={[styles.legalText, { color: colors.mutedText }]}>Terms of Service</Text>
            </TouchableOpacity>
            <Text style={[styles.legalDot, { color: colors.mutedText }]}>·</Text>
            <TouchableOpacity onPress={() => void openLegal(process.env.EXPO_PUBLIC_PRIVACY_URL || 'https://shreymistry2022-lang.github.io/Daymark/privacy.html')}>
              <Text style={[styles.legalText, { color: colors.mutedText }]}>Privacy Policy</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  promoBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  promoCard: { borderRadius: radii.xl, padding: 24, alignItems: 'center', width: '100%', maxWidth: 360, borderWidth: 1, gap: 12 },
  promoTitle: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  promoSubtitle: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 6 },

  root: { flex: 1 },
  handleBar: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 10 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: 12,
  },
  circleBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 19, fontWeight: '800' },
  headerSpacer: { width: 38 },

  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: 6,
    paddingBottom: 24,
  },
  plansStack: { gap: 10 },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.lg,
    paddingHorizontal: 16,
    paddingVertical: 15,
    gap: 12,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInnerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  planMeta: { flex: 1 },
  planTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planTitle: { fontSize: 16, fontWeight: '800' },
  savePill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radii.full },
  savePillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  planSub: { fontSize: 12, marginTop: 3, lineHeight: 16 },
  priceCol: { alignItems: 'flex-end' },
  priceValue: { fontSize: 17, fontWeight: '800' },
  pricePeriod: { fontSize: 11, fontWeight: '600', marginTop: 1 },

  restoreLinkBtn: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  restoreLinkText: { fontSize: 13, fontWeight: '700' },
  statusNotice: { fontSize: 12, lineHeight: 17, textAlign: 'center', marginBottom: 10 },

  unlockEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 4,
    marginBottom: 10,
  },
  featuresStack: { gap: 8 },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    padding: 13,
    gap: 12,
  },
  featureSquircle: {
    width: 38,
    height: 38,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureMeta: { flex: 1 },
  featureTitle: { fontSize: 14, fontWeight: '700' },
  featureDesc: { fontSize: 12, marginTop: 2, lineHeight: 16 },

  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  ctaPill: {
    height: 52,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  ctaPillText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  legalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  legalText: { fontSize: 11 },
  legalDot: { fontSize: 11 },
});
