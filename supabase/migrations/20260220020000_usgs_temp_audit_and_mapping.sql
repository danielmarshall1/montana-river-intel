-- Temp availability audit support + optional split-site mapping.
-- Additive only.

create table if not exists public.usgs_site_parameters (
  site_no text primary key,
  has_temp_iv boolean not null default false,
  has_temp_dv boolean not null default false,
  checked_at timestamptz not null default now()
);

alter table public.usgs_site_parameters enable row level security;

drop policy if exists "Allow public read usgs_site_parameters" on public.usgs_site_parameters;
create policy "Allow public read usgs_site_parameters"
  on public.usgs_site_parameters for select
  using (true);

create table if not exists public.river_usgs_map (
  river_id uuid primary key references public.rivers(id) on delete cascade,
  flow_site_no text not null,
  temp_site_no text not null,
  stage_site_no text not null,
  updated_at timestamptz not null default now()
);

insert into public.river_usgs_map (river_id, flow_site_no, temp_site_no, stage_site_no)
select
  r.id,
  r.usgs_site_no,
  r.usgs_site_no,
  r.usgs_site_no
from public.rivers r
where r.usgs_site_no is not null
on conflict (river_id) do update
set
  flow_site_no = excluded.flow_site_no,
  temp_site_no = coalesce(public.river_usgs_map.temp_site_no, excluded.temp_site_no),
  stage_site_no = coalesce(public.river_usgs_map.stage_site_no, excluded.stage_site_no),
  updated_at = now();

alter table public.river_usgs_map enable row level security;

drop policy if exists "Allow public read river_usgs_map" on public.river_usgs_map;
create policy "Allow public read river_usgs_map"
  on public.river_usgs_map for select
  using (true);

