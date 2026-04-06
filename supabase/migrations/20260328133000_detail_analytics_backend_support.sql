alter table if exists public.weather_daily add column if not exists air_temp_f numeric;
alter table if exists public.weather_daily add column if not exists wind_direction text;
alter table if exists public.weather_daily add column if not exists gust_mph numeric;
alter table if exists public.weather_daily add column if not exists cloud_cover_pct numeric;
alter table if exists public.weather_daily add column if not exists observed_at timestamptz;

create or replace function public.day_of_year_window_distance(p_day_one integer, p_day_two integer)
returns integer
language sql
immutable
as $$
  select least(abs(p_day_one - p_day_two), 366 - abs(p_day_one - p_day_two));
$$;

create or replace view public.river_historical_percentiles as
with active_rivers as (
  select r.id as river_id
  from public.rivers r
  where r.is_active = true
),
day_series as (
  select generate_series(1, 366) as day_of_year
)
select
  r.river_id,
  d.day_of_year,
  percentile_cont(0.10) within group (order by hist.flow_cfs) as flow_p10,
  percentile_cont(0.25) within group (order by hist.flow_cfs) as flow_p25,
  percentile_cont(0.50) within group (order by hist.flow_cfs) as flow_p50,
  percentile_cont(0.75) within group (order by hist.flow_cfs) as flow_p75,
  percentile_cont(0.90) within group (order by hist.flow_cfs) as flow_p90,
  count(hist.flow_cfs)::int as sample_size
from active_rivers r
cross join day_series d
left join public.river_daily hist
  on hist.river_id = r.river_id
 and hist.flow_cfs is not null
 and public.day_of_year_window_distance(extract(doy from hist.obs_date)::int, d.day_of_year) <= 7
group by r.river_id, d.day_of_year;

create or replace view public.v_river_recent_analytics as
with latest_daily as (
  select distinct on (d.river_id)
    d.river_id,
    d.obs_date,
    d.flow_cfs as current_flow_cfs,
    d.water_temp_f as current_temp_f,
    d.gage_height_ft as current_stage_ft,
    d.source_flow_observed_at,
    d.source_temp_observed_at,
    d.source_gage_observed_at
  from public.river_daily d
  order by d.river_id, d.obs_date desc
)
select
  ld.river_id,
  ld.obs_date as current_obs_date,
  ld.current_flow_cfs,
  ld.current_temp_f,
  ld.current_stage_ft,
  lag48.flow_cfs as flow_48h_ago,
  lag24.water_temp_f as temp_24h_ago,
  case
    when ld.current_flow_cfs is null or lag48.flow_cfs is null or lag48.flow_cfs = 0 then null
    else round((((ld.current_flow_cfs - lag48.flow_cfs) / lag48.flow_cfs) * 100.0)::numeric, 1)
  end as change_48h_pct,
  case
    when ld.current_temp_f is null or lag24.water_temp_f is null then null
    else round((ld.current_temp_f - lag24.water_temp_f)::numeric, 1)
  end as temp_change_24h_f,
  stability.stability_index_raw,
  case
    when stability.stability_index_raw is null then null
    when stability.stability_index_raw < 0.05 then 'High Stability'
    when stability.stability_index_raw <= 0.12 then 'Moderate Stability'
    else 'Low Stability'
  end as stability_label
from latest_daily ld
left join lateral (
  select d.flow_cfs
  from public.river_daily d
  where d.river_id = ld.river_id
    and d.flow_cfs is not null
    and d.obs_date <= ld.obs_date
  order by abs(d.obs_date - (ld.obs_date - 2)), d.obs_date desc
  limit 1
) lag48 on true
left join lateral (
  select d.water_temp_f
  from public.river_daily d
  where d.river_id = ld.river_id
    and d.water_temp_f is not null
    and d.obs_date <= ld.obs_date
  order by abs(d.obs_date - (ld.obs_date - 1)), d.obs_date desc
  limit 1
) lag24 on true
left join lateral (
  select
    case
      when count(*) < 2 or avg(recent.flow_cfs) is null or avg(recent.flow_cfs) = 0 then null
      else round((stddev_samp(recent.flow_cfs) / avg(recent.flow_cfs))::numeric, 4)
    end as stability_index_raw
  from (
    select d.flow_cfs
    from public.river_daily d
    where d.river_id = ld.river_id
      and d.flow_cfs is not null
    order by d.obs_date desc
    limit 3
  ) recent
) stability on true;

create or replace view public.v_river_detail_analytics as
with current_weather as (
  select distinct on (w.river_id)
    w.river_id,
    w.air_temp_f,
    coalesce(w.wind_speed_max_mph, w.wind_pm_mph, w.wind_am_mph) as wind_speed_mph,
    w.wind_direction,
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
  v.river_id,
  v.slug,
  v.river_name,
  v.gauge_label,
  v.date,
  recent.current_flow_cfs,
  recent.current_temp_f,
  recent.current_stage_ft,
  v.median_flow_cfs,
  coalesce(v.flow_ratio_calc, case
    when recent.current_flow_cfs is null or v.median_flow_cfs is null or v.median_flow_cfs = 0 then null
    else round((recent.current_flow_cfs / v.median_flow_cfs)::numeric, 2)
  end) as flow_ratio,
  recent.flow_48h_ago,
  recent.temp_24h_ago,
  coalesce(v.change_48h_pct_calc, recent.change_48h_pct) as change_48h_pct,
  recent.temp_change_24h_f,
  recent.stability_index_raw,
  recent.stability_label,
  hp.flow_p10,
  hp.flow_p25,
  hp.flow_p50,
  hp.flow_p75,
  hp.flow_p90,
  hp.sample_size as historical_sample_size,
  case
    when hp.sample_size is null or hp.sample_size < 20 or recent.current_flow_cfs is null then null
    when hp.flow_p10 is null or hp.flow_p25 is null or hp.flow_p50 is null or hp.flow_p75 is null or hp.flow_p90 is null then null
    when recent.current_flow_cfs <= hp.flow_p10 then 10
    when recent.current_flow_cfs <= hp.flow_p25 then round((10 + ((recent.current_flow_cfs - hp.flow_p10) / nullif(hp.flow_p25 - hp.flow_p10, 0)) * 15)::numeric, 1)
    when recent.current_flow_cfs <= hp.flow_p50 then round((25 + ((recent.current_flow_cfs - hp.flow_p25) / nullif(hp.flow_p50 - hp.flow_p25, 0)) * 25)::numeric, 1)
    when recent.current_flow_cfs <= hp.flow_p75 then round((50 + ((recent.current_flow_cfs - hp.flow_p50) / nullif(hp.flow_p75 - hp.flow_p50, 0)) * 25)::numeric, 1)
    when recent.current_flow_cfs <= hp.flow_p90 then round((75 + ((recent.current_flow_cfs - hp.flow_p75) / nullif(hp.flow_p90 - hp.flow_p75, 0)) * 15)::numeric, 1)
    else 90
  end as flow_percentile,
  case
    when hp.sample_size is null or hp.sample_size < 20 then 'Insufficient history'
    else null
  end as flow_percentile_status,
  v.temp_source_kind,
  v.source_temp_observed_at as temp_observed_at,
  case
    when v.source_temp_observed_at is null then 'Low'
    when coalesce(v.temp_source_kind, '') = 'DV' then 'Moderate'
    when coalesce(v.temp_source_site_no, v.usgs_site_no) <> coalesce(v.flow_source_site_no, v.usgs_site_no) then 'Moderate'
    else 'High'
  end as confidence_level,
  v.flow_source_site_no,
  fsn.station_name as flow_source_site_name,
  v.temp_source_site_no,
  tsn.station_name as temp_source_site_name,
  coalesce(v.source_temp_observed_at, v.source_flow_observed_at) as observation_timestamp,
  v.last_usgs_pull_at as last_hydrology_pull_at,
  cw.air_temp_f,
  cw.wind_speed_mph,
  cw.wind_direction,
  cw.gust_mph,
  cw.precip_chance_pct,
  cw.cloud_cover_pct,
  cw.daily_high_f,
  cw.daily_low_f,
  cw.weather_observed_at,
  fw1.air_temp_f as forecast_day1_air_temp_f,
  fw1.wind_mph as forecast_day1_wind_mph,
  fw1.precip_chance_pct as forecast_day1_precip_chance_pct,
  fw2.air_temp_f as forecast_day2_air_temp_f,
  fw2.wind_mph as forecast_day2_wind_mph,
  fw2.precip_chance_pct as forecast_day2_precip_chance_pct,
  fw3.air_temp_f as forecast_day3_air_temp_f,
  fw3.wind_mph as forecast_day3_wind_mph,
  fw3.precip_chance_pct as forecast_day3_precip_chance_pct
from public.v_river_detail v
left join public.v_river_recent_analytics recent on recent.river_id = v.river_id
left join public.river_historical_percentiles hp
  on hp.river_id = v.river_id
 and hp.day_of_year = extract(doy from coalesce(v.date, (now() at time zone 'America/Denver')::date))::int
left join current_weather cw on cw.river_id = v.river_id
left join forecast_weather fw1 on fw1.river_id = v.river_id and fw1.forecast_day = 1
left join forecast_weather fw2 on fw2.river_id = v.river_id and fw2.forecast_day = 2
left join forecast_weather fw3 on fw3.river_id = v.river_id and fw3.forecast_day = 3
left join flow_source_names fsn on fsn.river_id = v.river_id
left join temp_source_names tsn on tsn.river_id = v.river_id;

grant execute on function public.day_of_year_window_distance(integer, integer) to anon, authenticated, service_role;
grant select on public.river_historical_percentiles to anon, authenticated, service_role;
grant select on public.v_river_recent_analytics to anon, authenticated, service_role;
grant select on public.v_river_detail_analytics to anon, authenticated, service_role;
