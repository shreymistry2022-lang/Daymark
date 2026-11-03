# DAYMARK feature implementation checklist

Tracking status for the complete feature specification. A checked item means implemented and verified in this repository; app-store, OAuth-provider, Supabase and device-only setup is called out separately.

## Dependency order & Implementation Audit

- [x] 01. Account and onboarding (Guest mode with persistent storage, SecureStore offline credential storage, Supabase auth with rate limit handling, PKCE OAuth for Google/Apple, deep-link password recovery and in-app password reset, account deletion [App Store 5.1.1(v)], and 12 curated starter templates across 4 life pillars)
- [x] 02. Today dashboard (Timezone-aware greeting, formatted date, Swiss progress card with 100% celebration, configurable 7-day week strip, historical review & logging, category filters, HabitTrackingControl, and custom habit reordering)
- [x] 03. Habit management (Create, edit, pause with date intervals, resume, archive/restore toggle, delete confirmation, 14 categories, 8 colors, 14 icons, and preset templates)
- [x] 04. Scheduling engine (Daily, weekdays, weekends, selected days, weekly targets, monthly dates, start/end bounds, pause intervals, and quit-habit inverse logic)
- [x] 05. Daily tracking (Yes/no toggle, numeric count +/- with target values, measurable progress bar with custom units, quit lapse logging/undo, and past-day edits)
- [x] 06. Calendar and heatmaps (Dynamic current year/month, cross-year navigation, accurate weekday grid alignment, 6 heatmap color palettes, activity intensity 0–3, and day inspector with direct toggle controls)
- [x] 07. Habit detail (Current streak, best streak, 30-day consistency rate, total check-ins, schedule summary, reminder times, pause history, and direct navigation from search via focusHabitId)
- [x] 08. Analytics (Schedule-aware date windows '7D' | '30D' | '90D' | 'ALL', previous cycle comparison, dynamic trailing 7-day consistency chart, habit consistency leaderboard, and milestone unlocks)
- [x] 09. Shared streak engine foundation (Centralized deterministic rules for positive and quit habits, scheduled gaps, partial measurable progress, and edge case test suite)
- [x] 10. Local reminders (Expo-notifications recurring daily and weekly triggers, permission checks, pause/archive auto-cancellation, and Pro multi-reminder gate)
- [x] 11. Routines (Routine builder, linked habit selection, schedule setting, local reminders, reordering, daily progress tracking, local-first Supabase sync, and Pro gate)
- [x] 12. Goals (Linked habit progress aggregation, target values, custom milestones, archive/restore, completion rules, local/cloud persistence, and Pro gate)
- [x] 13. Journal and notes (Private reflections, date picker, optional habit linking, search, habit filtering, local-first Supabase sync, and 10k character support)
- [x] 14. Achievements (Activity-derived unlock criteria, duplicate-safe cloud persistence, progress cards, unlocked badge history, and celebration triggers)
- [x] 15. Reports (53 weekly and 25 monthly reports, schedule-aware completion rates, previous-period improvement comparisons, best day, strongest/weakest habit analysis, and monthly trend charts)
- [x] 16. Home screen widgets (Expo SDK 58 widget module registered for iOS small/medium and Android Today summary)
- [x] 17. Search and organisation (Cross-entity search across habits, routines, goals, and journal entries; filters for active/archived/positive/quit and categories; sorting by recent, alphabetical, consistency, and completion; direct navigation to records)
- [x] 18. Personalisation and preferences (Automatic/manual theme modes, Midnight, Pure [Pro], Light, accent palette, week start Mon/Sun, date formats [System, US, UK, ISO], timezone support, daily wake/sleep rhythm, and haptic/sound toggles)
- [x] 19. Export and synchronisation (Downloadable/shareable JSON backup and CSV tables containing habits, logs, routines, goals, journal, achievements, and stats; web blob and mobile file sharing)
- [x] 20. Accessibility, loading, empty and error states (Accessibility roles, accessible labels, loading spinners, empty state illustrations with action buttons, and cloud offline banners)
- [x] 21. Monetization foundation (RevenueCat integration, daymark_pro entitlement, 5-habit free limit, PaywallModal with annual/monthly packages, restore purchases, and Supabase webhook function)
- [x] 22. Automated tests and validation (TypeScript check, Expo lint, and 9 Jest test suites with 29 deterministic unit tests passing)

## Foundation work completed

- [x] Define typed habit scheduling, tracking, pause, reminder and log contracts.
- [x] Centralize date, scheduling, day-status and streak calculations.
- [x] Remove generated demo activity from new installs; preserve existing local history.
- [x] Add Expo-compatible Jest preset and Expo SDK 58 notification/haptics dependencies.
- [x] Preserve legacy `completed_dates` and backfill cloud start dates from the earliest recorded date.
- [x] Persist logs, configuration snapshots and pause/archive state within local habit storage and Supabase habit rows/log table.
- [x] Add local-first routine storage, cloud child tables, delete tombstones and deterministic routine progress tests.
- [x] Add deterministic tests for scheduling, streak rules, tracking eligibility, completion rates, calendar intensity, routine progress, goal aggregation, journal validation/search, achievement criteria, report calculations, preference date formatting, week-start calculations and CSV/JSON export (29 pass).
- [x] Protect offline credentials with native `SecureStore` chunked storage instead of plaintext `AsyncStorage`.
- [x] Implement real password recovery, in-app password reset, Google and Apple OAuth, and account deletion per App Store guideline 5.1.1(v).

## Validation status

- TypeScript: `npx tsc --noEmit` passes (0 errors).
- Expo lint: `npx expo lint` passes (0 errors).
- Jest: `npm test -- --watch=false` passes (9 suites, 29 tests passing).

## External setup required (Store & Cloud infrastructure)

- **Supabase**:
  - Run `supabase/schema.sql` in project SQL editor to apply migrations and RLS policies.
  - Enable Google/Apple OAuth providers in Supabase Authentication Dashboard and add `daymark://auth/callback` to the Redirect URL allowlist.
  - (Optional) Deploy `supabase/functions/delete-account` Edge Function for server-side auth user deletion.
- **RevenueCat**:
  - Configure `daymark_pro_monthly` and `daymark_pro_annual` products with the `daymark_pro` entitlement.
  - Set `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` and `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` in EAS build environment.
  - Deploy `supabase/functions/revenuecat-webhook` Edge Function and set webhook secrets (`REVENUECAT_WEBHOOK_AUTHORIZATION`, `REVENUECAT_SECRET_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
- **Native Device Builds**:
  - Build with EAS (`npx eas-cli build -p android` / `ios`) to test native push notifications, SecureStore, and home screen widgets on physical hardware.

