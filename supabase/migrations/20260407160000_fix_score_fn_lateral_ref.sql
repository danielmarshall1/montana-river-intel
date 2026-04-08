-- Fix compute_river_daily_scores: PostgreSQL disallows referencing the UPDATE target
-- table (d) in the SELECT list of FROM LATERAL subqueries.
-- Rewrite using a pre-computed subquery joined on river_daily.id so all d.* access
-- happens in the subquery's FROM clause (where it is allowed), not in LATERAL selects.

create or replace function public.compute_river_daily_scores(
  p_obs_date date default null,
  p_river_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- ── Step 1: compute all scores in a subquery, join back by id ────────────────
  update public.river_daily d
  set
    wind_am_mph     = coalesce(d.wind_am_mph, pre.wam),
    wind_pm_mph     = coalesce(d.wind_pm_mph, pre.wpm),
    flow_score      = scored.flow_score,
    stability_score = scored.stability_score,
    thermal_score   = scored.thermal_score,
    wind_penalty    = scored.wind_penalty,
    precip_penalty  = scored.precip_penalty,
    fishability_score = scored.fishability_score,
    bite_tier       = scored.bite_tier
  from (
    select
      rd.id,
      coalesce(w.wind_am_mph, 0)        as wam,
      coalesce(w.wind_pm_mph, 0)        as wpm,
      -- flow score (deviation from median)
      greatest(0, least(100,
        round((100 - abs(coalesce(rd.flow_ratio, 1.0) - 1.0) * 80)::numeric, 2)
      )) as flow_score,
      -- stability score (48h change penalty)
      greatest(0, least(100,
        round((100 - abs(coalesce(rd.change_48h_pct, 0.0)) * 1.2)::numeric, 2)
      )) as stability_score,
      -- thermal score
      case
        when rd.water_temp_f is null then null
        when rd.water_temp_f < 34    then 40::numeric
        when rd.water_temp_f <= 68   then greatest(0, least(100, round((100 - abs(rd.water_temp_f - 56) * 2.2)::numeric, 2)))
        else greatest(0, least(100, round((60 - (rd.water_temp_f - 68) * 4)::numeric, 2)))
      end as thermal_score,
      -- effective wind (prefer observed from river_daily, fall back to weather)
      coalesce(rd.wind_pm_mph, rd.wind_am_mph, w.wind_pm_mph, w.wind_am_mph, 0.0) as eff_wind,
      -- precip
      coalesce(w.precip_mm, 0.0) as precip_mm
    from public.river_daily rd
    left join lateral (
      select wd.wind_am_mph, wd.wind_pm_mph, wd.precip_mm
      from public.weather_daily wd
      where wd.river_id = rd.river_id
        and wd.date     = rd.obs_date
      order by wd.created_at desc
      limit 1
    ) w on true
    where rd.flow_cfs is not null
      and (p_obs_date is null or rd.obs_date  = p_obs_date)
      and (p_river_id is null or rd.river_id  = p_river_id)
  ) pre
  -- compute derived scores in a second sub-select so they can reference pre.*
  join lateral (
    select
      case
        when pre.eff_wind <= 8  then 0
        when pre.eff_wind <= 15 then 5
        when pre.eff_wind <= 22 then 12
        else 20
      end::numeric as wind_penalty,
      case
        when pre.precip_mm >= 12 then 15
        when pre.precip_mm >= 6  then 8
        when pre.precip_mm >= 2  then 3
        else 0
      end::numeric as precip_penalty
  ) penalties on true
  join lateral (
    select
      pre.flow_score,
      pre.stability_score,
      pre.thermal_score,
      penalties.wind_penalty,
      penalties.precip_penalty,
      greatest(0, least(100, round((
        (
          pre.flow_score * 0.45 +
          pre.stability_score * 0.25 +
          coalesce(pre.thermal_score, 0) * (case when pre.thermal_score is null then 0 else 0.30 end)
        )
        / nullif(0.45 + 0.25 + (case when pre.thermal_score is null then 0 else 0.30 end), 0)
        - penalties.wind_penalty
        - penalties.precip_penalty
      )::numeric, 0))) as fishability_score
  ) raw on true
  join lateral (
    select
      raw.flow_score,
      raw.stability_score,
      raw.thermal_score,
      raw.wind_penalty,
      raw.precip_penalty,
      raw.fishability_score,
      case
        when raw.fishability_score >= 85 then 'HOT'
        when raw.fishability_score >= 70 then 'GOOD'
        when raw.fishability_score >= 55 then 'FAIR'
        else 'TOUGH'
      end as bite_tier
  ) scored on true
  where d.id = pre.id;

  -- ── Step 2: fallback for rows still missing fishability (no weather match) ────
  update public.river_daily d
  set
    fishability_score = coalesce(
      d.fishability_score,
      greatest(0, least(100, round((100 - abs(coalesce(d.flow_ratio, 1.0) - 1.0) * 80)::numeric, 0)))
    ),
    bite_tier = coalesce(
      d.bite_tier,
      case
        when coalesce(d.fishability_score, 0) >= 85 then 'HOT'
        when coalesce(d.fishability_score, 0) >= 70 then 'GOOD'
        when coalesce(d.fishability_score, 0) >= 55 then 'FAIR'
        else 'TOUGH'
      end
    )
  where d.flow_cfs is not null
    and (p_obs_date is null or d.obs_date  = p_obs_date)
    and (p_river_id is null or d.river_id  = p_river_id);
end;
$$;

grant execute on function public.compute_river_daily_scores(date, uuid) to service_role;
