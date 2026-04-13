-- ─────────────────────────────────────────────────────────────────────────────
-- Scoring model v2: seasonal multiplier, runoff/clarity penalty, thermal
-- activity modifier, updated bite_tier thresholds.
--
-- Changes:
--   1. seasonal_modifier  — monthly multiplier (0.55 Jan → 1.00 Sep)
--   2. runoff_penalty     — month-based + flow-based + precip-based, capped 25
--   3. thermal_activity_modifier — trout feeding activity by water temp band
--   4. Final formula:
--        raw_score      = clamp(weighted_sum/den - wind_p - precip_p - runoff_p, 0, 100)
--        adjusted_score = raw_score * thermal_activity_modifier
--        final_score    = clamp(round(adjusted_score * seasonal_modifier), 0, 100)
--   5. Bite tier thresholds: HOT>=82, GOOD>=65, FAIR>=48, TOUGH<48
-- ─────────────────────────────────────────────────────────────────────────────

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
  -- ── Step 0: sync temp_source_site_no from river_usgs_map_roles ───────────────
  update public.river_daily d
  set temp_source_site_no = (
    select m.site_no::text
    from public.river_usgs_map_roles m
    where m.river_id  = d.river_id
      and m.role      = 'temp'
      and m.is_active = true
    order by m.priority asc nulls last
    limit 1
  )
  where (p_obs_date is null or d.obs_date = p_obs_date)
    and (p_river_id is null or d.river_id = p_river_id);

  -- ── Step 1: compute all scores ────────────────────────────────────────────────
  update public.river_daily d
  set
    wind_am_mph       = coalesce(d.wind_am_mph, pre.wam),
    wind_pm_mph       = coalesce(d.wind_pm_mph, pre.wpm),
    flow_score        = scored.flow_score,
    stability_score   = scored.stability_score,
    thermal_score     = scored.thermal_score,
    wind_penalty      = scored.wind_penalty,
    precip_penalty    = scored.precip_penalty,
    fishability_score = scored.fishability_score,
    bite_tier         = scored.bite_tier
  from (
    -- pre: raw inputs + component scores
    select
      rd.id,
      rd.obs_date,
      coalesce(rd.flow_ratio,     1.0)  as flow_ratio,
      coalesce(rd.change_48h_pct, 0.0)  as change_48h_pct,
      rd.water_temp_f,
      coalesce(w.wind_am_mph, 0)        as wam,
      coalesce(w.wind_pm_mph, 0)        as wpm,
      -- flow score
      greatest(0, least(100,
        round((100 - abs(coalesce(rd.flow_ratio, 1.0) - 1.0) * 80)::numeric, 2)
      )) as flow_score,
      -- stability score
      greatest(0, least(100,
        round((100 - abs(coalesce(rd.change_48h_pct, 0.0)) * 1.2)::numeric, 2)
      )) as stability_score,
      -- thermal score (existing curve, unchanged)
      case
        when rd.water_temp_f is null then null
        when rd.water_temp_f < 34    then 40::numeric
        when rd.water_temp_f <= 68   then greatest(0, least(100, round((100 - abs(rd.water_temp_f - 56) * 2.2)::numeric, 2)))
        else greatest(0, least(100, round((60 - (rd.water_temp_f - 68) * 4)::numeric, 2)))
      end as thermal_score,
      -- effective wind (prefer river_daily observed, fall back to weather)
      coalesce(rd.wind_pm_mph, rd.wind_am_mph, w.wind_pm_mph, w.wind_am_mph, 0.0) as eff_wind,
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
      and (p_obs_date is null or rd.obs_date = p_obs_date)
      and (p_river_id is null or rd.river_id = p_river_id)
  ) pre

  -- penalties + new modifiers
  join lateral (
    select
      -- existing: wind penalty
      case
        when pre.eff_wind <= 8  then 0
        when pre.eff_wind <= 15 then 5
        when pre.eff_wind <= 22 then 12
        else 20
      end::numeric as wind_penalty,
      -- existing: precip penalty
      case
        when pre.precip_mm >= 12 then 15
        when pre.precip_mm >= 6  then 8
        when pre.precip_mm >= 2  then 3
        else 0
      end::numeric as precip_penalty,
      -- NEW: runoff/clarity penalty (capped at 25)
      least(25::numeric, (
        -- month-based baseline snowmelt penalty
        case when extract(month from pre.obs_date) = 4 then 8 else 0 end +
        case when extract(month from pre.obs_date) = 5 then 12 else 0 end +
        case when extract(month from pre.obs_date) = 6 then 5 else 0 end +
        -- flow-based turbidity signals
        case when pre.flow_ratio > 1.5 then 8 else 0 end +
        case when pre.flow_ratio > 2.0 then 5 else 0 end +
        -- rapidly rising
        case when pre.change_48h_pct > 20 and pre.change_48h_pct > 0 then 7 else 0 end +
        case when pre.change_48h_pct > 40 and pre.change_48h_pct > 0 then 5 else 0 end +
        -- recent precipitation
        case when pre.precip_mm >= 8  then 6 else 0 end +
        case when pre.precip_mm >= 15 then 4 else 0 end
      )::numeric) as runoff_penalty,
      -- NEW: seasonal activity modifier
      case extract(month from pre.obs_date)
        when 1  then 0.55
        when 2  then 0.55
        when 3  then 0.60
        when 4  then 0.65
        when 5  then 0.72
        when 6  then 0.87
        when 7  then 0.92
        when 8  then 0.88
        when 9  then 1.00
        when 10 then 0.95
        when 11 then 0.72
        when 12 then 0.58
        else 1.0
      end::numeric as seasonal_modifier,
      -- NEW: thermal activity modifier (trout feeding activity by temp band)
      case
        when pre.water_temp_f is null  then 0.85
        when pre.water_temp_f < 38     then 0.50
        when pre.water_temp_f < 42     then 0.65
        when pre.water_temp_f < 46     then 0.78
        when pre.water_temp_f < 52     then 0.90
        when pre.water_temp_f <= 62    then 1.00
        when pre.water_temp_f <= 65    then 0.90
        when pre.water_temp_f <= 68    then 0.75
        when pre.water_temp_f <= 72    then 0.55
        else 0.30
      end::numeric as thermal_activity_modifier
  ) penalties on true

  -- raw score → adjusted → final
  join lateral (
    select
      pre.flow_score,
      pre.stability_score,
      pre.thermal_score,
      penalties.wind_penalty,
      penalties.precip_penalty,
      -- raw_score: weighted blend minus all point penalties, clamped 0-100
      greatest(0::numeric, least(100::numeric,
        (
          pre.flow_score      * 0.45
          + pre.stability_score * 0.25
          + coalesce(pre.thermal_score, 0) * (case when pre.thermal_score is null then 0 else 0.30 end)
        )
        / nullif(0.45 + 0.25 + (case when pre.thermal_score is null then 0 else 0.30 end), 0)
        - penalties.wind_penalty
        - penalties.precip_penalty
        - penalties.runoff_penalty
      )) as raw_score
  ) raw on true

  -- final score with thermal + seasonal multipliers and new bite_tier thresholds
  join lateral (
    select
      raw.flow_score,
      raw.stability_score,
      raw.thermal_score,
      raw.wind_penalty,
      raw.precip_penalty,
      -- final_score = clamp(round(raw * thermal * seasonal), 0, 100)
      greatest(0::numeric, least(100::numeric,
        round(raw.raw_score * penalties.thermal_activity_modifier * penalties.seasonal_modifier, 0)
      )) as fishability_score
  ) scored_raw on true

  join lateral (
    select
      scored_raw.flow_score,
      scored_raw.stability_score,
      scored_raw.thermal_score,
      scored_raw.wind_penalty,
      scored_raw.precip_penalty,
      scored_raw.fishability_score,
      case
        when scored_raw.fishability_score >= 82 then 'HOT'
        when scored_raw.fishability_score >= 65 then 'GOOD'
        when scored_raw.fishability_score >= 48 then 'FAIR'
        else 'TOUGH'
      end as bite_tier
  ) scored on true

  where d.id = pre.id;

  -- ── Step 2: fallback for rows still missing fishability (no weather match) ────
  update public.river_daily d
  set
    fishability_score = coalesce(
      d.fishability_score,
      greatest(0::numeric, least(100::numeric,
        round(
          greatest(0::numeric, least(100::numeric,
            (100 - abs(coalesce(d.flow_ratio, 1.0) - 1.0) * 80)::numeric
          ))
          -- thermal activity modifier
          * case
              when d.water_temp_f is null  then 0.85
              when d.water_temp_f < 38     then 0.50
              when d.water_temp_f < 42     then 0.65
              when d.water_temp_f < 46     then 0.78
              when d.water_temp_f < 52     then 0.90
              when d.water_temp_f <= 62    then 1.00
              when d.water_temp_f <= 65    then 0.90
              when d.water_temp_f <= 68    then 0.75
              when d.water_temp_f <= 72    then 0.55
              else 0.30
            end
          -- seasonal modifier
          * case extract(month from d.obs_date)
              when 1  then 0.55 when 2  then 0.55 when 3  then 0.60
              when 4  then 0.65 when 5  then 0.72 when 6  then 0.87
              when 7  then 0.92 when 8  then 0.88 when 9  then 1.00
              when 10 then 0.95 when 11 then 0.72 when 12 then 0.58
              else 1.0
            end
        , 0)
      ))
    ),
    bite_tier = coalesce(
      d.bite_tier,
      case
        when coalesce(d.fishability_score, 0) >= 82 then 'HOT'
        when coalesce(d.fishability_score, 0) >= 65 then 'GOOD'
        when coalesce(d.fishability_score, 0) >= 48 then 'FAIR'
        else 'TOUGH'
      end
    )
  where d.flow_cfs is not null
    and (p_obs_date is null or d.obs_date = p_obs_date)
    and (p_river_id is null or d.river_id = p_river_id);
end;
$$;

grant execute on function public.compute_river_daily_scores(date, uuid) to service_role;
