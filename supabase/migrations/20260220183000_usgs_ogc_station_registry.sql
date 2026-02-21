create table if not exists public.usgs_station_registry (
  river_id text not null,
  river_slug text,
  river_name text,
  monitoring_location_id text not null,
  site_no text not null,
  station_name text,
  latitude double precision,
  longitude double precision,
  parameter_codes text[] not null default '{}',
  has_flow boolean not null default false,
  has_temp boolean not null default false,
  has_wq boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  ts_metadata jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  is_active boolean not null default true,
  primary key (river_id, site_no)
);

create index if not exists idx_usgs_station_registry_site on public.usgs_station_registry (site_no);
create index if not exists idx_usgs_station_registry_active on public.usgs_station_registry (river_id, is_active, has_flow, has_temp);

alter table public.usgs_station_registry enable row level security;

drop policy if exists "Allow public read usgs_station_registry" on public.usgs_station_registry;
create policy "Allow public read usgs_station_registry"
  on public.usgs_station_registry for select
  to anon, authenticated
  using (true);

create table if not exists public.river_station_parameter_config (
  river_id text not null,
  parameter_code text not null,
  site_no text not null,
  priority integer not null default 100,
  is_enabled boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (river_id, parameter_code, site_no),
  constraint river_station_parameter_code_check check (parameter_code in ('00060', '00010', 'WQ'))
);

create index if not exists idx_river_station_parameter_config_lookup
  on public.river_station_parameter_config (river_id, parameter_code, is_enabled, priority);

create or replace function public._touch_river_station_parameter_config_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_river_station_parameter_config on public.river_station_parameter_config;
create trigger trg_touch_river_station_parameter_config
before update on public.river_station_parameter_config
for each row execute procedure public._touch_river_station_parameter_config_updated_at();

alter table public.river_station_parameter_config enable row level security;

drop policy if exists "Allow public read river_station_parameter_config" on public.river_station_parameter_config;
create policy "Allow public read river_station_parameter_config"
  on public.river_station_parameter_config for select
  to anon, authenticated
  using (true);

-- Returns per-river geometry envelope in WGS84 for OGC station search.
create or replace function public.list_river_bboxes()
returns table (
  river_id text,
  river_slug text,
  river_name text,
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision
)
language sql
stable
as $$
  select
    r.id::text as river_id,
    r.slug as river_slug,
    coalesce(r.river_name, r.slug, r.id::text) as river_name,
    st_xmin(rg.geom)::double precision as min_lng,
    st_ymin(rg.geom)::double precision as min_lat,
    st_xmax(rg.geom)::double precision as max_lng,
    st_ymax(rg.geom)::double precision as max_lat
  from public.rivers r
  join public.river_geometries rg
    on rg.river_id::text = r.id::text
    or (r.slug is not null and rg.river_id::text = r.slug)
  where rg.geom is not null;
$$;

grant execute on function public.list_river_bboxes() to anon, authenticated;
grant select on public.usgs_station_registry to anon, authenticated;
grant select on public.river_station_parameter_config to anon, authenticated;
