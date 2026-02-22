begin;

create or replace view public.v_river_temp_coverage as
with latest_daily as (
  select distinct on (d.river_id)
    d.river_id,
    d.obs_date,
    d.water_temp_f,
    d.source_temp_observed_at,
    d.temp_source_site_no,
    d.temp_source_kind,
    d.temp_unavailable,
    d.temp_reason
  from public.river_daily d
  order by d.river_id, d.obs_date desc
),
temp_map as (
  select
    m.river_id,
    m.site_no,
    m.priority,
    m.is_active
  from public.river_usgs_map_roles m
  where m.role = 'temp'
)
select
  r.id as river_id,
  coalesce(r.river_name, r.slug, r.id::text) as river_name,
  tm.site_no as mapped_temp_site_no,
  ld.temp_source_site_no as used_temp_site_no,
  ld.temp_source_kind,
  ld.source_temp_observed_at as last_temp_observed_at,
  ld.water_temp_f,
  case
    when ld.water_temp_f is not null
      and ld.source_temp_observed_at is not null
      and extract(epoch from (now() - ld.source_temp_observed_at)) > (6 * 3600)
      then 'available_stale'
    when ld.water_temp_f is not null then 'available'
    when ld.temp_unavailable then 'explicit_unavailable'
    else 'missing'
  end as temp_coverage_status,
  coalesce(ld.temp_reason, case when ld.water_temp_f is null then 'no_temp_observed' end) as temp_reason,
  ld.obs_date as latest_obs_date
from public.rivers r
left join temp_map tm on tm.river_id = r.id and tm.is_active = true and tm.priority = 1
left join latest_daily ld on ld.river_id = r.id
where r.is_active = true
order by river_name;

grant select on public.v_river_temp_coverage to anon, authenticated, service_role;

commit;
