-- Weather ingestion + scoring hardening
-- Ensures fishability_score is always computed when flow exists.

create table if not exists public.weather_daily (
  river_id uuid not null references public.rivers(id) on delete cascade,
  date date not null,
  wind_am_mph numeric,
  wind_pm_mph numeric,
  air_temp_high numeric,
  precip_mm numeric,
  created_at timestamptz not null default now(),
  primary key (river_id, date)
);

create index if not exists idx_weather_daily_date on public.weather_daily (date desc);
create index if not exists idx_weather_daily_river_date on public.weather_daily (river_id, date desc);

alter table public.weather_daily enable row level security;
drop policy if exists "Allow public read weather_daily" on public.weather_daily;
create policy "Allow public read weather_daily"
  on public.weather_daily for select
  using (true);

alter table if exists public.river_daily add column if not exists flow_score numeric;
alter table if exists public.river_daily add column if not exists stability_score numeric;
alter table if exists public.river_daily add column if not exists thermal_score numeric;
alter table if exists public.river_daily add column if not exists wind_penalty numeric;
alter table if exists public.river_daily add column if not exists precip_penalty numeric;

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
  update public.river_daily d
  set
    wind_am_mph = coalesce(d.wind_am_mph, w.wind_am_mph),
    wind_pm_mph = coalesce(d.wind_pm_mph, w.wind_pm_mph),
    flow_score = score.flow_score,
    stability_score = score.stability_score,
    thermal_score = score.thermal_score,
    wind_penalty = score.wind_penalty,
    precip_penalty = score.precip_penalty,
    fishability_score = score.fishability_score,
    bite_tier = score.bite_tier
  from lateral (
    select
      wd.wind_am_mph,
      wd.wind_pm_mph,
      wd.precip_mm
    from public.weather_daily wd
    where wd.river_id = d.river_id
      and wd.date = d.obs_date
    limit 1
  ) w
  cross join lateral (
    select
      coalesce(d.flow_ratio, 1.0) as ratio,
      coalesce(d.change_48h_pct, 0.0) as chg,
      coalesce(d.water_temp_f, 56.0) as tmp,
      coalesce(d.wind_pm_mph, d.wind_am_mph, w.wind_pm_mph, w.wind_am_mph, 0.0) as wind,
      coalesce(w.precip_mm, 0.0) as precip
  ) base
  cross join lateral (
    select
      greatest(0, least(100, round((100 - abs(base.ratio - 1.0) * 80)::numeric, 2))) as flow_score,
      greatest(0, least(100, round((100 - abs(base.chg) * 1.2)::numeric, 2))) as stability_score,
      case
        when d.water_temp_f is null then 65
        when base.tmp < 34 then 40
        when base.tmp <= 68 then greatest(0, least(100, round((100 - abs(base.tmp - 56) * 2.2)::numeric, 2)))
        else greatest(0, least(100, round((60 - (base.tmp - 68) * 4)::numeric, 2)))
      end as thermal_score,
      case
        when base.wind <= 8 then 0
        when base.wind <= 15 then 5
        when base.wind <= 22 then 12
        else 20
      end::numeric as wind_penalty,
      case
        when base.precip >= 12 then 15
        when base.precip >= 6 then 8
        when base.precip >= 2 then 3
        else 0
      end::numeric as precip_penalty
  ) parts
  cross join lateral (
    select
      greatest(
        0,
        least(
          100,
          round((parts.flow_score * 0.45 + parts.stability_score * 0.25 + parts.thermal_score * 0.30 - parts.wind_penalty - parts.precip_penalty)::numeric, 0)
        )
      ) as fishability_score,
      parts.flow_score,
      parts.stability_score,
      parts.thermal_score,
      parts.wind_penalty,
      parts.precip_penalty,
      case
        when d.flow_cfs is null then null
        when round((parts.flow_score * 0.45 + parts.stability_score * 0.25 + parts.thermal_score * 0.30 - parts.wind_penalty - parts.precip_penalty)::numeric, 0) >= 85 then 'HOT'
        when round((parts.flow_score * 0.45 + parts.stability_score * 0.25 + parts.thermal_score * 0.30 - parts.wind_penalty - parts.precip_penalty)::numeric, 0) >= 70 then 'GOOD'
        when round((parts.flow_score * 0.45 + parts.stability_score * 0.25 + parts.thermal_score * 0.30 - parts.wind_penalty - parts.precip_penalty)::numeric, 0) >= 55 then 'FAIR'
        else 'TOUGH'
      end as bite_tier
  ) score
  where d.flow_cfs is not null
    and (p_obs_date is null or d.obs_date = p_obs_date)
    and (p_river_id is null or d.river_id = p_river_id);

  -- Guarantee non-null fishability score for any row that has flow
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
    and (p_obs_date is null or d.obs_date = p_obs_date)
    and (p_river_id is null or d.river_id = p_river_id);
end;
$$;

grant execute on function public.compute_river_daily_scores(date, uuid) to anon, authenticated, service_role;

create or replace function public.refresh_river_daily_metrics(
  p_obs_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_river_daily_metrics(null::uuid, p_obs_date);
  perform public.compute_river_daily_scores(p_obs_date, null::uuid);
end;
$$;

grant execute on function public.refresh_river_daily_metrics(date) to anon, authenticated, service_role;

create or replace view public.v_river_latest as
with latest_daily as (
  select distinct on (d.river_id)
    d.river_id,
    d.obs_date,
    d.flow_cfs,
    d.water_temp_f,
    d.gage_height_ft,
    d.wind_am_mph,
    d.wind_pm_mph,
    d.median_flow_cfs,
    d.flow_ratio,
    d.change_48h_pct,
    d.flow_score,
    d.stability_score,
    d.thermal_score,
    d.wind_penalty,
    d.precip_penalty,
    d.fishability_score,
    d.bite_tier,
    d.source_flow_observed_at,
    d.source_temp_observed_at,
    d.source_parameter_codes,
    d.updated_at
  from public.river_daily d
  order by d.river_id, d.obs_date desc
),
legacy_scores as (
  select distinct on (coalesce(r.id::text, s.river_id::text))
    r.id as river_id,
    s.date,
    coalesce((to_jsonb(s)->>'fishability_score_calc')::numeric, s.fishability_score) as legacy_fishability,
    s.bite_tier
  from public.river_daily_scores s
  left join public.rivers r
    on r.id::text = s.river_id::text
    or r.slug = s.river_id::text
  order by coalesce(r.id::text, s.river_id::text), s.date desc
)
select
  r.id as river_id,
  r.slug,
  coalesce(r.river_name, r.slug) as river_name,
  r.gauge_label,
  r.usgs_site_no,
  r.latitude,
  r.longitude,
  ld.obs_date as date,
  ld.flow_cfs,
  ld.water_temp_f,
  ld.wind_am_mph,
  ld.wind_pm_mph,
  ld.median_flow_cfs,
  ld.flow_ratio as flow_ratio_calc,
  ld.change_48h_pct as change_48h_pct_calc,
  ld.flow_score,
  ld.stability_score,
  ld.thermal_score,
  ld.wind_penalty,
  coalesce(
    ld.fishability_score,
    ls.legacy_fishability,
    case
      when ld.flow_cfs is null then null
      else greatest(0, least(100, round((100 - abs(coalesce(ld.flow_ratio, 1.0) - 1.0) * 80)::numeric, 0)))
    end
  ) as fishability_score_calc,
  coalesce(ld.bite_tier, ls.bite_tier) as bite_tier,
  ld.source_flow_observed_at,
  ld.source_temp_observed_at,
  ld.source_parameter_codes,
  ld.updated_at
from public.rivers r
left join latest_daily ld on ld.river_id = r.id
left join legacy_scores ls on ls.river_id = r.id
where r.is_active = true;
