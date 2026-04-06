create or replace function public.promote_usgs_site_to_river(
  p_site_no text,
  p_river_id uuid,
  p_role text,
  p_priority integer default 1,
  p_reason text default null,
  p_promoted_by text default 'manual'
)
returns table (
  river_id uuid,
  role text,
  site_no text,
  priority integer,
  is_active boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev_primary text;
  v_confidence numeric;
begin
  if p_role not in ('flow','temp','stage','aux') then
    raise exception 'Invalid role: %', p_role;
  end if;

  if p_priority < 1 then
    raise exception 'Priority must be >= 1';
  end if;

  select m.site_no
    into v_prev_primary
  from public.river_usgs_map_roles m
  where m.river_id = p_river_id
    and m.role = p_role
    and m.is_active = true
    and m.priority = 1
  limit 1;

  if p_priority = 1 then
    update public.river_usgs_map_roles m
       set is_active = false
     where m.river_id = p_river_id
       and m.role = p_role
       and m.is_active = true
       and m.priority = 1
       and m.site_no <> p_site_no;
  end if;

  insert into public.river_usgs_map_roles (river_id, role, site_no, priority, is_active, notes)
  values (p_river_id, p_role, p_site_no, p_priority, true, coalesce(p_reason, 'manual promotion'))
  on conflict (river_id, role, site_no)
  do update
     set priority = excluded.priority,
         is_active = true,
         notes = excluded.notes,
         updated_at = now();

  if p_priority = 1 then
    update public.river_usgs_map_roles m
       set is_active = false
     where m.river_id = p_river_id
       and m.role = p_role
       and m.site_no <> p_site_no
       and m.priority = 1
       and m.is_active = true;
  end if;

  select c.confidence
    into v_confidence
  from public.usgs_site_river_candidates c
  where c.site_no = p_site_no
    and c.river_id = p_river_id
  order by c.confidence desc, c.distance_m asc
  limit 1;

  insert into public.usgs_site_role_promotions (
    promoted_by,
    river_id,
    role,
    site_no,
    priority,
    reason,
    previous_primary_site_no,
    confidence,
    metadata
  )
  values (
    coalesce(p_promoted_by, 'manual'),
    p_river_id,
    p_role,
    p_site_no,
    p_priority,
    p_reason,
    v_prev_primary,
    v_confidence,
    jsonb_build_object('source', 'promote_usgs_site_to_river')
  );

  perform public.sync_legacy_river_usgs_map_from_roles();

  return query
  select m.river_id, m.role, m.site_no, m.priority, m.is_active
  from public.river_usgs_map_roles m
  where m.river_id = p_river_id
    and m.role = p_role
    and m.site_no = p_site_no
  limit 1;
end;
$$;
