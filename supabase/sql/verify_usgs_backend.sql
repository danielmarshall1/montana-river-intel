-- MRI backend verification checklist
-- Run after migration + at least one usgs-ingest invocation.

-- 1) Verify one latest row per active river and recency
select
  v.river_id,
  v.slug,
  v.river_name,
  v.usgs_site_no,
  v.date,
  v.flow_cfs,
  v.water_temp_f,
  v.source_flow_observed_at,
  (v.source_flow_observed_at >= now() - interval '36 hours') as is_recent
from public.v_river_latest v
order by v.river_name;

-- 2) River health flags (stale / missing temp / spikes / missing baseline)
select
  h.river_id,
  h.slug,
  h.river_name,
  h.is_stale,
  h.missing_temperature,
  h.possible_spike,
  h.missing_median_baseline,
  h.date,
  h.flow_cfs,
  h.change_48h_pct_calc
from public.v_river_health h
order by h.is_stale desc, h.possible_spike desc, h.river_name;

-- 3) Last ingestion runs summary
select
  run_id,
  started_at,
  finished_at,
  cadence,
  status,
  sites_total,
  sites_ok,
  sites_failed
from public.v_usgs_pull_log
group by run_id, started_at, finished_at, cadence, status, sites_total, sites_ok, sites_failed
order by started_at desc
limit 20;

-- 4) Per-site outcomes for latest run
with latest_run as (
  select run_id
  from public.v_usgs_pull_log
  order by started_at desc
  limit 1
)
select
  l.run_id,
  l.river_id,
  l.slug,
  l.river_name,
  l.usgs_site_no,
  l.site_status,
  l.site_error,
  l.http_status,
  l.flow_cfs,
  l.water_temp_f,
  l.parameter_codes,
  l.source_flow_observed_at,
  l.source_temp_observed_at
from public.v_usgs_pull_log l
join latest_run r on r.run_id = l.run_id
order by l.river_name;

-- 5) Pull mini-chart dataset for a specific river by slug (replace slug as needed)
select
  d.obs_date,
  d.flow_cfs,
  d.water_temp_f,
  d.fishability_score
from public.river_history_14d(
  (select id from public.rivers where slug = 'flathead-river' limit 1)
) d
order by d.obs_date desc;
