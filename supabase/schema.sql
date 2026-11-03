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
create policy "Users can view their own habits"
  on public.habits for select
  using (auth.uid() = user_id);

create policy "Users can insert their own habits"
  on public.habits for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own habits"
  on public.habits for update
  using (auth.uid() = user_id);

create policy "Users can delete their own habits"
  on public.habits for delete
  using (auth.uid() = user_id);

-- 4. High-performance index for user habit lookups
create index if not exists habits_user_id_idx on public.habits (user_id);

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

