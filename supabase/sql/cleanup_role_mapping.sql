-- Normalize role mapping:
-- - one active primary (priority=1) per river+role
-- - keep additional candidates active with priority > 1
-- - sync legacy river_usgs_map afterwards

with ranked as (
  select
    m.river_id,
    m.role,
    m.site_no,
    row_number() over (
      partition by m.river_id, m.role
      order by m.priority asc, m.updated_at desc, m.site_no asc
    ) as rn
  from public.river_usgs_map_roles m
  where m.is_active = true
)
update public.river_usgs_map_roles m
set
  priority = case when r.rn = 1 then 1 else greatest(2, m.priority) end,
  is_active = true,
  updated_at = now()
from ranked r
where m.river_id = r.river_id
  and m.role = r.role
  and m.site_no = r.site_no;

-- Keep legacy compatibility table in sync.
select public.sync_legacy_river_usgs_map_from_roles();

