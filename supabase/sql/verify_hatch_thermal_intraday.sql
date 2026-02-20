-- MRI Hatch + Intraday Thermal verification

-- 1) Hourly rows per active river in last 24h
select
  r.id as river_id,
  r.slug,
  r.river_name,
  count(h.observed_at) as points_24h,
  max(h.observed_at) as last_hourly_point
from public.rivers r
left join public.river_hourly h
  on h.river_id = r.id
  and h.observed_at >= now() - interval '24 hours'
where r.is_active = true
group by r.id, r.slug, r.river_name
order by points_24h asc, r.river_name asc;

-- 2) Intraday thermal shape for a specific river id
-- Replace UUID as needed.
select *
from public.river_intraday_24h('fc003859-7486-4310-89ee-feb6a25da096'::uuid)
order by observed_at asc;

-- 3) Quick delta check (latest vs 3h prior) for all active rivers
with latest as (
  select distinct on (h.river_id)
    h.river_id,
    h.observed_at as latest_at,
    h.water_temp_f as latest_temp_f
  from public.river_hourly h
  order by h.river_id, h.observed_at desc
),
prior as (
  select
    l.river_id,
    (
      select h2.water_temp_f
      from public.river_hourly h2
      where h2.river_id = l.river_id
        and h2.observed_at <= l.latest_at - interval '3 hours'
      order by h2.observed_at desc
      limit 1
    ) as temp_3h_ago
  from latest l
)
select
  r.id as river_id,
  r.slug,
  r.river_name,
  l.latest_at,
  l.latest_temp_f,
  p.temp_3h_ago,
  case
    when l.latest_temp_f is null or p.temp_3h_ago is null then null
    else round((l.latest_temp_f - p.temp_3h_ago)::numeric, 1)
  end as delta_3h_f
from public.rivers r
left join latest l on l.river_id = r.id
left join prior p on p.river_id = r.id
where r.is_active = true
order by r.river_name asc;

