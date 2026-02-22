begin;

create or replace function public.refresh_river_usgs_temp_suggestions(
  p_river_id uuid default null,
  p_auto_apply boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
begin
  with river_scope as (
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
      and (p_river_id is null or r.id = p_river_id)
  ),
  temp_candidates as (
    select
      rs.river_id,
      s.site_no,
      s.station_name,
      coalesce(s.has_flow, false) as has_flow,
      coalesce(s.metadata->>'has_stage', 'false')::boolean as has_stage,
      coalesce(s.has_temp, false) as has_temp_iv,
      coalesce(sp.has_temp_dv, false) as has_temp_dv,
      st_dwithin(
        st_setsrid(st_makepoint(s.longitude, s.latitude), 4326)::geography,
        rs.geom::geography,
        200
      ) as on_river_alignment,
      st_distance(
        st_setsrid(st_makepoint(s.longitude, s.latitude), 4326)::geography,
        rs.geom::geography
      )::numeric as distance_to_river_m,
      (
        lower(coalesce(s.station_name, '')) like '%' || split_part(lower(rs.river_name), ' ', 1) || '%'
      ) as name_match
    from river_scope rs
    join public.usgs_station_registry s
      on s.latitude is not null
     and s.longitude is not null
     and s.latitude between -90 and 90
     and s.longitude between -180 and 180
     and coalesce(s.is_active, true) = true
     and (coalesce(s.has_temp, false) = true or exists (
       select 1 from public.usgs_site_parameters usp
       where usp.site_no = s.site_no and usp.has_temp_dv = true
     ))
    left join public.usgs_site_parameters sp
      on sp.site_no = s.site_no
  ),
  deduped as (
    -- keep one candidate row per river/site to avoid duplicate inserts
    select distinct on (c.river_id, c.site_no)
      c.river_id,
      c.site_no,
      c.station_name,
      c.has_flow,
      c.has_stage,
      c.has_temp_iv,
      c.has_temp_dv,
      c.on_river_alignment,
      c.distance_to_river_m,
      c.name_match
    from temp_candidates c
    order by c.river_id, c.site_no, c.on_river_alignment desc, c.distance_to_river_m asc nulls last
  ),
  ranked as (
    select
      c.*,
      (
        (case when c.on_river_alignment then 120 else 0 end) +
        (case when c.name_match then 12 else 0 end) +
        (case when c.has_temp_iv then 24 else 0 end) +
        (case when c.has_temp_dv then 10 else 0 end) +
        greatest(0, 40 - least(c.distance_to_river_m, 6000) / 150.0)
      )::numeric as rank_score,
      row_number() over (
        partition by c.river_id
        order by
          c.on_river_alignment desc,
          c.has_temp_iv desc,
          c.distance_to_river_m asc nulls last,
          c.name_match desc,
          c.site_no asc
      ) as candidate_rank
    from deduped c
  ),
  inserted as (
    insert into public.river_usgs_map_suggestions (
      river_id,
      role,
      site_no,
      candidate_rank,
      rank_score,
      distance_to_river_m,
      on_river_alignment,
      name_match,
      has_temp_iv,
      has_temp_dv,
      has_flow,
      has_stage,
      selection_reason,
      suggestion_status,
      suggested_at
    )
    select
      r.river_id,
      'temp',
      r.site_no,
      r.candidate_rank,
      r.rank_score,
      r.distance_to_river_m,
      r.on_river_alignment,
      r.name_match,
      r.has_temp_iv,
      r.has_temp_dv,
      r.has_flow,
      r.has_stage,
      case
        when r.has_temp_iv then '00010 available in IV'
        when r.has_temp_dv then '00010 available in DV only'
        else 'temp capability inferred'
      end,
      'pending',
      now()
    from ranked r
    where r.candidate_rank <= 5
    on conflict do nothing
    returning 1
  )
  select count(*) into v_inserted from inserted;

  if p_auto_apply then
    with best as (
      select distinct on (s.river_id)
        s.river_id,
        s.site_no
      from public.river_usgs_map_suggestions s
      where s.role = 'temp'
        and s.suggestion_status = 'pending'
        and (p_river_id is null or s.river_id = p_river_id)
      order by s.river_id, s.candidate_rank asc, s.rank_score desc
    )
    insert into public.river_usgs_map_roles (river_id, role, site_no, priority, is_active, notes)
    select b.river_id, 'temp', b.site_no, 1, true, 'auto-applied from refresh_river_usgs_temp_suggestions'
    from best b
    on conflict (river_id, role, site_no) do update
      set is_active = true,
          priority = least(public.river_usgs_map_roles.priority, 1),
          notes = excluded.notes,
          updated_at = now();

    update public.river_usgs_map_roles m
    set is_active = false, updated_at = now()
    where m.role = 'temp'
      and m.is_active = true
      and (p_river_id is null or m.river_id = p_river_id)
      and exists (
        select 1
        from public.river_usgs_map_roles chosen
        where chosen.river_id = m.river_id
          and chosen.role = 'temp'
          and chosen.priority = 1
          and chosen.is_active = true
          and chosen.site_no <> m.site_no
      );

    update public.river_usgs_map_suggestions s
    set suggestion_status = case
          when exists (
            select 1
            from public.river_usgs_map_roles m
            where m.river_id = s.river_id
              and m.role = 'temp'
              and m.site_no = s.site_no
              and m.is_active = true
              and m.priority = 1
          ) then 'applied'
          else s.suggestion_status
        end,
        applied_at = case
          when exists (
            select 1
            from public.river_usgs_map_roles m
            where m.river_id = s.river_id
              and m.role = 'temp'
              and m.site_no = s.site_no
              and m.is_active = true
              and m.priority = 1
          ) then now()
          else s.applied_at
        end
    where s.role = 'temp'
      and s.suggestion_status in ('pending', 'applied')
      and (p_river_id is null or s.river_id = p_river_id);
  end if;

  return v_inserted;
end;
$$;

commit;

