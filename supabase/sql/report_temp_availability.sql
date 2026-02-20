-- Temp availability report for mapped active rivers.

select
  r.id as river_id,
  r.slug,
  r.river_name,
  coalesce(m.temp_site_no, m.flow_site_no, r.usgs_site_no) as temp_site_no,
  p.has_temp_iv,
  p.has_temp_dv,
  case
    when p.has_temp_iv then 'IV'
    when p.has_temp_dv then 'DV fallback'
    else 'None'
  end as temp_source_mode,
  p.checked_at
from public.rivers r
left join public.river_usgs_map m on m.river_id = r.id
left join public.usgs_site_parameters p on p.site_no = coalesce(m.temp_site_no, m.flow_site_no, r.usgs_site_no)
where r.is_active = true
order by r.river_name asc;

-- Summary counts
select
  count(*) filter (where p.has_temp_iv) as iv_temp_sites,
  count(*) filter (where not coalesce(p.has_temp_iv, false) and coalesce(p.has_temp_dv, false)) as dv_only_sites,
  count(*) filter (where not coalesce(p.has_temp_iv, false) and not coalesce(p.has_temp_dv, false)) as no_temp_sites
from public.rivers r
left join public.river_usgs_map m on m.river_id = r.id
left join public.usgs_site_parameters p on p.site_no = coalesce(m.temp_site_no, m.flow_site_no, r.usgs_site_no)
where r.is_active = true;

