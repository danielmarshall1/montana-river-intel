-- Standardize bite_tier in v_river_latest to always use plain uppercase HOT/GOOD/FAIR/TOUGH.
--
-- Root cause: the view's bite_tier was coalesce(ld.bite_tier, ls.bite_tier), which is null
-- when compute_river_daily_scores hasn't run, and may contain emoji/label strings ("🔥 Great",
-- "Good", "Fair", "Tough") from legacy rows or direct DB edits. This caused normalizeBiteTier
-- on the frontend to return null for HOT-tier rivers.
--
-- Fix: compute bite_tier inline from fishability_score, preferring any stored canonical
-- uppercase value (HOT/GOOD/FAIR/TOUGH) but falling back to an inline CASE when null or
-- non-canonical. Also standardize bite_tier_label in v_river_detail to plain uppercase.

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
    -- Normalize bite_tier to plain uppercase HOT/GOOD/FAIR/TOUGH.
    -- If a canonical uppercase value is stored, use it directly.
    -- Otherwise compute from fishability_score so bite_tier is never null when a score exists.
    case
      when upper(trim(coalesce(ld.bite_tier, ls.bite_tier))) in ('HOT', 'GOOD', 'FAIR', 'TOUGH')
        then upper(trim(coalesce(ld.bite_tier, ls.bite_tier)))
      when coalesce(ld.fishability_score, ls.legacy_fishability) >= 85 then 'HOT'
      when coalesce(ld.fishability_score, ls.legacy_fishability) >= 70 then 'GOOD'
      when coalesce(ld.fishability_score, ls.legacy_fishability) >= 55 then 'FAIR'
      when coalesce(ld.fishability_score, ls.legacy_fishability) is not null then 'TOUGH'
      else null
    end as bite_tier,
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

-- v_river_detail: bite_tier_label now matches bite_tier (plain uppercase HOT/GOOD/FAIR/TOUGH)
create view public.v_river_detail as
select
  v.*,
  case
    when v.fishability_score_calc is null then null
    when v.fishability_score_calc >= 85 then 'HOT'
    when v.fishability_score_calc >= 70 then 'GOOD'
    when v.fishability_score_calc >= 55 then 'FAIR'
    else 'TOUGH'
  end as bite_tier_label
from public.v_river_latest v;

-- v_river_health: unchanged from 20260221190000, recreated to satisfy drop above
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
