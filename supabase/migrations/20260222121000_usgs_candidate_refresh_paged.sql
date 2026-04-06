-- Chunked candidate refresh to avoid API statement timeout caps.

create or replace function public.refresh_usgs_site_river_candidates_paged(
  p_threshold_m numeric default 2000,
  p_top_n integer default 3,
  p_only_active_sites boolean default true,
  p_site_limit integer default 250,
  p_site_offset integer default 0,
  p_clear_first_page boolean default true
)
returns table (
  processed_sites integer,
  inserted_rows integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_processed integer := 0;
  v_inserted integer := 0;
begin
  set local statement_timeout = '120s';
  if p_top_n < 1 then
    raise exception 'p_top_n must be >= 1';
  end if;

  if p_site_limit < 1 then
    raise exception 'p_site_limit must be >= 1';
  end if;

  if p_site_offset < 0 then
    raise exception 'p_site_offset must be >= 0';
  end if;

  if p_site_offset = 0 and p_clear_first_page then
    truncate table public.usgs_site_river_candidates;
  end if;

  with site_subset as (
    select s.site_no, s.station_name, s.state, s.lat, s.lon, s.active, s.parameter_codes,
           st_setsrid(st_makepoint(s.lon, s.lat), 4326) as geom
    from public.usgs_sites s
    where s.lat is not null
      and s.lon is not null
      and (not p_only_active_sites or s.active = true)
    order by s.site_no
    limit p_site_limit
    offset p_site_offset
  ),
  river_geom as (
    select
      r.id as river_id,
      coalesce(r.river_name, r.slug, r.id::text) as river_name,
      rg.geom
    from public.rivers r
    join public.river_geometries rg
      on rg.river_id::text = r.id::text
      or (r.slug is not null and rg.river_id::text = r.slug)
    where r.is_active = true
      and rg.geom is not null
  ),
  candidates as (
    select
      ss.site_no,
      rg.river_id,
      st_distance(ss.geom::geography, rg.geom::geography)::numeric as distance_m,
      rg.river_name,
      ss.station_name,
      row_number() over (
        partition by ss.site_no
        order by st_distance(ss.geom::geography, rg.geom::geography) asc, rg.river_id
      ) as rn
    from site_subset ss
    join river_geom rg
      on st_dwithin(ss.geom::geography, rg.geom::geography, p_threshold_m)
  ),
  scored as (
    select
      c.site_no,
      c.river_id,
      c.distance_m,
      'nearest_geom'::text as method,
      least(
        1.0,
        greatest(
          0.0,
          (1.0 - (c.distance_m / nullif(p_threshold_m, 0))) +
          case
            when lower(coalesce(c.station_name, '')) like '%' || split_part(lower(coalesce(c.river_name, '')), ' ', 1) || '%'
              then 0.15
            else 0
          end
        )
      )::numeric as confidence,
      c.rn
    from candidates c
    where c.rn <= p_top_n
  ),
  deleted as (
    delete from public.usgs_site_river_candidates uc
    using site_subset ss
    where uc.site_no = ss.site_no
    returning uc.site_no
  ),
  inserted as (
    insert into public.usgs_site_river_candidates (site_no, river_id, distance_m, method, confidence)
    select site_no, river_id, distance_m, method, confidence
    from scored
    returning site_no
  )
  select
    (select count(*)::integer from site_subset),
    (select count(*)::integer from inserted)
  into v_processed, v_inserted;

  return query select coalesce(v_processed, 0), coalesce(v_inserted, 0);
end;
$$;

grant execute on function public.refresh_usgs_site_river_candidates_paged(numeric, integer, boolean, integer, integer, boolean)
  to anon, authenticated, service_role;
