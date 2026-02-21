-- Station registry audit summary for MRI rivers.

select
  s.river_id,
  coalesce(s.river_name, r.river_name, r.slug, s.river_id) as river_name,
  count(*) as station_count,
  count(*) filter (where s.has_flow) as flow_station_count,
  count(*) filter (where s.has_temp) as temp_station_count,
  count(*) filter (where s.has_wq) as wq_station_count,
  max(s.checked_at) as checked_at_latest
from public.usgs_station_registry s
left join public.rivers r on r.id::text = s.river_id or r.slug = s.river_id
where s.is_active = true
group by s.river_id, coalesce(s.river_name, r.river_name, r.river, r.slug, s.river_id)
order by river_name;

-- Current parameter-level ingestion overrides.
select
  c.river_id,
  coalesce(r.river_name, r.slug, c.river_id) as river_name,
  c.parameter_code,
  c.site_no,
  c.priority,
  c.is_enabled,
  c.updated_at
from public.river_station_parameter_config c
left join public.rivers r on r.id::text = c.river_id or r.slug = c.river_id
where c.is_enabled = true
order by river_name, c.parameter_code, c.priority, c.site_no;
