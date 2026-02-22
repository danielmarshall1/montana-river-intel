begin;

-- 1) Role-based river-to-site mapping (additive; keep legacy river_usgs_map intact).
create table if not exists public.river_usgs_map_roles (
  river_id uuid not null references public.rivers(id) on delete cascade,
  role text not null check (role in ('flow', 'temp', 'stage', 'aux')),
  site_no text not null,
  priority integer not null default 100,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (river_id, role, site_no)
);

create index if not exists idx_river_usgs_map_roles_lookup
  on public.river_usgs_map_roles (river_id, role, is_active, priority, updated_at desc);

create unique index if not exists ux_river_usgs_map_roles_primary
  on public.river_usgs_map_roles (river_id, role)
  where is_active = true and priority = 1;

create or replace function public._touch_river_usgs_map_roles_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_river_usgs_map_roles on public.river_usgs_map_roles;
create trigger trg_touch_river_usgs_map_roles
before update on public.river_usgs_map_roles
for each row execute procedure public._touch_river_usgs_map_roles_updated_at();

alter table public.river_usgs_map_roles enable row level security;
drop policy if exists "Allow public read river_usgs_map_roles" on public.river_usgs_map_roles;
create policy "Allow public read river_usgs_map_roles"
  on public.river_usgs_map_roles for select
  to anon, authenticated
  using (true);

-- Seed roles from legacy mapping if missing.
insert into public.river_usgs_map_roles (river_id, role, site_no, priority, is_active, notes)
select m.river_id, 'flow', m.flow_site_no, 1, true, 'seeded from river_usgs_map.flow_site_no'
from public.river_usgs_map m
where m.flow_site_no is not null
on conflict (river_id, role, site_no) do nothing;

insert into public.river_usgs_map_roles (river_id, role, site_no, priority, is_active, notes)
select m.river_id, 'temp', m.temp_site_no, 1, true, 'seeded from river_usgs_map.temp_site_no'
from public.river_usgs_map m
where m.temp_site_no is not null
on conflict (river_id, role, site_no) do nothing;

insert into public.river_usgs_map_roles (river_id, role, site_no, priority, is_active, notes)
select m.river_id, 'stage', m.stage_site_no, 1, true, 'seeded from river_usgs_map.stage_site_no'
from public.river_usgs_map m
where m.stage_site_no is not null
on conflict (river_id, role, site_no) do nothing;

-- 2) Temp mapping suggestions (auditable).
create table if not exists public.river_usgs_map_suggestions (
  id bigint generated always as identity primary key,
  river_id uuid not null references public.rivers(id) on delete cascade,
  role text not null check (role in ('flow', 'temp', 'stage', 'aux')),
  site_no text not null,
  candidate_rank integer not null,
  rank_score numeric not null,
  distance_to_river_m numeric,
  on_river_alignment boolean not null default false,
  name_match boolean not null default false,
  has_temp_iv boolean not null default false,
  has_temp_dv boolean not null default false,
  has_flow boolean not null default false,
  has_stage boolean not null default false,
  selection_reason text,
  suggestion_status text not null default 'pending' check (suggestion_status in ('pending', 'applied', 'rejected')),
  suggested_at timestamptz not null default now(),
  applied_at timestamptz
);

create unique index if not exists ux_river_usgs_map_suggestions_unique_candidate
  on public.river_usgs_map_suggestions (river_id, role, site_no, suggested_at);

create index if not exists idx_river_usgs_map_suggestions_lookup
  on public.river_usgs_map_suggestions (river_id, role, suggestion_status, suggested_at desc);

alter table public.river_usgs_map_suggestions enable row level security;
drop policy if exists "Allow public read river_usgs_map_suggestions" on public.river_usgs_map_suggestions;
create policy "Allow public read river_usgs_map_suggestions"
  on public.river_usgs_map_suggestions for select
  to anon, authenticated
  using (true);

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
    from temp_candidates c
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

grant execute on function public.refresh_river_usgs_temp_suggestions(uuid, boolean) to anon, authenticated, service_role;

-- 3) Additional river_daily provenance fields (non-destructive).
alter table if exists public.river_daily
  add column if not exists flow_source_site_no text,
  add column if not exists temp_source_site_no text,
  add column if not exists temp_source_kind text,
  add column if not exists temp_unavailable boolean not null default false,
  add column if not exists temp_reason text;

-- backfill from source_payload where available
update public.river_daily d
set
  flow_source_site_no = coalesce(d.flow_source_site_no, nullif(d.source_payload->>'flow_site_no', '')),
  temp_source_site_no = coalesce(d.temp_source_site_no, nullif(d.source_payload->>'temp_site_no', '')),
  temp_source_kind = coalesce(
    d.temp_source_kind,
    case
      when coalesce(d.source_payload->>'temp_source', '') ilike 'DV%' then 'DV'
      when coalesce(d.source_payload->>'temp_source', '') ilike 'IV%' then 'IV'
      else null
    end
  ),
  temp_unavailable = case
    when d.source_temp_observed_at is null and d.water_temp_f is null then true
    else d.temp_unavailable
  end
where d.source_payload is not null;

-- 4) Keep legacy map table aligned with active role mapping (for backward compatibility).
create or replace function public.sync_legacy_river_usgs_map_from_roles()
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.river_usgs_map (river_id, flow_site_no, temp_site_no, stage_site_no, updated_at)
  select
    r.id as river_id,
    coalesce(
      (select m.site_no from public.river_usgs_map_roles m where m.river_id = r.id and m.role = 'flow' and m.is_active = true order by m.priority asc, m.updated_at desc limit 1),
      r.usgs_site_no
    ) as flow_site_no,
    (select m.site_no from public.river_usgs_map_roles m where m.river_id = r.id and m.role = 'temp' and m.is_active = true order by m.priority asc, m.updated_at desc limit 1) as temp_site_no,
    coalesce(
      (select m.site_no from public.river_usgs_map_roles m where m.river_id = r.id and m.role = 'stage' and m.is_active = true order by m.priority asc, m.updated_at desc limit 1),
      r.usgs_site_no
    ) as stage_site_no,
    now()
  from public.rivers r
  where r.is_active = true
  on conflict (river_id) do update
    set flow_site_no = excluded.flow_site_no,
        temp_site_no = excluded.temp_site_no,
        stage_site_no = excluded.stage_site_no,
        updated_at = excluded.updated_at;
$$;

grant execute on function public.sync_legacy_river_usgs_map_from_roles() to anon, authenticated, service_role;

-- 5) Coverage + latest/detail + health views.
create or replace view public.v_river_temp_coverage as
with latest_daily as (
  select distinct on (d.river_id)
    d.river_id,
    d.obs_date,
    d.water_temp_f,
    d.source_temp_observed_at,
    d.temp_source_site_no,
    d.temp_source_kind,
    d.temp_unavailable,
    d.temp_reason
  from public.river_daily d
  order by d.river_id, d.obs_date desc
),
temp_map as (
  select
    m.river_id,
    m.site_no,
    m.priority,
    m.is_active
  from public.river_usgs_map_roles m
  where m.role = 'temp'
)
select
  r.id as river_id,
  coalesce(r.river_name, r.slug, r.id::text) as river_name,
  tm.site_no as mapped_temp_site_no,
  ld.temp_source_site_no as used_temp_site_no,
  ld.temp_source_kind,
  ld.source_temp_observed_at as last_temp_observed_at,
  ld.water_temp_f,
  case
    when ld.water_temp_f is not null then 'available'
    when ld.temp_unavailable then 'explicit_unavailable'
    else 'missing'
  end as temp_coverage_status,
  coalesce(ld.temp_reason, case when ld.water_temp_f is null then 'no_temp_observed' end) as temp_reason,
  ld.obs_date as latest_obs_date
from public.rivers r
left join temp_map tm on tm.river_id = r.id and tm.is_active = true and tm.priority = 1
left join latest_daily ld on ld.river_id = r.id
where r.is_active = true
order by river_name;

drop view if exists public.v_river_latest_ranked;
drop view if exists public.v_river_detail;
drop view if exists public.v_river_health;
drop view if exists public.v_river_latest;

create view public.v_river_latest as
with latest_daily as (
  select distinct on (d.river_id)
    d.river_id,
    d.obs_date,
    d.flow_cfs,
    d.water_temp_f,
    d.gage_height_ft,
    d.wind_am_mph,
    d.wind_pm_mph,
    d.median_flow_cfs,
    d.flow_ratio,
    d.change_48h_pct,
    d.flow_score,
    d.stability_score,
    d.thermal_score,
    d.wind_penalty,
    d.precip_penalty,
    d.fishability_score,
    d.bite_tier,
    d.source_flow_observed_at,
    d.source_temp_observed_at,
    d.flow_source_site_no,
    d.temp_source_site_no,
    d.temp_source_kind,
    d.temp_unavailable,
    d.temp_reason,
    d.source_parameter_codes,
    d.source_payload,
    d.updated_at
  from public.river_daily d
  order by d.river_id, d.obs_date desc
),
latest_weather as (
  select distinct on (w.river_id)
    w.river_id,
    w.date,
    w.precip_mm,
    w.precip_probability_pct,
    w.created_at as weather_observed_at
  from public.weather_daily w
  order by w.river_id, w.date desc, w.created_at desc
),
legacy_scores as (
  select distinct on (coalesce(r.id::text, s.river_id::text))
    r.id as river_id,
    s.date,
    coalesce((to_jsonb(s)->>'fishability_score_calc')::numeric, s.fishability_score) as legacy_fishability,
    s.bite_tier
  from public.river_daily_scores s
  left join public.rivers r
    on r.id::text = s.river_id::text
    or r.slug = s.river_id::text
  order by coalesce(r.id::text, s.river_id::text), s.date desc
),
base as (
  select
    r.id as river_id,
    r.slug,
    coalesce(r.river_name, r.slug) as river_name,
    r.gauge_label,
    r.usgs_site_no,
    r.latitude,
    r.longitude,
    ld.obs_date as date,
    ld.flow_cfs,
    ld.water_temp_f,
    ld.wind_am_mph,
    ld.wind_pm_mph,
    ld.median_flow_cfs,
    ld.flow_ratio as flow_ratio_calc,
    ld.change_48h_pct as change_48h_pct_calc,
    ld.flow_score,
    ld.stability_score,
    ld.thermal_score,
    ld.wind_penalty,
    coalesce(
      ld.fishability_score,
      ls.legacy_fishability,
      case
        when ld.flow_cfs is null then null
        else greatest(0, least(100, round((100 - abs(coalesce(ld.flow_ratio, 1.0) - 1.0) * 80)::numeric, 0)))
      end
    ) as fishability_score_calc,
    coalesce(ld.bite_tier, ls.bite_tier) as bite_tier,
    ld.source_flow_observed_at,
    ld.source_temp_observed_at,
    ld.flow_source_site_no,
    ld.temp_source_site_no,
    ld.temp_source_kind,
    ld.temp_unavailable,
    ld.temp_reason,
    ld.source_parameter_codes,
    ld.source_payload,
    ld.updated_at,
    lw.precip_mm,
    lw.precip_probability_pct,
    lw.weather_observed_at as last_weather_pull_at,
    coalesce(ld.source_flow_observed_at, ld.source_temp_observed_at, ld.updated_at) as last_usgs_pull_at,
    ld.obs_date as last_river_daily_date
  from public.rivers r
  left join latest_daily ld on ld.river_id = r.id
  left join latest_weather lw on lw.river_id = r.id
  left join legacy_scores ls on ls.river_id = r.id
  where r.is_active = true
),
ranked as (
  select
    b.*,
    case
      when b.fishability_score_calc is null then null
      else rank() over (order by b.fishability_score_calc desc nulls last)
    end as fishability_rank,
    case
      when b.fishability_score_calc is null then null
      else round(((1 - percent_rank() over (order by b.fishability_score_calc desc nulls last)) * 100)::numeric, 1)
    end as fishability_percentile
  from base b
)
select
  r.river_id,
  r.slug,
  r.river_name,
  r.gauge_label,
  r.usgs_site_no,
  r.latitude,
  r.longitude,
  r.date,
  r.flow_cfs,
  r.water_temp_f,
  r.wind_am_mph,
  r.wind_pm_mph,
  r.median_flow_cfs,
  r.flow_ratio_calc,
  r.change_48h_pct_calc,
  r.flow_score,
  r.stability_score,
  r.thermal_score,
  r.wind_penalty,
  r.fishability_score_calc,
  r.bite_tier,
  r.source_flow_observed_at,
  r.source_temp_observed_at,
  coalesce(r.flow_source_site_no, nullif(r.source_payload->>'flow_site_no', ''), r.usgs_site_no) as flow_source_site_no,
  coalesce(r.temp_source_site_no, nullif(r.source_payload->>'temp_site_no', ''), r.usgs_site_no) as temp_source_site_no,
  coalesce(
    r.temp_source_kind,
    case
      when coalesce(r.source_payload->>'temp_source', '') ilike 'DV%' then 'DV'
      when coalesce(r.source_payload->>'temp_source', '') ilike 'IV%' then 'IV'
      when r.source_temp_observed_at is null then 'NONE'
      else 'IV'
    end
  ) as temp_source_kind,
  r.temp_unavailable,
  r.temp_reason,
  r.source_parameter_codes,
  r.updated_at,
  r.precip_mm,
  r.precip_probability_pct,
  r.last_weather_pull_at,
  r.last_usgs_pull_at,
  r.last_river_daily_date,
  r.fishability_rank,
  r.fishability_percentile,
  (r.date is null or r.date < (now() at time zone 'America/Denver')::date) as is_stale,
  case
    when r.date is null then 'no_daily_row'
    when r.date < (now() at time zone 'America/Denver')::date then 'missing_today_row'
    when r.source_flow_observed_at is null and r.source_temp_observed_at is null then 'missing_usgs_timestamps'
    else null
  end as stale_reason,
  case
    when r.source_temp_observed_at is null then null
    else greatest(0, floor(extract(epoch from (now() - r.source_temp_observed_at)) / 60))::int
  end as temp_age_minutes,
  case
    when r.source_temp_observed_at is null then false
    when extract(epoch from (now() - r.source_temp_observed_at)) > (6 * 3600) then true
    else false
  end as temp_stale,
  case
    when r.source_temp_observed_at is null then 'unavailable_at_gauge'
    when extract(epoch from (now() - r.source_temp_observed_at)) > (6 * 3600) then 'available_stale'
    else 'available_fresh'
  end as temp_status
from ranked r;

create view public.v_river_detail as
select
  v.*,
  case
    when v.fishability_score_calc is null then null
    when v.fishability_score_calc >= 85 then 'Excellent'
    when v.fishability_score_calc >= 70 then 'Good'
    when v.fishability_score_calc >= 55 then 'Fair'
    else 'Tough'
  end as bite_tier_label
from public.v_river_latest v;

create view public.v_river_health as
with latest_daily as (
  select distinct on (d.river_id)
    d.river_id,
    d.obs_date as last_river_daily_date,
    d.flow_cfs,
    d.water_temp_f,
    d.median_flow_cfs,
    d.change_48h_pct,
    d.source_flow_observed_at,
    d.source_temp_observed_at
  from public.river_daily d
  order by d.river_id, d.obs_date desc
),
latest_usgs as (
  select
    d.river_id,
    max(d.source_flow_observed_at) as last_flow_pull_at,
    max(d.source_temp_observed_at) as last_temp_pull_at,
    max(coalesce(d.source_flow_observed_at, d.source_temp_observed_at, d.updated_at)) as last_usgs_pull_at
  from public.river_daily d
  group by d.river_id
),
latest_weather as (
  select
    w.river_id,
    max(w.created_at) as last_weather_pull_at
  from public.weather_daily w
  group by w.river_id
),
mapped as (
  select
    m.river_id,
    bool_or(m.role = 'flow' and m.is_active) as has_flow_role,
    bool_or(m.role = 'temp' and m.is_active) as has_temp_role
  from public.river_usgs_map_roles m
  group by m.river_id
)
select
  r.id as river_id,
  coalesce(r.river_name, r.slug) as river_name,
  lu.last_flow_pull_at,
  lu.last_temp_pull_at,
  lu.last_usgs_pull_at,
  lw.last_weather_pull_at,
  ld.last_river_daily_date,
  (ld.last_river_daily_date is null or ld.last_river_daily_date < (now() at time zone 'America/Denver')::date) as is_stale,
  (lu.last_flow_pull_at is null or extract(epoch from (now() - lu.last_flow_pull_at)) > (8 * 3600)) as stale_flow,
  (lu.last_temp_pull_at is null or extract(epoch from (now() - lu.last_temp_pull_at)) > (8 * 3600)) as stale_temp,
  (lw.last_weather_pull_at is null or extract(epoch from (now() - lw.last_weather_pull_at)) > (18 * 3600)) as stale_weather,
  (coalesce(mp.has_flow_role, false) = false or coalesce(mp.has_temp_role, false) = false) as mapping_gaps,
  case
    when ld.last_river_daily_date is null then 'no_daily_row'
    when ld.last_river_daily_date < (now() at time zone 'America/Denver')::date then 'missing_today_row'
    when coalesce(mp.has_flow_role, false) = false then 'missing_flow_mapping'
    when coalesce(mp.has_temp_role, false) = false then 'missing_temp_mapping'
    when lu.last_flow_pull_at is null then 'missing_flow_observation'
    when lw.last_weather_pull_at is null then 'missing_weather_pull'
    else null
  end as stale_reason,
  (ld.water_temp_f is null) as missing_temperature,
  (ld.median_flow_cfs is null) as missing_median_baseline,
  (abs(coalesce(ld.change_48h_pct, 0)) >= 80) as possible_spike
from public.rivers r
left join latest_daily ld on ld.river_id = r.id
left join latest_usgs lu on lu.river_id = r.id
left join latest_weather lw on lw.river_id = r.id
left join mapped mp on mp.river_id = r.id
where r.is_active = true;

create view public.v_river_latest_ranked as
select * from public.v_river_latest;

grant select on public.river_usgs_map_roles to anon, authenticated, service_role;
grant select on public.river_usgs_map_suggestions to anon, authenticated, service_role;
grant select on public.v_river_temp_coverage to anon, authenticated, service_role;
grant select on public.v_river_latest to anon, authenticated;
grant select on public.v_river_detail to anon, authenticated;
grant select on public.v_river_health to anon, authenticated;
grant select on public.v_river_latest_ranked to anon, authenticated;

commit;
