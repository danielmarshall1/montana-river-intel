-- Investigate NULL fishability score in latest river rows

select
  v.river_id,
  v.slug,
  v.river_name,
  v.flow_score,
  v.stability_score,
  v.thermal_score,
  v.wind_penalty,
  v.fishability_score_calc as fishability_score,
  v.flow_ratio_calc,
  v.change_48h_pct_calc,
  v.water_temp_f
from public.v_river_latest v
where v.fishability_score_calc is null
order by v.flow_cfs desc nulls last, v.river_name;

-- Top 3 by flow with component diagnostics
select
  v.river_id,
  v.slug,
  v.river_name,
  v.flow_cfs,
  v.flow_score,
  v.stability_score,
  v.thermal_score,
  v.wind_penalty,
  v.fishability_score_calc as fishability_score,
  v.flow_ratio_calc,
  v.change_48h_pct_calc,
  v.water_temp_f
from public.v_river_latest v
order by v.flow_cfs desc nulls last
limit 3;

-- Check function timestamps via latest runs/logs
select run_id, started_at, finished_at, status, sites_total, sites_ok, sites_failed
from public.v_usgs_pull_log
group by run_id, started_at, finished_at, status, sites_total, sites_ok, sites_failed
order by started_at desc
limit 20;
