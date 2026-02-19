-- MRI freshness + ranking verification checklist

-- 1) Confirm scheduler extensions are available
select extname, extversion
from pg_extension
where extname in ('pg_cron', 'pg_net')
order by extname;

-- 1b) If pg_cron is installed, run this query separately:
-- select jobid, jobname, schedule, active
-- from cron.job
-- where jobname in ('mri-hourly-usgs-ingest', 'mri-hourly-weather-ingest')
-- order by jobname;

-- 2) Health view: stale detection + reasons
select
  river_id,
  river_name,
  last_usgs_pull_at,
  last_weather_pull_at,
  last_river_daily_date,
  is_stale,
  stale_reason
from public.v_river_health
order by is_stale desc, river_name;

-- 2b) Acceptance check: all active rivers have today's row by 06:00 MT
-- (Run after 06:00 America/Denver)
with totals as (
  select count(*)::int as active_rivers
  from public.rivers
  where is_active = true
),
today_rows as (
  select count(distinct d.river_id)::int as rivers_with_today_row
  from public.river_daily d
  join public.rivers r on r.id = d.river_id
  where r.is_active = true
    and d.obs_date = (now() at time zone 'America/Denver')::date
)
select
  t.active_rivers,
  y.rivers_with_today_row,
  (t.active_rivers - y.rivers_with_today_row) as missing_today_rows
from totals t
cross join today_rows y;

-- 3) Ranked latest view fields are present and populated
select
  river_id,
  slug,
  river_name,
  fishability_score_calc,
  fishability_rank,
  fishability_percentile,
  is_stale
from public.v_river_latest
order by fishability_score_calc desc nulls last
limit 25;

-- 4) 14-day mini chart RPC output
-- If this errors, run:
-- supabase/sql/ensure_river_history_uuid_rpc.sql
select *
from public.river_history_14d(
  (select id from public.rivers where slug = 'flathead-columbia-falls' limit 1)
);
