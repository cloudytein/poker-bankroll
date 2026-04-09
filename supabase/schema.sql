create extension if not exists pgcrypto;

create table if not exists public.poker_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  game_type text not null,
  custom_game_type text not null default '',
  buy_in numeric not null,
  payout numeric,
  cash_out numeric,
  stakes text not null default '',
  location text not null default '',
  net numeric not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.banker_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  game_type text not null default '',
  custom_game_type text not null default '',
  players jsonb not null default '[]'::jsonb,
  saved_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.banker_drafts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  date date not null,
  game_type text not null default '',
  custom_game_type text not null default '',
  players jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.poker_sessions enable row level security;
alter table public.banker_days enable row level security;
alter table public.banker_drafts enable row level security;

drop policy if exists "Users manage own poker sessions" on public.poker_sessions;
create policy "Users manage own poker sessions"
on public.poker_sessions
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own banker days" on public.banker_days;
create policy "Users manage own banker days"
on public.banker_days
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own banker draft" on public.banker_drafts;
create policy "Users manage own banker draft"
on public.banker_drafts
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
