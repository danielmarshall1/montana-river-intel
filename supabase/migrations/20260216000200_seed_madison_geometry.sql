-- Seed Madison river geometry
insert into public.river_geometries (river_id, geom)
values (
  'madison',
  st_setsrid(
    st_geomfromgeojson('{"type":"LineString","coordinates":[[-111.65,44.65],[-111.30,44.86],[-111.02,45.06]]}'),
    4326
  )
)
on conflict (river_id) do update
set geom = excluded.geom;
