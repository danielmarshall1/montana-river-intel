-- Verify temperature coverage + provenance for the known missing set.

select
  v.river_name,
  v.flow_source_site_no,
  v.temp_source_site_no,
  v.temp_source_kind,
  v.water_temp_f,
  v.source_flow_observed_at,
  v.source_temp_observed_at,
  v.temp_status,
  v.temp_reason
from public.v_river_latest v
where v.river_name in (
  'Big Hole River',
  'Bitterroot River',
  'Clark Fork',
  'Kootenai River',
  'Marias River',
  'North Fork Flathead River',
  'Rock Creek'
)
order by v.river_name, v.gauge_label;

-- Coverage rollup across all active rivers.
select
  count(*) as rivers_total,
  count(*) filter (where temp_status in ('available_fresh', 'available_stale')) as rivers_with_temp,
  count(*) filter (where temp_status = 'unavailable_at_gauge') as rivers_without_temp,
  count(*) filter (where temp_source_kind = 'IV') as temp_from_iv,
  count(*) filter (where temp_source_kind = 'DV') as temp_from_dv
from public.v_river_latest;

-- Freshness health check.
select
  count(*) filter (where stale_flow) as stale_flow_rivers,
  count(*) filter (where stale_temp) as stale_temp_rivers,
  count(*) filter (where stale_weather) as stale_weather_rivers,
  count(*) filter (where mapping_gaps) as mapping_gap_rivers
from public.v_river_health;

