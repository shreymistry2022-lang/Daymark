-- =========================================================
-- DAYMARK - SUPABASE CLOUD DATABASE SCHEMA
-- =========================================================
-- Run this in your Supabase project's SQL Editor (SQL Editor -> New query -> Run).

-- 1. Create habits table
create table if not exists public.habits (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  category text not null,
  color text not null,
  icon text not null,
  streak integer default 0,
  completed_dates text[] default array[]::text[],
  target_frequency text default 'Daily',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Enable Row Level Security (RLS) so users only see and edit their own data
alter table public.habits enable row level security;

-- 3. Security policies (CRUD scoped to auth.uid())
drop policy if exists "Users can view their own habits" on public.habits;
create policy "Users can view their own habits"
  on public.habits for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own habits" on public.habits;
create policy "Users can insert their own habits"
  on public.habits for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own habits" on public.habits;
create policy "Users can update their own habits"
  on public.habits for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own habits" on public.habits;
create policy "Users can delete their own habits"
  on public.habits for delete
  using (auth.uid() = user_id);

-- 4. High-performance index for user habit lookups
create index if not exists habits_user_id_idx on public.habits (user_id);

-- Expanded habit configuration. Existing completed_dates are retained as a migration source.
alter table public.habits add column if not exists description text not null default '';
alter table public.habits add column if not exists habit_kind text not null default 'positive';
alter table public.habits add column if not exists tracking_method text not null default 'yes_no';
alter table public.habits add column if not exists target_value numeric not null default 1;
alter table public.habits add column if not exists unit text;
alter table public.habits add column if not exists schedule jsonb not null default '{"frequency":"daily"}'::jsonb;
alter table public.habits add column if not exists start_date date;
alter table public.habits add column if not exists end_date date;
alter table public.habits add column if not exists archived_at timestamptz;
alter table public.habits add column if not exists paused_periods jsonb not null default '[]'::jsonb;
alter table public.habits add column if not exists configuration_history jsonb not null default '[]'::jsonb;
alter table public.habits add column if not exists configuration_effective_from date not null default current_date;
alter table public.habits add column if not exists sort_order integer not null default 0;
alter table public.habits add column if not exists reminders jsonb not null default '[]'::jsonb;

-- Preserve pre-migration history by backfilling start dates from legacy completion dates.
update public.habits h
set start_date = coalesce(
  (select min(logged_date::date) from unnest(h.completed_dates) as logged_date where logged_date ~ '^\d{4}-\d{2}-\d{2}$'),
  h.created_at::date
)
where h.start_date is null;
alter table public.habits alter column start_date set default current_date;
alter table public.habits alter column start_date set not null;

create table if not exists public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  habit_id text references public.habits(id) on delete cascade not null,
  log_date date not null,
  value numeric,
  outcome text not null default 'completed',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (habit_id, log_date)
);

create table if not exists public.habit_configuration_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  habit_id text references public.habits(id) on delete cascade not null,
  effective_from date not null,
  configuration jsonb not null,
  created_at timestamptz not null default now(),
  unique (habit_id, effective_from)
);

create table if not exists public.habit_reminders (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  habit_id text references public.habits(id) on delete cascade not null,
  hour smallint not null check (hour between 0 and 23),
  minute smallint not null check (minute between 0 and 59),
  weekdays smallint[] not null default array[1,2,3,4,5,6,7],
  enabled boolean not null default true,
  notification_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  wake_time time,
  sleep_time time,
  week_start smallint not null default 1 check (week_start between 0 and 6),
  timezone text not null default 'UTC',
  date_format text not null default 'system',
  haptics_enabled boolean not null default true,
  sound_enabled boolean not null default true,
  notification_preferences jsonb not null default '{}'::jsonb,
  dashboard_sort text not null default 'custom',
  accent_color text,
  theme_mode text not null default 'automatic' check (theme_mode in ('automatic', 'midnight', 'pure', 'light')),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences add column if not exists theme_mode text not null default 'automatic';

create table if not exists public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  description text not null default '',
  schedule jsonb not null default '{"frequency":"daily"}'::jsonb,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.routines add column if not exists reminders jsonb not null default '[]'::jsonb;

create table if not exists public.routine_habits (
  routine_id uuid references public.routines(id) on delete cascade not null,
  habit_id text references public.habits(id) on delete cascade not null,
  sort_order integer not null default 0,
  primary key (routine_id, habit_id)
);

create table if not exists public.routine_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  routine_id uuid references public.routines(id) on delete cascade not null,
  log_date date not null,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (routine_id, log_date)
);
alter table public.routine_logs add column if not exists updated_at timestamptz not null default now();

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  description text not null default '',
  category text not null default 'Personal',
  start_date date not null default current_date,
  target_date date,
  target_value numeric,
  unit text,
  archived_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.goal_habits (
  goal_id uuid references public.goals(id) on delete cascade not null,
  habit_id text references public.habits(id) on delete cascade not null,
  primary key (goal_id, habit_id)
);

create table if not exists public.goal_milestones (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid references public.goals(id) on delete cascade not null,
  title text not null,
  target_value numeric,
  reached_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  habit_id text references public.habits(id) on delete set null,
  entry_date date not null,
  text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  achievement_key text not null,
  unlocked_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (user_id, achievement_key)
);

create table if not exists public.performance_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  period_type text not null check (period_type in ('week', 'month')),
  period_start date not null,
  period_end date not null,
  report_data jsonb not null,
  generated_at timestamptz not null default now(),
  unique (user_id, period_type, period_start)
);

create index if not exists habit_logs_user_date_idx on public.habit_logs (user_id, log_date desc);
create index if not exists journal_entries_user_date_idx on public.journal_entries (user_id, entry_date desc);

-- User-owned rows are writable only by their authenticated owner. Service role remains reserved for trusted functions.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'habit_logs', 'habit_configuration_history', 'habit_reminders', 'user_preferences',
    'routines', 'routine_logs', 'goals', 'journal_entries', 'achievements', 'performance_reports'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_owner_select', table_name);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = auth.uid())', table_name || '_owner_select', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_owner_insert', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = auth.uid())', table_name || '_owner_insert', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_owner_update', table_name);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', table_name || '_owner_update', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_owner_delete', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = auth.uid())', table_name || '_owner_delete', table_name);
  end loop;
end $$;

-- Child records must belong to both the signed-in user and a parent habit they own.
drop policy if exists habit_logs_owner_select on public.habit_logs;
create policy habit_logs_owner_select on public.habit_logs for select to authenticated
  using (user_id = auth.uid() and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid()));
drop policy if exists habit_logs_owner_insert on public.habit_logs;
create policy habit_logs_owner_insert on public.habit_logs for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid()));
drop policy if exists habit_logs_owner_update on public.habit_logs;
create policy habit_logs_owner_update on public.habit_logs for update to authenticated
  using (user_id = auth.uid() and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid()))
  with check (user_id = auth.uid() and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid()));
drop policy if exists habit_logs_owner_delete on public.habit_logs;
create policy habit_logs_owner_delete on public.habit_logs for delete to authenticated
  using (user_id = auth.uid() and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid()));

drop policy if exists habit_configuration_history_owner_select on public.habit_configuration_history;
create policy habit_configuration_history_owner_select on public.habit_configuration_history for select to authenticated
  using (user_id = auth.uid() and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid()));
drop policy if exists habit_configuration_history_owner_insert on public.habit_configuration_history;
create policy habit_configuration_history_owner_insert on public.habit_configuration_history for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid()));
drop policy if exists habit_configuration_history_owner_update on public.habit_configuration_history;
create policy habit_configuration_history_owner_update on public.habit_configuration_history for update to authenticated
  using (user_id = auth.uid() and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid()))
  with check (user_id = auth.uid() and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid()));
drop policy if exists habit_configuration_history_owner_delete on public.habit_configuration_history;
create policy habit_configuration_history_owner_delete on public.habit_configuration_history for delete to authenticated
  using (user_id = auth.uid() and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid()));

drop policy if exists habit_reminders_owner_select on public.habit_reminders;
create policy habit_reminders_owner_select on public.habit_reminders for select to authenticated
  using (user_id = auth.uid() and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid()));
drop policy if exists habit_reminders_owner_insert on public.habit_reminders;
create policy habit_reminders_owner_insert on public.habit_reminders for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid()));
drop policy if exists habit_reminders_owner_update on public.habit_reminders;
create policy habit_reminders_owner_update on public.habit_reminders for update to authenticated
  using (user_id = auth.uid() and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid()))
  with check (user_id = auth.uid() and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid()));
drop policy if exists habit_reminders_owner_delete on public.habit_reminders;
create policy habit_reminders_owner_delete on public.habit_reminders for delete to authenticated
  using (user_id = auth.uid() and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid()));

drop policy if exists routine_logs_owner_select on public.routine_logs;
create policy routine_logs_owner_select on public.routine_logs for select to authenticated
  using (user_id = auth.uid() and exists (select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid()));
drop policy if exists routine_logs_owner_insert on public.routine_logs;
create policy routine_logs_owner_insert on public.routine_logs for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid()));
drop policy if exists routine_logs_owner_update on public.routine_logs;
create policy routine_logs_owner_update on public.routine_logs for update to authenticated
  using (user_id = auth.uid() and exists (select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid()))
  with check (user_id = auth.uid() and exists (select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid()));
drop policy if exists routine_logs_owner_delete on public.routine_logs;
create policy routine_logs_owner_delete on public.routine_logs for delete to authenticated
  using (user_id = auth.uid() and exists (select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid()));

drop policy if exists journal_entries_owner_select on public.journal_entries;
create policy journal_entries_owner_select on public.journal_entries for select to authenticated
  using (user_id = auth.uid() and (habit_id is null or exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid())));
drop policy if exists journal_entries_owner_insert on public.journal_entries;
create policy journal_entries_owner_insert on public.journal_entries for insert to authenticated
  with check (user_id = auth.uid() and (habit_id is null or exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid())));
drop policy if exists journal_entries_owner_update on public.journal_entries;
create policy journal_entries_owner_update on public.journal_entries for update to authenticated
  using (user_id = auth.uid() and (habit_id is null or exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid())))
  with check (user_id = auth.uid() and (habit_id is null or exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid())));
drop policy if exists journal_entries_owner_delete on public.journal_entries;
create policy journal_entries_owner_delete on public.journal_entries for delete to authenticated
  using (user_id = auth.uid() and (habit_id is null or exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid())));

alter table public.goal_milestones enable row level security;
drop policy if exists goal_milestones_owner_select on public.goal_milestones;
create policy goal_milestones_owner_select on public.goal_milestones for select to authenticated
  using (exists (select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid()));
drop policy if exists goal_milestones_owner_insert on public.goal_milestones;
create policy goal_milestones_owner_insert on public.goal_milestones for insert to authenticated
  with check (exists (select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid()));
drop policy if exists goal_milestones_owner_update on public.goal_milestones;
create policy goal_milestones_owner_update on public.goal_milestones for update to authenticated
  using (exists (select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid()))
  with check (exists (select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid()));
drop policy if exists goal_milestones_owner_delete on public.goal_milestones;
create policy goal_milestones_owner_delete on public.goal_milestones for delete to authenticated
  using (exists (select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid()));

alter table public.routine_habits enable row level security;
drop policy if exists routine_habits_owner_select on public.routine_habits;
create policy routine_habits_owner_select on public.routine_habits for select to authenticated
  using (exists (select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid())
    and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid()));
drop policy if exists routine_habits_owner_insert on public.routine_habits;
create policy routine_habits_owner_insert on public.routine_habits for insert to authenticated
  with check (exists (select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid())
    and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid()));
drop policy if exists routine_habits_owner_delete on public.routine_habits;
create policy routine_habits_owner_delete on public.routine_habits for delete to authenticated
  using (exists (select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid())
    and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid()));

alter table public.goal_habits enable row level security;
drop policy if exists goal_habits_owner_select on public.goal_habits;
create policy goal_habits_owner_select on public.goal_habits for select to authenticated
  using (exists (select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid())
    and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid()));
drop policy if exists goal_habits_owner_insert on public.goal_habits;
create policy goal_habits_owner_insert on public.goal_habits for insert to authenticated
  with check (exists (select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid())
    and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid()));
drop policy if exists goal_habits_owner_delete on public.goal_habits;
create policy goal_habits_owner_delete on public.goal_habits for delete to authenticated
  using (exists (select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid())
    and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid()));

-- Subscription state is written only by the trusted RevenueCat webhook function.
create table if not exists public.subscription_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique,
  entitlement_status text not null default 'inactive',
  product_id text,
  subscription_type text,
  platform text,
  trial_started_at timestamptz,
  expires_at timestamptz,
  will_renew boolean,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text unique,
  user_id text not null,
  event_type text not null,
  product_id text,
  platform text,
  event_timestamp timestamptz not null,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.subscription_profiles enable row level security;
alter table public.subscription_events enable row level security;

drop policy if exists "Users can view their own subscription profile" on public.subscription_profiles;
create policy "Users can view their own subscription profile"
  on public.subscription_profiles for select to authenticated
  using (user_id = auth.uid()::text);

-- No client write policies are intentionally defined for either table.

-- Helper: Grant complimentary Pro access to VIP / admin emails in Supabase
insert into public.subscription_profiles (user_id, entitlement_status, subscription_type, platform, will_renew, updated_at)
select id::text, 'active', 'complimentary_lifetime', 'admin', true, now()
from auth.users
where lower(email) in ('smsm44186@gmail.com')
on conflict (user_id) do update set
  entitlement_status = 'active',
  subscription_type = 'complimentary_lifetime',
  updated_at = now();


