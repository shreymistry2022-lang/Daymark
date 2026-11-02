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

