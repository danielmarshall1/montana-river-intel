drop view if exists public.v_river_latest_ranked;
drop view if exists public.v_river_detail;
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
  r.source_temp_observed_at as temp_observed_at,
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
  end as temp_status,
  case
    when r.source_temp_observed_at is null then 'Low'
    when coalesce(r.temp_source_kind, '') = 'DV' then 'Moderate'
    when coalesce(r.temp_source_site_no, nullif(r.source_payload->>'temp_site_no', ''), r.usgs_site_no)
         <> coalesce(r.flow_source_site_no, nullif(r.source_payload->>'flow_site_no', ''), r.usgs_site_no) then 'Moderate'
    else 'High'
  end as confidence_level
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

create view public.v_river_latest_ranked as
select * from public.v_river_latest;

create or replace view public.v_river_temperature_trust_report as
with temp_capability as (
  select
    usp.site_no,
    coalesce(usp.has_temp_iv, false) as has_iv_temp,
    coalesce(usp.has_temp_dv, false) as has_dv_temp
  from public.usgs_site_parameters usp
)
select
  r.id as river_id,
  coalesce(r.river_name, r.slug, r.id::text) as river_name,
  v.flow_source_site_no as flow_site,
  v.temp_source_site_no as temp_site,
  tc.has_iv_temp,
  tc.has_dv_temp,
  v.temp_source_kind,
  v.confidence_level,
  v.temp_status,
  v.temp_reason,
  v.temp_observed_at
from public.rivers r
left join public.v_river_latest v on v.river_id = r.id
left join temp_capability tc on tc.site_no = v.temp_source_site_no
where r.is_active = true
order by coalesce(r.river_name, r.slug, r.id::text);

grant select on public.v_river_latest to anon, authenticated;
grant select on public.v_river_detail to anon, authenticated;
grant select on public.v_river_latest_ranked to anon, authenticated;
grant select on public.v_river_temperature_trust_report to anon, authenticated, service_role;
