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
drop view if exists public.v_river_detail_analytics;
drop view if exists public.v_river_detail cascade;
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

-- Recreate v_river_detail_analytics (depends on v_river_detail, dropped above via cascade)
create view public.v_river_detail_analytics as
with base as (
  select
    v.river_id,
    v.slug,
    v.river_name,
    v.gauge_label,
    v.date,
    v.usgs_site_no,
    v.flow_cfs,
    v.water_temp_f,
    null::numeric as gage_height_ft,
    v.fishability_score_calc,
    v.source_flow_observed_at,
    v.source_temp_observed_at,
    v.flow_source_site_no,
    v.temp_source_site_no,
    v.temp_source_kind,
    v.last_usgs_pull_at
  from public.v_river_detail v
),
history as (
  select
    b.river_id,
    b.date,
    seasonal.sample_size as seasonal_sample_size,
    seasonal.flow_p10,
    seasonal.flow_p25,
    seasonal.flow_p50,
    seasonal.flow_p75,
    seasonal.flow_p90,
    seasonal.percentile_rank as seasonal_percentile,
    trailing_stats.trailing_sample_size,
    trailing_stats.trailing_median_flow_cfs
  from base b
  left join lateral (
    with seasonal_hist as (
      select d.flow_cfs
      from public.river_daily d
      where d.river_id = b.river_id
        and d.obs_date < b.date
        and d.flow_cfs is not null
        and public.day_of_year_window_distance(extract(doy from d.obs_date)::int, extract(doy from b.date)::int) <= 7
    )
    select
      count(*)::int as sample_size,
      (percentile_cont(0.10) within group (order by flow_cfs))::numeric as flow_p10,
      (percentile_cont(0.25) within group (order by flow_cfs))::numeric as flow_p25,
      (percentile_cont(0.50) within group (order by flow_cfs))::numeric as flow_p50,
      (percentile_cont(0.75) within group (order by flow_cfs))::numeric as flow_p75,
      (percentile_cont(0.90) within group (order by flow_cfs))::numeric as flow_p90,
      case
        when count(*) < 30 or b.flow_cfs is null then null
        else round((100.0 * avg(case when flow_cfs <= b.flow_cfs then 1.0 else 0.0 end))::numeric, 1)
      end as percentile_rank
    from seasonal_hist
  ) seasonal on true
  left join lateral (
    with trailing_hist as (
      select d.flow_cfs
      from public.river_daily d
      where d.river_id = b.river_id
        and d.obs_date < b.date
        and d.obs_date >= b.date - 30
        and d.flow_cfs is not null
    )
    select
      count(*)::int as trailing_sample_size,
      (percentile_cont(0.50) within group (order by flow_cfs))::numeric as trailing_median_flow_cfs
    from trailing_hist
  ) trailing_stats on true
),
recent as (
  select
    b.river_id,
    lag24.flow_cfs as flow_24h_ago,
    lag48.flow_cfs as flow_48h_ago,
    lag24.water_temp_f as temp_24h_ago,
    case
      when b.flow_cfs is null or lag24.flow_cfs is null or lag24.flow_cfs = 0 then null
      else round((((b.flow_cfs - lag24.flow_cfs) / lag24.flow_cfs) * 100.0)::numeric, 1)
    end as change_24h_pct,
    case
      when b.flow_cfs is null or lag48.flow_cfs is null or lag48.flow_cfs = 0 then null
      else round((((b.flow_cfs - lag48.flow_cfs) / lag48.flow_cfs) * 100.0)::numeric, 1)
    end as change_48h_pct,
    case
      when b.water_temp_f is null or lag24.water_temp_f is null then null
      else round((b.water_temp_f - lag24.water_temp_f)::numeric, 1)
    end as temp_change_24h_f,
    stability.stability_index_raw,
    case
      when stability.stability_index_raw is null then null
      when stability.stability_index_raw < 0.05 then 'High Stability'
      when stability.stability_index_raw <= 0.12 then 'Moderate Stability'
      else 'Low Stability'
    end as stability_label,
    case
      when (
        case
          when b.flow_cfs is null or lag24.flow_cfs is null or lag24.flow_cfs = 0 then null
          else round((((b.flow_cfs - lag24.flow_cfs) / lag24.flow_cfs) * 100.0)::numeric, 1)
        end
      ) is null
       and (
        case
          when b.flow_cfs is null or lag48.flow_cfs is null or lag48.flow_cfs = 0 then null
          else round((((b.flow_cfs - lag48.flow_cfs) / lag48.flow_cfs) * 100.0)::numeric, 1)
        end
      ) is null then null
      when coalesce(
        case
          when b.flow_cfs is null or lag24.flow_cfs is null or lag24.flow_cfs = 0 then null
          else round((((b.flow_cfs - lag24.flow_cfs) / lag24.flow_cfs) * 100.0)::numeric, 1)
        end, 0
      ) > 4
       and coalesce(
        case
          when b.flow_cfs is null or lag48.flow_cfs is null or lag48.flow_cfs = 0 then null
          else round((((b.flow_cfs - lag48.flow_cfs) / lag48.flow_cfs) * 100.0)::numeric, 1)
        end, 0
      ) > 4 then 'Rising'
      when coalesce(
        case
          when b.flow_cfs is null or lag24.flow_cfs is null or lag24.flow_cfs = 0 then null
          else round((((b.flow_cfs - lag24.flow_cfs) / lag24.flow_cfs) * 100.0)::numeric, 1)
        end, 0
      ) < -4
       and coalesce(
        case
          when b.flow_cfs is null or lag48.flow_cfs is null or lag48.flow_cfs = 0 then null
          else round((((b.flow_cfs - lag48.flow_cfs) / lag48.flow_cfs) * 100.0)::numeric, 1)
        end, 0
      ) < -4 then 'Dropping'
      else 'Stable'
    end as flow_trend_label,
    case
      when b.water_temp_f is null or lag24.water_temp_f is null then null
      when (b.water_temp_f - lag24.water_temp_f) > 1 then 'Warming'
      when (b.water_temp_f - lag24.water_temp_f) < -1 then 'Cooling'
      else 'Stable'
    end as thermal_trend_label
  from base b
  left join lateral (
    select d.flow_cfs, d.water_temp_f
    from public.river_daily d
    where d.river_id = b.river_id
      and d.obs_date < b.date
    order by abs(d.obs_date - (b.date - 1)), d.obs_date desc
    limit 1
  ) lag24 on true
  left join lateral (
    select d.flow_cfs
    from public.river_daily d
    where d.river_id = b.river_id
      and d.obs_date < b.date
    order by abs(d.obs_date - (b.date - 2)), d.obs_date desc
    limit 1
  ) lag48 on true
  left join lateral (
    select
      case
        when count(*) < 2 or avg(recent_flow.flow_cfs) is null or avg(recent_flow.flow_cfs) = 0 then null
        else round((stddev_samp(recent_flow.flow_cfs) / avg(recent_flow.flow_cfs))::numeric, 4)
      end as stability_index_raw
    from (
      select d.flow_cfs
      from public.river_daily d
      where d.river_id = b.river_id
        and d.flow_cfs is not null
      order by d.obs_date desc
      limit 3
    ) recent_flow
  ) stability on true
),
current_weather as (
  select distinct on (w.river_id)
    w.river_id,
    w.air_temp_f,
    coalesce(w.wind_speed_max_mph, w.wind_pm_mph, w.wind_am_mph) as wind_speed_mph,
    w.wind_direction_deg,
    w.gust_mph,
    w.precip_probability_pct as precip_chance_pct,
    w.cloud_cover_pct,
    w.air_temp_high_f as daily_high_f,
    w.air_temp_low_f as daily_low_f,
    coalesce(w.observed_at, w.created_at) as weather_observed_at
  from public.weather_daily w
  where w.date <= (now() at time zone 'America/Denver')::date
  order by w.river_id, w.date desc, coalesce(w.observed_at, w.created_at) desc
),
forecast_weather as (
  select
    w.river_id,
    row_number() over (partition by w.river_id order by w.date asc) as forecast_day,
    w.air_temp_high_f as air_temp_f,
    coalesce(w.wind_speed_max_mph, w.wind_pm_mph, w.wind_am_mph) as wind_mph,
    w.precip_probability_pct as precip_chance_pct
  from public.weather_daily w
  where w.date > (now() at time zone 'America/Denver')::date
),
forecast_rollup as (
  select
    fw.river_id,
    avg(fw.wind_mph) as avg_wind_mph,
    avg(fw.precip_chance_pct) as avg_precip_chance_pct,
    max(case when fw.forecast_day = 1 then fw.wind_mph end) as day1_wind_mph,
    max(case when fw.forecast_day = 3 then fw.wind_mph end) as day3_wind_mph,
    max(case when fw.forecast_day = 1 then fw.air_temp_f end) as day1_air_temp_f,
    max(case when fw.forecast_day = 3 then fw.air_temp_f end) as day3_air_temp_f
  from forecast_weather fw
  where fw.forecast_day <= 3
  group by fw.river_id
),
flow_source_names as (
  select
    v.river_id,
    coalesce(us.station_name, reg.station_name) as station_name
  from public.v_river_detail v
  left join public.usgs_sites us on us.site_no = v.flow_source_site_no
  left join public.usgs_station_registry reg on reg.site_no = v.flow_source_site_no
),
temp_source_names as (
  select
    v.river_id,
    coalesce(us.station_name, reg.station_name) as station_name
  from public.v_river_detail v
  left join public.usgs_sites us on us.site_no = v.temp_source_site_no
  left join public.usgs_station_registry reg on reg.site_no = v.temp_source_site_no
)
select
  b.river_id,
  b.slug,
  b.river_name,
  b.gauge_label,
  b.date,
  b.flow_cfs as current_flow_cfs,
  b.water_temp_f as current_temp_f,
  b.gage_height_ft as current_stage_ft,
  coalesce(
    case when history.seasonal_sample_size >= 5 then history.flow_p50 end,
    history.trailing_median_flow_cfs
  ) as median_flow_cfs,
  case
    when b.flow_cfs is null or coalesce(case when history.seasonal_sample_size >= 5 then history.flow_p50 end, history.trailing_median_flow_cfs) is null or coalesce(case when history.seasonal_sample_size >= 5 then history.flow_p50 end, history.trailing_median_flow_cfs) = 0 then null
    else round((b.flow_cfs / coalesce(case when history.seasonal_sample_size >= 5 then history.flow_p50 end, history.trailing_median_flow_cfs))::numeric, 2)
  end as flow_ratio,
  recent.flow_48h_ago,
  recent.temp_24h_ago,
  recent.change_48h_pct,
  recent.temp_change_24h_f,
  recent.stability_index_raw,
  recent.stability_label,
  recent.flow_trend_label,
  history.seasonal_percentile as flow_percentile,
  case
    when history.seasonal_sample_size is null or history.seasonal_sample_size < 30 then 'Insufficient history'
    else null
  end as flow_percentile_status,
  history.flow_p10,
  history.flow_p25,
  history.flow_p50,
  history.flow_p75,
  history.flow_p90,
  history.seasonal_sample_size as historical_sample_size,
  coalesce(
    b.temp_source_kind,
    case
      when b.source_temp_observed_at is null then 'NONE'
      else 'IV'
    end
  ) as temp_source_kind,
  b.source_temp_observed_at as temp_observed_at,
  case
    when b.source_temp_observed_at is null then 'Low'
    when coalesce(b.temp_source_kind, 'IV') <> 'IV' then 'Low'
    when now() - b.source_temp_observed_at < interval '3 hours' then 'High'
    when now() - b.source_temp_observed_at <= interval '8 hours' then 'Moderate'
    else 'Low'
  end as confidence_level,
  b.flow_source_site_no,
  fsn.station_name as flow_source_site_name,
  b.temp_source_site_no,
  tsn.station_name as temp_source_site_name,
  coalesce(b.source_temp_observed_at, b.source_flow_observed_at) as observation_timestamp,
  b.last_usgs_pull_at as last_hydrology_pull_at,
  cw.air_temp_f,
  cw.wind_speed_mph,
  cw.wind_direction_deg,
  case
    when cw.wind_direction_deg is null then null
    when cw.wind_direction_deg < 22.5 or cw.wind_direction_deg >= 337.5 then 'N'
    when cw.wind_direction_deg < 67.5 then 'NE'
    when cw.wind_direction_deg < 112.5 then 'E'
    when cw.wind_direction_deg < 157.5 then 'SE'
    when cw.wind_direction_deg < 202.5 then 'S'
    when cw.wind_direction_deg < 247.5 then 'SW'
    when cw.wind_direction_deg < 292.5 then 'W'
    else 'NW'
  end as wind_direction,
  cw.gust_mph,
  cw.precip_chance_pct,
  cw.cloud_cover_pct,
  cw.daily_high_f,
  cw.daily_low_f,
  cw.weather_observed_at,
  recent.thermal_trend_label,
  case
    when forecast.day1_air_temp_f is null and recent.temp_change_24h_f is null then null
    when coalesce(forecast.day3_air_temp_f, forecast.day1_air_temp_f, cw.daily_high_f) - coalesce(forecast.day1_air_temp_f, cw.daily_high_f, 0) + coalesce(recent.temp_change_24h_f, 0) > 2 then 'Warming'
    when coalesce(forecast.day3_air_temp_f, forecast.day1_air_temp_f, cw.daily_high_f) - coalesce(forecast.day1_air_temp_f, cw.daily_high_f, 0) + coalesce(recent.temp_change_24h_f, 0) < -2 then 'Cooling'
    else 'Stable'
  end as temp_direction_3d,
  fw1.air_temp_f as forecast_day1_air_temp_f,
  fw1.wind_mph as forecast_day1_wind_mph,
  fw1.precip_chance_pct as forecast_day1_precip_chance_pct,
  fw2.air_temp_f as forecast_day2_air_temp_f,
  fw2.wind_mph as forecast_day2_wind_mph,
  fw2.precip_chance_pct as forecast_day2_precip_chance_pct,
  fw3.air_temp_f as forecast_day3_air_temp_f,
  fw3.wind_mph as forecast_day3_wind_mph,
  fw3.precip_chance_pct as forecast_day3_precip_chance_pct,
  case
    when forecast.avg_wind_mph is null then null
    when forecast.avg_wind_mph >= 12 or coalesce(forecast.day3_wind_mph, 0) > coalesce(forecast.day1_wind_mph, 0) + 2 then 'Difficult'
    when coalesce(forecast.day3_wind_mph, forecast.day1_wind_mph, 0) < coalesce(forecast.day1_wind_mph, 0) - 2 then 'Improving'
    else 'Stable'
  end as wind_outlook,
  case
    when recent.flow_trend_label is null then null
    when recent.flow_trend_label = 'Rising' then 'Rising'
    when recent.flow_trend_label = 'Dropping' then 'Dropping'
    else 'Stable'
  end as flow_outlook,
  case
    when b.fishability_score_calc is null then null
    when (
      case
        when forecast.avg_wind_mph is null then false
        when forecast.avg_wind_mph >= 12 or coalesce(forecast.day3_wind_mph, 0) > coalesce(forecast.day1_wind_mph, 0) + 2 then true
        else false
      end
    ) then
      case
        when b.fishability_score_calc >= 85 then 'Good'
        when b.fishability_score_calc >= 70 then 'Fair'
        else 'Tough'
      end
    when coalesce(forecast.avg_precip_chance_pct, 0) >= 60 then
      case
        when b.fishability_score_calc >= 85 then 'Good'
        when b.fishability_score_calc >= 55 then 'Fair'
        else 'Tough'
      end
    when b.fishability_score_calc >= 85 and recent.flow_trend_label <> 'Dropping' then 'Excellent'
    when b.fishability_score_calc >= 70 then 'Good'
    when b.fishability_score_calc >= 55 then 'Fair'
    else 'Tough'
  end as fishing_outlook
from base b
left join history on history.river_id = b.river_id and history.date = b.date
left join recent on recent.river_id = b.river_id
left join current_weather cw on cw.river_id = b.river_id
left join forecast_rollup forecast on forecast.river_id = b.river_id
left join forecast_weather fw1 on fw1.river_id = b.river_id and fw1.forecast_day = 1
left join forecast_weather fw2 on fw2.river_id = b.river_id and fw2.forecast_day = 2
left join forecast_weather fw3 on fw3.river_id = b.river_id and fw3.forecast_day = 3
left join flow_source_names fsn on fsn.river_id = b.river_id
left join temp_source_names tsn on tsn.river_id = b.river_id;

grant select on public.river_usgs_map_roles to anon, authenticated, service_role;
grant select on public.river_usgs_map_suggestions to anon, authenticated, service_role;
grant select on public.v_river_temp_coverage to anon, authenticated, service_role;
grant select on public.v_river_latest to anon, authenticated;
grant select on public.v_river_detail to anon, authenticated;
grant select on public.v_river_detail_analytics to anon, authenticated, service_role;
grant select on public.v_river_health to anon, authenticated;
grant select on public.v_river_latest_ranked to anon, authenticated;
