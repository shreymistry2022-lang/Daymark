# Daymark subscriptions setup

The client integration uses RevenueCat's `daymark_pro` entitlement. Until the public SDK keys and store products are configured, the app stays on Free and does not simulate a purchase.

## RevenueCat configuration

1. Create iOS and Android apps in RevenueCat and connect the matching App Store Connect and Google Play products.
2. Create products `daymark_pro_monthly` and `daymark_pro_annual`, and attach them to the current offering. Attach the `daymark_pro` entitlement to both products. Do not create or publish the lifetime product in the launch offering.
3. Configure any 7-day annual trial as a store introductory offer. Store eligibility and terms are authoritative; the app uses the localized store price and the purchase sheet for final trial and renewal terms.
4. Set `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` and `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` in EAS build environments. Product ID overrides and legal URLs are listed in `.env.example`.
5. Install on a development build. Expo Go preview mode does not perform real store transactions. Verify purchases with Apple and Google sandbox accounts before release.

## Trusted webhook

Apply `supabase/schema.sql`, then deploy `supabase/functions/revenuecat-webhook` as a Supabase Edge Function. Configure these function secrets:

- `REVENUECAT_WEBHOOK_AUTHORIZATION`: a long random value also entered as the RevenueCat webhook Authorization header.
- `REVENUECAT_SECRET_API_KEY`: RevenueCat secret API key. Never add this to an `EXPO_PUBLIC_` variable or the mobile app.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`: Supabase function credentials. Never ship the service role key in the app.

The webhook rejects unauthenticated requests, ignores anonymous RevenueCat IDs, fetches the subscriber from RevenueCat before updating the profile, and writes using the service role. Subscription tables have no client write policies. Purchases are enabled only for a Supabase-authenticated app session so the verified entitlement can be tied to the app account.

## Release checks still requiring store accounts

Create the actual products, agreements, localized prices, trial eligibility, and sandbox testers in the Apple and Google consoles. Then validate new purchase, cancellation, expiry, renewal, refund, restore, account switching, and cross-device access against those stores. Store and RevenueCat configuration cannot be completed from this repository alone.
