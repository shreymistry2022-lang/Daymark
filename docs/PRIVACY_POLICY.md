# Daymark Privacy Policy

**Effective Date:** November 7, 2026  
**Last Updated:** November 7, 2026

Daymark ("we", "our", or "us") is dedicated to protecting your privacy. This Privacy Policy describes how Daymark collects, uses, stores, and protects your information when you use our mobile application ("App") and related services.

---

## 1. Local-First & Privacy-By-Design Philosophy

Daymark is built with a **local-first** architecture:
- Daymark requires account sign-up (Free or Pro) to ensure your habits, routines, goals, journal reflections, and app preferences are securely protected and backed up.
- Your personal tracking data is stored with local-first performance on your device and synchronized securely to your account via our backend infrastructure.

---

## 2. Information We Collect

### A. Data You Provide Directly
- **Account Information:** When you sign up, we collect your email address and authentication credentials. If you authenticate using Google or Apple Sign-In, we receive authentication tokens and your verified email address provided by the identity provider.
- **Habit and Productivity Data:** Habits, schedules, frequency settings, check-ins, custom notes, routines, milestones, and personal journal reflections you enter.
- **App Preferences:** Selected theme, accent color, week start day, notification preferences, date formatting, and timezone settings.

### B. Automatically Collected Technical Data
- **Device & Operating Information:** Device model, operating system version, and unique app instance identifiers required for error tracking and notification routing.
- **Subscription & Purchase State:** When purchasing Daymark Pro, purchase receipts and transaction identifiers are processed via Google Play Billing / Apple App Store and RevenueCat. We **never** collect, receive, or store your credit card numbers or financial details.

---

## 3. How We Use Your Information

We use the collected information solely for the following purposes:
1. **Core Functionality:** Enabling daily habit tracking, routine sequencing, milestone calculation, and personalized reminders.
2. **Data Synchronization:** Syncing your data safely across devices when you are signed in.
3. **Pro Subscriptions:** Verifying your Daymark Pro entitlement status and restoring purchased benefits across devices.
4. **Local Notifications:** Delivering scheduled habit alerts and reminders at your configured times.
5. **Customer Support:** Responding to your inquiries, bug reports, or feature feedback when you contact us.

We **do not** sell your personal data. We **do not** use your habit or journal entries for profiling, automated decision-making, or targeted behavioral advertising.

---

## 4. Third-Party Service Providers

We partner only with industry-standard, privacy-compliant service providers to operate Daymark:

| Provider | Purpose | Data Handled |
| :--- | :--- | :--- |
| **Supabase** | Cloud authentication and database synchronization | Account credentials, habit/journal records (encrypted in transit and at rest) |
| **RevenueCat** | Subscription entitlement verification & receipt validation | Anonymous App User ID, transaction receipts |
| **Google Play / Apple App Store** | Payment processing & in-app purchases | Payments and store subscription status |
| **Expo / EAS** | Mobile application runtime, crash diagnostics & over-the-air updates | Device OS version, application build version |

---

## 5. Security & Data Protection

- **Data in Transit:** All communications between Daymark and external servers use TLS 1.3/HTTPS encryption.
- **Data at Rest:** Sensitive tokens and credentials on your device are protected using hardware-backed Secure Storage (`expo-secure-store` / Android Keystore / iOS Keychain).
- **Cloud Security:** Cloud databases enforce strict Row-Level Security (RLS) policies ensuring each authenticated user can only access and modify their own records.

---

## 6. Data Retention and Deletion (Your Rights)

You have full control over your personal data:
- **Exporting Data:** You can export your complete history anytime directly from the Profile screen as standard JSON or CSV files.
- **Deleting Your Account & Data:** You can permanently delete your account and all associated cloud and local data at any time directly in the app (**Profile** → **Delete Account & Data**).
- **Manual Request:** You may also email us at **support@daymark.app** or **smsm44186@gmail.com** with the subject "Data Deletion Request". Upon receiving your verified request, all records linked to your account will be permanently deleted from our servers within 14 days.

---

## 7. Children's Privacy

Daymark does not knowingly collect or solicit personal information from children under the age of 13 (or under 16 in the European Economic Area). If we learn that we have collected personal information from a child without parental consent, we will promptly delete that information.

---

## 8. Changes to this Policy

We may update our Privacy Policy periodically. Any updates will be posted at this URL and reflected within the app's Legal & Compliance settings. Continued use of the application after changes constitute acceptance.

---

## 9. Contact Us

If you have questions, concerns, or requests regarding this Privacy Policy or your data, please contact:

- **Email:** support@daymark.app / smsm44186@gmail.com
- **Developer:** Shrey Mistry
- **Repository:** [https://github.com/shreymistry2022-lang/Daymark](https://github.com/shreymistry2022-lang/Daymark)

