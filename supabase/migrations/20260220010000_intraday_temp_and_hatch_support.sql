-- Intraday thermal support for tactical decision windows.
-- Additive only: no existing table/view rewrites.

create table if not exists public.river_hourly (
  river_id uuid not null references public.rivers(id) on delete cascade,
  observed_at timestamptz not null,
  obs_date date not null,
  flow_cfs numeric,
  water_temp_f numeric,
  gage_height_ft numeric,
  source text not null default 'usgs_iv',
  created_at timestamptz not null default now(),
  primary key (river_id, observed_at)
);

create index if not exists idx_river_hourly_river_obs on public.river_hourly (river_id, observed_at desc);
create index if not exists idx_river_hourly_obs_date on public.river_hourly (obs_date desc);

alter table public.river_hourly enable row level security;

drop policy if exists "Allow public read river_hourly" on public.river_hourly;
create policy "Allow public read river_hourly"
  on public.river_hourly for select
  using (true);

create or replace function public.river_intraday_24h(p_river_id uuid)
returns table (
  observed_at timestamptz,
  flow_cfs numeric,
  water_temp_f numeric,
  gage_height_ft numeric
)
language sql
stable
as $$
  select
    h.observed_at,
    h.flow_cfs,
    h.water_temp_f,
    h.gage_height_ft
  from public.river_hourly h
  where h.river_id = p_river_id
    and h.observed_at >= now() - interval '24 hours'
  order by h.observed_at asc;
$$;

grant execute on function public.river_intraday_24h(uuid) to anon, authenticated, service_role;

