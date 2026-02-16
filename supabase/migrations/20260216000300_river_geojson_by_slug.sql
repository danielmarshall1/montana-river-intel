-- RPC: fetch river geometry by slug or river_id (frontend passes selectedRiverId = slug or id string)
-- river_geometries.river_id stores slug; join on r.slug = rg.river_id.

create or replace function public.get_river_geojson_by_slug(p_slug text)
returns jsonb
language sql
stable
as $$
  select
    case
      when rg.geom is null then null
      else jsonb_build_object(
        'type', 'Feature',
        'properties', jsonb_build_object('slug', r.slug, 'river_id', rg.river_id),
        'geometry', st_asgeojson(rg.geom)::jsonb
      )
    end
  from public.rivers r
  join public.river_geometries rg on rg.river_id = r.slug
  where r.slug = p_slug or r.id::text = p_slug
  limit 1;
$$;

grant execute on function public.get_river_geojson_by_slug(text) to anon, authenticated;
