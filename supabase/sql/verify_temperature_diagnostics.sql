-- Temperature diagnostics verification (strict same-river policy).

-- 1) Coverage + status distribution
select
  temp_status,
  count(*) as rivers
from public.v_river_latest
group by temp_status
order by temp_status;

-- 2) Rivers missing temp or stale temp (action list)
select
  river_id,
  river_name,
  gauge_label,
  water_temp_f,
  temp_status,
  temp_stale,
  temp_age_minutes,
  temp_source_kind,
  temp_source_site_no,
  source_temp_observed_at,
  source_parameter_codes
from public.v_river_latest
where temp_status <> 'available_fresh'
order by river_name;

-- 3) Ensure no sibling/cross-river fallback marker still appears
select
  river_id,
  river_name,
  source_payload->>'temp_source' as temp_source_raw
from public.river_daily d
join public.rivers r on r.id = d.river_id
where d.obs_date = (now() at time zone 'America/Denver')::date
  and coalesce(d.source_payload->>'temp_source','') ilike '%SIBLING%';

-- 4) Rivers with no mapped temp station configured
select
  r.id as river_id,
  coalesce(r.river_name, r.slug) as river_name,
  m.temp_site_no,
  m.flow_site_no
from public.rivers r
left join public.river_usgs_map m on m.river_id::text = r.id::text
where r.is_active = true
  and coalesce(m.temp_site_no, '') = ''
order by river_name;

