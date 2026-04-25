-- ─────────────────────────────────────────────────────────────────────────────
-- Fix thermal_score null → 55 for rivers with no temp gauge
-- 2026-04-23
--
-- Problem: when water_temp_f is null, thermal_score was set to null which
-- caused the raw_score formula to drop the thermal component entirely
-- (coalesce to 0, weight set to 0). All no-temp rivers converged to the
-- same score (~44) regardless of flow/stability/wind differences.
--
-- Fix: thermal_score = 55 when water_temp_f is null.
-- 55 represents "temperature unknown, assume moderate" — the midpoint of
-- the typical active fishing range. This preserves the full 3-component
-- weighted average and lets flow/stability differentiate scores.
--
-- No other scoring logic changed.
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

  -- ── Step 0b: backfill change_48h_pct where null ──────────────────────────────
  update public.river_daily d
  set change_48h_pct = (
    select
      case
        when prev.flow_cfs is null or prev.flow_cfs = 0 then null
        else round(((d.flow_cfs - prev.flow_cfs) / prev.flow_cfs * 100)::numeric, 1)
      end
    from public.river_daily prev
    where prev.river_id = d.river_id
      and prev.obs_date = d.obs_date - interval '2 days'
    limit 1
  )
  where d.change_48h_pct is null
    and d.flow_cfs is not null
    and (p_obs_date is null or d.obs_date = p_obs_date)
    and (p_river_id is null or d.river_id = p_river_id);

  -- ── Step 1: compute all scores ────────────────────────────────────────────────
  update public.river_daily d
  set
    wind_am_mph       = coalesce(d.wind_am_mph, pre.wam),
    wind_pm_mph       = coalesce(d.wind_pm_mph, pre.wpm),
    change_48h_pct    = coalesce(d.change_48h_pct, pre.change_48h_pct),
    flow_score        = scored.flow_score,
    stability_score   = scored.stability_score,
    thermal_score     = scored.thermal_score,
    wind_penalty      = scored.wind_penalty,
    precip_penalty    = scored.precip_penalty,
    fishability_score = scored.fishability_score,
    bite_tier         = scored.bite_tier
  from (
    -- pre: raw inputs
    select
      rd.id,
      rd.obs_date,
      rd.river_id,
      coalesce(rd.flow_ratio, 1.0) as flow_ratio,
      coalesce(
        rd.change_48h_pct,
        (
          select
            case
              when prev.flow_cfs is null or prev.flow_cfs = 0 then null
              else round(((rd.flow_cfs - prev.flow_cfs) / prev.flow_cfs * 100)::numeric, 1)
            end
          from public.river_daily prev
          where prev.river_id = rd.river_id
            and prev.obs_date = rd.obs_date - interval '2 days'
          limit 1
        ),
        0.0
      ) as change_48h_pct,
      rd.water_temp_f,
      rd.turbidity_fnu,
      coalesce(r.is_tailwater, false) as is_tailwater,
      coalesce(w.wind_am_mph, 0)      as wam,
      coalesce(w.wind_pm_mph, 0)      as wpm,
      coalesce(w.precip_mm, 0.0)      as precip_mm,
      coalesce((
        select sum(wd2.precip_mm)
        from public.weather_daily wd2
        where wd2.river_id = rd.river_id
          and wd2.date >= rd.obs_date - interval '3 days'
          and wd2.date <= rd.obs_date
      ), 0.0) as rolling_precip_3d,
      greatest(
        coalesce(rd.wind_pm_mph, 0),
        coalesce(rd.wind_am_mph, 0),
        coalesce(w.wind_pm_mph,  0),
        coalesce(w.wind_am_mph,  0)
      ) as eff_wind,
      case
        when rd.water_temp_f is null then 55::numeric
        when rd.water_temp_f < 34    then 40::numeric
        when rd.water_temp_f <= 68   then greatest(0, least(100, round((100 - abs(rd.water_temp_f - 56) * 2.2)::numeric, 2)))
        else greatest(0, least(100, round((60 - (rd.water_temp_f - 68) * 4)::numeric, 2)))
      end as thermal_score
    from public.river_daily rd
    join public.rivers r on r.id = rd.river_id
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

  -- component scores
  join lateral (
    select
      greatest(0, least(100,
        round(
          (100 - abs(pre.flow_ratio - 1.0) * 80)
          + case when abs(pre.change_48h_pct) < 10 then 3 else 0 end
        , 2)::numeric
      )) as flow_score,
      greatest(0, least(100,
        round((100 - abs(pre.change_48h_pct) * 1.2)::numeric, 2)
      )) as stability_score
  ) scores on true

  -- penalties + modifiers
  join lateral (
    select
      -- wind penalty
      case
        when pre.eff_wind <=  8 then  0
        when pre.eff_wind <= 12 then  3
        when pre.eff_wind <= 18 then  8
        when pre.eff_wind <= 25 then 16
        when pre.eff_wind <= 35 then 25
        else                         32
      end::numeric as wind_penalty,
      -- single-day precip spike
      case
        when pre.precip_mm >= 15 then 4
        else 0
      end::numeric as precip_penalty,
      -- directional stability penalty (outside runoff cap)
      case
        when pre.change_48h_pct > 100 then 30
        when pre.change_48h_pct >  50 then 22
        when pre.change_48h_pct >  30 then 15
        when pre.change_48h_pct >  10 then  6
        when pre.change_48h_pct < -50 then 12
        when pre.change_48h_pct < -30 then  8
        when pre.change_48h_pct < -10 then  3
        else 0
      end::numeric as stability_penalty,
      -- turbidity direct measurement penalty (when available)
      case
        when pre.turbidity_fnu is null  then 0
        when pre.turbidity_fnu < 10     then 0
        when pre.turbidity_fnu <= 25    then 5
        when pre.turbidity_fnu <= 50    then 12
        else                                 20
      end::numeric as turbidity_penalty,
      -- clarity proxy scale: 1.0 normally, 0.5 when direct turbidity is available
      case when pre.turbidity_fnu is not null then 0.5 else 1.0 end::numeric as clarity_proxy_scale,
      -- runoff/clarity penalty — tailwaters skip month-based and flow-ratio
      least(30::numeric, (
        case when not pre.is_tailwater and extract(month from pre.obs_date) = 4 then 8  else 0 end +
        case when not pre.is_tailwater and extract(month from pre.obs_date) = 5 then 12 else 0 end +
        case when not pre.is_tailwater and extract(month from pre.obs_date) = 6 then 5  else 0 end +
        case when not pre.is_tailwater and pre.flow_ratio > 1.5
          then round(8 * (case when pre.turbidity_fnu is not null then 0.5 else 1.0 end), 0) else 0 end +
        case when not pre.is_tailwater and pre.flow_ratio > 2.0
          then round(5 * (case when pre.turbidity_fnu is not null then 0.5 else 1.0 end), 0) else 0 end +
        case when pre.rolling_precip_3d >= 20
          then round(10 * (case when pre.turbidity_fnu is not null then 0.5 else 1.0 end), 0) else 0 end +
        case when pre.rolling_precip_3d >= 10
          then round(6  * (case when pre.turbidity_fnu is not null then 0.5 else 1.0 end), 0) else 0 end +
        case when pre.rolling_precip_3d >=  5
          then round(3  * (case when pre.turbidity_fnu is not null then 0.5 else 1.0 end), 0) else 0 end +
        case when pre.precip_mm >= 15
          then round(4  * (case when pre.turbidity_fnu is not null then 0.5 else 1.0 end), 0) else 0 end
      )::numeric) as runoff_penalty,
      -- seasonal modifier
      case
        when pre.is_tailwater then
          case extract(month from pre.obs_date)
            when 4 then 0.82 when 5 then 0.82 when 6 then 0.90
            when 7 then 0.95 when 8 then 0.95 when 9 then 1.00
            when 10 then 0.98 else 0.70
          end
        else
          case extract(month from pre.obs_date)
            when 1  then 0.55 when 2  then 0.55 when 3  then 0.60
            when 4  then 0.65 when 5  then 0.72 when 6  then 0.87
            when 7  then 0.92 when 8  then 0.88 when 9  then 1.00
            when 10 then 0.95 when 11 then 0.72 when 12 then 0.58
            else 1.0
          end
      end::numeric as seasonal_modifier,
      -- thermal activity modifier
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

  -- raw score
  join lateral (
    select
      scores.flow_score,
      scores.stability_score,
      pre.thermal_score,
      penalties.wind_penalty,
      penalties.precip_penalty,
      greatest(0::numeric, least(100::numeric,
        (
          scores.flow_score        * 0.45
          + scores.stability_score * 0.25
          + coalesce(pre.thermal_score, 0) * (case when pre.thermal_score is null then 0 else 0.30 end)
        )
        / nullif(0.45 + 0.25 + (case when pre.thermal_score is null then 0 else 0.30 end), 0)
        - penalties.wind_penalty
        - penalties.precip_penalty
        - penalties.runoff_penalty
        - penalties.stability_penalty
        - penalties.turbidity_penalty
      )) as raw_score
  ) raw on true

  -- final score
  join lateral (
    select
      raw.flow_score,
      raw.stability_score,
      raw.thermal_score,
      raw.wind_penalty,
      raw.precip_penalty,
      greatest(0::numeric, least(100::numeric,
        round(raw.raw_score * penalties.thermal_activity_modifier * penalties.seasonal_modifier, 0)
      )) as fishability_score
  ) scored_raw on true

  -- bite tier
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

  -- ── Step 2: fallback for rows with no weather match ──────────────────────────
  update public.river_daily d
  set
    fishability_score = coalesce(
      d.fishability_score,
      greatest(0::numeric, least(100::numeric,
        round(
          greatest(0::numeric, least(100::numeric,
            (100 - abs(coalesce(d.flow_ratio, 1.0) - 1.0) * 80)::numeric
            + case when abs(coalesce(d.change_48h_pct, 0.0)) < 10 then 3 else 0 end
          ))
          - case
              when coalesce(d.change_48h_pct, 0) > 100 then 30
              when coalesce(d.change_48h_pct, 0) >  50 then 22
              when coalesce(d.change_48h_pct, 0) >  30 then 15
              when coalesce(d.change_48h_pct, 0) >  10 then  6
              when coalesce(d.change_48h_pct, 0) < -50 then 12
              when coalesce(d.change_48h_pct, 0) < -30 then  8
              when coalesce(d.change_48h_pct, 0) < -10 then  3
              else 0
            end
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
          * case
              when coalesce(r.is_tailwater, false) then
                case extract(month from d.obs_date)
                  when 4 then 0.82 when 5 then 0.82 when 6 then 0.90
                  when 7 then 0.95 when 8 then 0.95 when 9 then 1.00
                  when 10 then 0.98 else 0.70
                end
              else
                case extract(month from d.obs_date)
                  when 1 then 0.55 when 2 then 0.55 when 3 then 0.60
                  when 4 then 0.65 when 5 then 0.72 when 6 then 0.87
                  when 7 then 0.92 when 8 then 0.88 when 9 then 1.00
                  when 10 then 0.95 when 11 then 0.72 when 12 then 0.58
                  else 1.0
                end
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
  from public.rivers r
  where d.river_id = r.id
    and d.flow_cfs is not null
    and (p_obs_date is null or d.obs_date = p_obs_date)
    and (p_river_id is null or d.river_id = p_river_id);
end;
$$;

grant execute on function public.compute_river_daily_scores(date, uuid) to service_role;
