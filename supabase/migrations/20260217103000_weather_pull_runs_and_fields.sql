-- Weather ingestion run logging + additional weather fields

create extension if not exists pgcrypto;

create table if not exists public.weather_pull_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running', -- running | success | partial | failed
  cadence text not null default 'manual',
  rivers_total integer not null default 0,
  rivers_ok integer not null default 0,
  rivers_failed integer not null default 0,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_weather_pull_runs_started_at on public.weather_pull_runs (started_at desc);

alter table if exists public.weather_daily add column if not exists air_temp_high_f numeric;
alter table if exists public.weather_daily add column if not exists air_temp_low_f numeric;
alter table if exists public.weather_daily add column if not exists precip_probability_pct numeric;
alter table if exists public.weather_daily add column if not exists wind_speed_max_mph numeric;

alter table public.weather_pull_runs enable row level security;
drop policy if exists "Allow public read weather_pull_runs" on public.weather_pull_runs;
create policy "Allow public read weather_pull_runs"
  on public.weather_pull_runs for select
  using (true);

grant select on public.weather_pull_runs to anon, authenticated;
