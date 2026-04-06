-- USGS metadata-first station catalog + river candidate matching + promotion RPC.
-- Additive migration: does not remove legacy tables.

create table if not exists public.usgs_sites (
  site_no text primary key,
  station_name text,
  state text,
  lat double precision,
  lon double precision,
  active boolean not null default true,
  has_iv boolean not null default false,
  has_dv boolean not null default false,
  parameter_codes text[] not null default '{}',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  source jsonb not null default '{}'::jsonb
);

create index if not exists idx_usgs_sites_state_active on public.usgs_sites (state, active);
create index if not exists idx_usgs_sites_lat_lon on public.usgs_sites (lat, lon);
create index if not exists idx_usgs_sites_has_iv_dv on public.usgs_sites (has_iv, has_dv);

alter table public.usgs_sites enable row level security;

drop policy if exists "Allow public read usgs_sites" on public.usgs_sites;
create policy "Allow public read usgs_sites"
  on public.usgs_sites for select
  to anon, authenticated
  using (true);

create table if not exists public.usgs_site_catalog_runs (
  run_id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  stations_total integer not null default 0,
  ok integer not null default 0,
  failed integer not null default 0,
  status text not null default 'running',
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_usgs_site_catalog_runs_started_at
  on public.usgs_site_catalog_runs (started_at desc);

alter table public.usgs_site_catalog_runs enable row level security;

drop policy if exists "Allow public read usgs_site_catalog_runs" on public.usgs_site_catalog_runs;
create policy "Allow public read usgs_site_catalog_runs"
  on public.usgs_site_catalog_runs for select
  to anon, authenticated
  using (true);

create table if not exists public.usgs_site_river_candidates (
  site_no text not null references public.usgs_sites(site_no) on delete cascade,
  river_id uuid not null references public.rivers(id) on delete cascade,
  distance_m numeric not null,
  method text not null default 'nearest_geom',
  confidence numeric not null,
  created_at timestamptz not null default now(),
  primary key (site_no, river_id)
);

create index if not exists idx_usgs_site_river_candidates_river
  on public.usgs_site_river_candidates (river_id, confidence desc, distance_m asc);
create index if not exists idx_usgs_site_river_candidates_site
  on public.usgs_site_river_candidates (site_no, confidence desc, distance_m asc);

alter table public.usgs_site_river_candidates enable row level security;

drop policy if exists "Allow public read usgs_site_river_candidates" on public.usgs_site_river_candidates;
create policy "Allow public read usgs_site_river_candidates"
  on public.usgs_site_river_candidates for select
  to anon, authenticated
  using (true);

create or replace function public.refresh_usgs_site_river_candidates(
  p_threshold_m numeric default 2000,
  p_top_n integer default 3,
  p_only_active_sites boolean default true
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer := 0;
begin
  set local statement_timeout = '300s';
  if p_top_n < 1 then
    raise exception 'p_top_n must be >= 1';
  end if;

  truncate table public.usgs_site_river_candidates;

  with river_geom as (
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
  site_points as (
    select
      s.site_no,
      s.station_name,
      s.state,
      s.lat,
      s.lon,
      s.active,
      s.parameter_codes,
      st_setsrid(st_makepoint(s.lon, s.lat), 4326) as geom
    from public.usgs_sites s
    where s.lat is not null
      and s.lon is not null
      and (not p_only_active_sites or s.active = true)
  ),
  candidates as (
    select
      sp.site_no,
      rg.river_id,
      st_distance(sp.geom::geography, rg.geom::geography)::numeric as distance_m,
      rg.river_name,
      sp.station_name,
      row_number() over (
        partition by sp.site_no
        order by st_distance(sp.geom::geography, rg.geom::geography) asc, rg.river_id
      ) as rn
    from site_points sp
    join river_geom rg
      on st_dwithin(sp.geom::geography, rg.geom::geography, p_threshold_m)
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
  )
  insert into public.usgs_site_river_candidates (site_no, river_id, distance_m, method, confidence)
  select site_no, river_id, distance_m, method, confidence
  from scored;

  get diagnostics v_rows = row_count;

  return v_rows;
end;
$$;

grant execute on function public.refresh_usgs_site_river_candidates(numeric, integer, boolean)
  to anon, authenticated, service_role;

create or replace view public.v_usgs_sites_with_river_guess as
with ranked as (
  select
    c.site_no,
    c.river_id,
    c.distance_m,
    c.method,
    c.confidence,
    row_number() over (partition by c.site_no order by c.confidence desc, c.distance_m asc, c.river_id) as rn
  from public.usgs_site_river_candidates c
)
select
  s.site_no,
  s.station_name,
  s.state,
  s.lat,
  s.lon,
  s.active,
  s.has_iv,
  s.has_dv,
  s.parameter_codes,
  s.last_seen_at,
  r.river_id,
  rv.slug as river_slug,
  coalesce(rv.river_name, rv.slug, rv.id::text) as river_name,
  r.distance_m,
  r.confidence,
  r.method
from public.usgs_sites s
left join ranked r
  on r.site_no = s.site_no
 and r.rn = 1
left join public.rivers rv
  on rv.id = r.river_id;

create table if not exists public.usgs_site_role_promotions (
  id bigint generated by default as identity primary key,
  promoted_at timestamptz not null default now(),
  promoted_by text not null default 'system',
  river_id uuid not null references public.rivers(id) on delete cascade,
  role text not null,
  site_no text not null,
  priority integer not null,
  reason text,
  previous_primary_site_no text,
  confidence numeric,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_usgs_site_role_promotions_lookup
  on public.usgs_site_role_promotions (river_id, role, promoted_at desc);

alter table public.usgs_site_role_promotions enable row level security;

drop policy if exists "Allow public read usgs_site_role_promotions" on public.usgs_site_role_promotions;
create policy "Allow public read usgs_site_role_promotions"
  on public.usgs_site_role_promotions for select
  to anon, authenticated
  using (true);

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

grant execute on function public.promote_usgs_site_to_river(text, uuid, text, integer, text, text)
  to anon, authenticated, service_role;

create or replace function public.auto_promote_usgs_site_roles(
  p_role text default null,
  p_min_confidence numeric default 0.55,
  p_overwrite_manual boolean default false,
  p_promoted_by text default 'auto'
)
returns table (
  promoted_count integer,
  skipped_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_promoted integer := 0;
  v_skipped integer := 0;
  rec record;
  v_existing_primary_site_no text;
  v_existing_primary_notes text;
  v_has_needed_param boolean;
begin
  for rec in
    with eligible as (
      select
        c.river_id,
        c.site_no,
        c.confidence,
        c.distance_m,
        row_number() over (partition by c.river_id order by c.confidence desc, c.distance_m asc, c.site_no) as rn,
        s.parameter_codes
      from public.usgs_site_river_candidates c
      join public.usgs_sites s on s.site_no = c.site_no
      where c.confidence >= p_min_confidence
        and (p_role is null or p_role in ('flow', 'temp'))
    )
    select * from eligible where rn = 1
  loop
    if p_role is null then
      -- handle flow
      v_has_needed_param := coalesce(rec.parameter_codes, '{}') && array['00060'];
      if v_has_needed_param then
        select m.site_no, m.notes
          into v_existing_primary_site_no, v_existing_primary_notes
        from public.river_usgs_map_roles m
        where m.river_id = rec.river_id and m.role = 'flow' and m.is_active = true and m.priority = 1
        limit 1;

        if v_existing_primary_site_no is null
           or p_overwrite_manual
           or coalesce(v_existing_primary_notes, '') ilike 'auto%'
        then
          perform public.promote_usgs_site_to_river(rec.site_no, rec.river_id, 'flow', 1, 'auto promotion from candidate confidence', p_promoted_by);
          v_promoted := v_promoted + 1;
        else
          v_skipped := v_skipped + 1;
        end if;
      end if;

      -- handle temp
      v_has_needed_param := coalesce(rec.parameter_codes, '{}') && array['00010'];
      if v_has_needed_param then
        select m.site_no, m.notes
          into v_existing_primary_site_no, v_existing_primary_notes
        from public.river_usgs_map_roles m
        where m.river_id = rec.river_id and m.role = 'temp' and m.is_active = true and m.priority = 1
        limit 1;

        if v_existing_primary_site_no is null
           or p_overwrite_manual
           or coalesce(v_existing_primary_notes, '') ilike 'auto%'
        then
          perform public.promote_usgs_site_to_river(rec.site_no, rec.river_id, 'temp', 1, 'auto promotion from candidate confidence', p_promoted_by);
          v_promoted := v_promoted + 1;
        else
          v_skipped := v_skipped + 1;
        end if;
      end if;
    elsif p_role = 'flow' then
      v_has_needed_param := coalesce(rec.parameter_codes, '{}') && array['00060'];
      if not v_has_needed_param then
        v_skipped := v_skipped + 1;
      else
        select m.site_no, m.notes
          into v_existing_primary_site_no, v_existing_primary_notes
        from public.river_usgs_map_roles m
        where m.river_id = rec.river_id and m.role = 'flow' and m.is_active = true and m.priority = 1
        limit 1;

        if v_existing_primary_site_no is null
           or p_overwrite_manual
           or coalesce(v_existing_primary_notes, '') ilike 'auto%'
        then
          perform public.promote_usgs_site_to_river(rec.site_no, rec.river_id, 'flow', 1, 'auto promotion from candidate confidence', p_promoted_by);
          v_promoted := v_promoted + 1;
        else
          v_skipped := v_skipped + 1;
        end if;
      end if;
    elsif p_role = 'temp' then
      v_has_needed_param := coalesce(rec.parameter_codes, '{}') && array['00010'];
      if not v_has_needed_param then
        v_skipped := v_skipped + 1;
      else
        select m.site_no, m.notes
          into v_existing_primary_site_no, v_existing_primary_notes
        from public.river_usgs_map_roles m
        where m.river_id = rec.river_id and m.role = 'temp' and m.is_active = true and m.priority = 1
        limit 1;

        if v_existing_primary_site_no is null
           or p_overwrite_manual
           or coalesce(v_existing_primary_notes, '') ilike 'auto%'
        then
          perform public.promote_usgs_site_to_river(rec.site_no, rec.river_id, 'temp', 1, 'auto promotion from candidate confidence', p_promoted_by);
          v_promoted := v_promoted + 1;
        else
          v_skipped := v_skipped + 1;
        end if;
      end if;
    end if;
  end loop;

  return query select v_promoted, v_skipped;
end;
$$;

grant execute on function public.auto_promote_usgs_site_roles(text, numeric, boolean, text)
  to anon, authenticated, service_role;

grant select on public.usgs_sites to anon, authenticated, service_role;
grant select on public.usgs_site_catalog_runs to anon, authenticated, service_role;
grant select on public.usgs_site_river_candidates to anon, authenticated, service_role;
grant select on public.v_usgs_sites_with_river_guess to anon, authenticated, service_role;
grant select on public.usgs_site_role_promotions to anon, authenticated, service_role;
