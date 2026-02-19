-- Ensure uuid signature exists for mini-chart RPC.
-- Safe to run multiple times.

create or replace function public.river_history_14d(p_river_id uuid)
returns table (
  obs_date date,
  flow_cfs numeric,
  water_temp_f numeric,
  fishability_score numeric
)
language sql
security definer
set search_path = public
as $$
  select
    d.obs_date,
    d.flow_cfs,
    d.water_temp_f,
    coalesce(d.fishability_score, s.fishability_score_calc) as fishability_score
  from public.river_daily d
  left join public.river_daily_scores s
    on (s.river_id::text = p_river_id::text or s.river_id::text = (select slug from public.rivers where id = p_river_id))
   and s.date = d.obs_date
  where d.river_id = p_river_id
  order by d.obs_date desc
  limit 14;
$$;

grant execute on function public.river_history_14d(uuid) to anon, authenticated, service_role;
