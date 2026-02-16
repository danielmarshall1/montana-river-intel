-- Enable PostGIS (safe to run multiple times)
create extension if not exists postgis;

-- Store river centerlines (LineString WGS84)
-- river_id matches app's FishabilityRow.river_id (slug or id string from rivers/river_daily_scores)
create table if not exists public.river_geometries (
  river_id text primary key,
  geom geometry(LineString, 4326) not null,
  geom_simplified geometry(LineString, 4326),
  updated_at timestamptz not null default now()
);

-- Keep updated_at fresh on updates
create or replace function public._touch_river_geometries_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_river_geometries on public.river_geometries;
create trigger trg_touch_river_geometries
before update on public.river_geometries
for each row execute procedure public._touch_river_geometries_updated_at();

-- RLS: allow public read (same pattern as rivers + scores)
alter table public.river_geometries enable row level security;

drop policy if exists "river_geometries_public_read" on public.river_geometries;
create policy "river_geometries_public_read"
on public.river_geometries
for select
to anon, authenticated
using (true);

-- RPC: return GeoJSON geometry (jsonb) for a river_id
create or replace function public.get_river_geojson(p_river_id text)
returns jsonb
language sql
stable
as $$
  select
    case
      when rg.geom_simplified is not null then st_asgeojson(rg.geom_simplified)::jsonb
      else st_asgeojson(rg.geom)::jsonb
    end
  from public.river_geometries rg
  where rg.river_id = p_river_id;
$$;

grant execute on function public.get_river_geojson(text) to anon, authenticated;
