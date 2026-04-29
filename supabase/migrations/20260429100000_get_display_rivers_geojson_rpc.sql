-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: get_display_rivers_geojson
-- Returns a GeoJSON FeatureCollection of all display-only river geometries
-- (rivers where is_active = false and a river_geometries row exists).
-- Called by fetchDisplayRiversGeojson() in supabase-server.ts.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.get_display_rivers_geojson()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'type',       'Feature',
          'geometry',   st_asgeojson(rg.geom)::jsonb,
          'properties', jsonb_build_object(
            'river_id',   r.id,
            'slug',       r.slug,
            'river_name', r.river_name,
            'name',       r.river_name
          )
        )
      ),
      '[]'::jsonb
    )
  )
  from public.rivers r
  join public.river_geometries rg on rg.river_id = r.id
  where r.is_active = false
    and rg.geom is not null;
$$;

grant execute on function public.get_display_rivers_geojson() to anon, authenticated, service_role;
