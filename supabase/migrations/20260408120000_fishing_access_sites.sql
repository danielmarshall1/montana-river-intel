create table if not exists public.fishing_access_sites (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  river_id       uuid references public.rivers(id) on delete set null,
  river_confidence text, -- 'high', 'moderate', 'low'
  lat            double precision not null,
  lng            double precision not null,
  geom           geometry(Point, 4326) not null,
  source         text default 'fwp',
  created_at     timestamptz default now()
);

create index if not exists fishing_access_sites_geom_idx
  on public.fishing_access_sites using gist (geom);

create index if not exists fishing_access_sites_river_id_idx
  on public.fishing_access_sites (river_id);

alter table public.fishing_access_sites
  add constraint if not exists fishing_access_sites_name_lat_lng_key unique (name, lat, lng);

grant select on public.fishing_access_sites to anon, authenticated, service_role;
