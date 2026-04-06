drop view if exists public.v_river_detail_analytics;

create view public.v_river_detail_analytics as
with mountain_today as (
  select (now() at time zone 'America/Denver')::date as today_date
),
base as (
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
  cross join mountain_today mt
  where w.date <= mt.today_date
  order by w.river_id, w.date desc, coalesce(w.observed_at, w.created_at) desc
),
forecast_day_1 as (
  select
    w.river_id,
    w.air_temp_high_f as air_temp_f,
    coalesce(w.wind_speed_max_mph, w.wind_pm_mph, w.wind_am_mph) as wind_mph,
    w.precip_probability_pct as precip_chance_pct
  from public.weather_daily w
  cross join mountain_today mt
  where w.date = mt.today_date + 1
),
forecast_day_2 as (
  select
    w.river_id,
    w.air_temp_high_f as air_temp_f,
    coalesce(w.wind_speed_max_mph, w.wind_pm_mph, w.wind_am_mph) as wind_mph,
    w.precip_probability_pct as precip_chance_pct
  from public.weather_daily w
  cross join mountain_today mt
  where w.date = mt.today_date + 2
),
forecast_day_3 as (
  select
    w.river_id,
    w.air_temp_high_f as air_temp_f,
    coalesce(w.wind_speed_max_mph, w.wind_pm_mph, w.wind_am_mph) as wind_mph,
    w.precip_probability_pct as precip_chance_pct
  from public.weather_daily w
  cross join mountain_today mt
  where w.date = mt.today_date + 3
),
forecast_rollup as (
  select
    b.river_id,
    (
      coalesce(fd1.wind_mph, 0) +
      coalesce(fd2.wind_mph, 0) +
      coalesce(fd3.wind_mph, 0)
    ) / nullif(
      (case when fd1.wind_mph is not null then 1 else 0 end) +
      (case when fd2.wind_mph is not null then 1 else 0 end) +
      (case when fd3.wind_mph is not null then 1 else 0 end),
      0
    ) as avg_wind_mph,
    (
      coalesce(fd1.precip_chance_pct, 0) +
      coalesce(fd2.precip_chance_pct, 0) +
      coalesce(fd3.precip_chance_pct, 0)
    ) / nullif(
      (case when fd1.precip_chance_pct is not null then 1 else 0 end) +
      (case when fd2.precip_chance_pct is not null then 1 else 0 end) +
      (case when fd3.precip_chance_pct is not null then 1 else 0 end),
      0
    ) as avg_precip_chance_pct,
    fd1.wind_mph as day1_wind_mph,
    fd3.wind_mph as day3_wind_mph,
    fd1.air_temp_f as day1_air_temp_f,
    fd3.air_temp_f as day3_air_temp_f
  from base b
  left join forecast_day_1 fd1 on fd1.river_id = b.river_id
  left join forecast_day_2 fd2 on fd2.river_id = b.river_id
  left join forecast_day_3 fd3 on fd3.river_id = b.river_id
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
  fd1.air_temp_f as forecast_day1_air_temp_f,
  fd1.wind_mph as forecast_day1_wind_mph,
  fd1.precip_chance_pct as forecast_day1_precip_chance_pct,
  fd2.air_temp_f as forecast_day2_air_temp_f,
  fd2.wind_mph as forecast_day2_wind_mph,
  fd2.precip_chance_pct as forecast_day2_precip_chance_pct,
  fd3.air_temp_f as forecast_day3_air_temp_f,
  fd3.wind_mph as forecast_day3_wind_mph,
  fd3.precip_chance_pct as forecast_day3_precip_chance_pct,
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
left join forecast_day_1 fd1 on fd1.river_id = b.river_id
left join forecast_day_2 fd2 on fd2.river_id = b.river_id
left join forecast_day_3 fd3 on fd3.river_id = b.river_id
left join flow_source_names fsn on fsn.river_id = b.river_id
left join temp_source_names tsn on tsn.river_id = b.river_id;

grant select on public.v_river_detail_analytics to anon, authenticated, service_role;
