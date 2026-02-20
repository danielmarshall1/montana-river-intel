-- Map Yellowstone Livingston temp to Yellowstone Corwin Springs temp site.
-- Flow/stage remain on Livingston gauge.

update public.river_usgs_map m
set
  temp_site_no = '06191500',
  updated_at = now()
from public.rivers r
where r.id = m.river_id
  and r.slug = 'yellowstone-livingston';

-- Verify mapping
select
  r.slug,
  m.flow_site_no,
  m.temp_site_no,
  m.stage_site_no,
  m.updated_at
from public.river_usgs_map m
join public.rivers r on r.id = m.river_id
where r.slug in ('yellowstone-livingston', 'yellowstone-corwin-springs')
order by r.slug;

