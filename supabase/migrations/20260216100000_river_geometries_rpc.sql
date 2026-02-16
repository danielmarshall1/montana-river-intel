-- Run in Supabase Dashboard → SQL Editor
-- Ensures: river_geometries (uuid FK), RLS, RPC get_river_geojson_by_slug (slug OR id)

create extension if not exists postgis;

-- 1) Table to store geometries (river_id uuid FK to rivers.id)
-- If rivers.id is bigint, change river_id to bigint and FK accordingly.
create table if not exists public.river_geometries (
  river_id uuid primary key references public.rivers(id) on delete cascade,
  geom geometry(MultiLineString, 4326) not null,
  updated_at timestamptz not null default now()
);

-- If your lines are LineString not MultiLineString, use:
-- geom geometry(Geometry, 4326) not null

-- 2) Make it readable from the browser (anon key)
alter table public.river_geometries enable row level security;

drop policy if exists "public_read" on public.river_geometries;
create policy "public_read"
on public.river_geometries
for select
to anon, authenticated
using (true);

grant select on public.river_geometries to anon, authenticated;

-- 3) RPC: slug OR id -> GeoJSON Feature (jsonb)
create or replace function public.get_river_geojson_by_slug(p_slug text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'type','Feature',
    'geometry', (st_asgeojson(rg.geom)::jsonb),
    'properties', jsonb_build_object(
      'river_id', r.id,
      'slug', r.slug,
      'name', coalesce(r.river_name, r.name, r.slug)
    )
  )
  from public.rivers r
  join public.river_geometries rg on rg.river_id = r.id
  where r.slug = p_slug
     or r.id::text = p_slug
  limit 1;
$$;

grant execute on function public.get_river_geojson_by_slug(text) to anon, authenticated;
