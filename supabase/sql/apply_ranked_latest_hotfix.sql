-- Hotfix: rebuild latest/health/detail views in a safe order.
-- Use this if you hit:
-- ERROR: 42P16 cannot change name of view column ...

begin;

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
    d.source_parameter_codes,
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
    ld.source_parameter_codes,
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
  end as stale_reason
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
select
  v.river_id,
  v.river_name,
  v.last_usgs_pull_at,
  v.last_weather_pull_at,
  v.last_river_daily_date,
  v.is_stale,
  coalesce(
    v.stale_reason,
    case
      when v.last_weather_pull_at is null then 'missing_weather_pull'
      else null
    end
  ) as stale_reason,
  (v.water_temp_f is null) as missing_temperature,
  (v.median_flow_cfs is null) as missing_median_baseline,
  (abs(coalesce(v.change_48h_pct_calc, 0)) >= 80) as possible_spike
from public.v_river_latest v;

create view public.v_river_latest_ranked as
select * from public.v_river_latest;

grant select on public.v_river_latest to anon, authenticated;
grant select on public.v_river_detail to anon, authenticated;
grant select on public.v_river_health to anon, authenticated;
grant select on public.v_river_latest_ranked to anon, authenticated;

commit;
