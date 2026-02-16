-- RPC: get_river_geojson_by_slug(p_slug text)
-- Schema: rivers.id (uuid), rivers.slug (text)
--         river_geometries.river_id (uuid FK to rivers.id), river_geometries.geom (geometry)
-- Join: river_geometries.river_id = rivers.id, filter by rivers.slug = p_slug

create or replace function public.get_river_geojson_by_slug(p_slug text)
returns json
language sql
stable
as $$
  select json_build_object(
    'type', 'Feature',
    'properties', json_build_object(
      'slug', r.slug,
      'river_name', r.river_name
    ),
    'geometry', st_asgeojson(rg.geom)::json
  )
  from public.rivers r
  join public.river_geometries rg
    on rg.river_id = r.id
  where r.slug = p_slug
  limit 1;
$$;

grant execute on function public.get_river_geojson_by_slug(text) to anon, authenticated;

-- Reload PostgREST schema cache so /rpc endpoint sees the function
select pg_notify('pgrst', 'reload schema');
