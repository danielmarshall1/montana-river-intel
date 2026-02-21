-- Decouple flow/temp source mapping and auto-select best temp-capable station per river.
-- Additive + safe to rerun.

alter table if exists public.river_usgs_map
  alter column temp_site_no drop not null;

create table if not exists public.river_temp_site_rankings (
  river_id uuid not null references public.rivers(id) on delete cascade,
  site_no text not null,
  station_name text,
  on_river_alignment boolean not null default false,
  distance_to_river_m numeric,
  is_active boolean not null default true,
  has_temp boolean not null default false,
  rank_score numeric not null default 0,
  candidate_rank integer not null,
  evaluated_at timestamptz not null default now(),
  primary key (river_id, site_no)
);

create index if not exists idx_river_temp_site_rankings_rank
  on public.river_temp_site_rankings (river_id, candidate_rank);

create index if not exists idx_river_temp_site_rankings_score
  on public.river_temp_site_rankings (river_id, rank_score desc);

alter table public.river_temp_site_rankings enable row level security;
drop policy if exists "Allow public read river_temp_site_rankings" on public.river_temp_site_rankings;
create policy "Allow public read river_temp_site_rankings"
  on public.river_temp_site_rankings for select
  using (true);

create or replace function public.refresh_river_temp_site_rankings(
  p_river_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.river_temp_site_rankings rts
  where p_river_id is null or rts.river_id = p_river_id;

  with river_scope as (
    select
      r.id as river_id,
      r.slug,
      coalesce(r.river_name, r.slug, r.id::text) as river_name,
      rg.geom
    from public.rivers r
    join public.river_geometries rg
      on rg.river_id::text = r.id::text
      or (r.slug is not null and rg.river_id::text = r.slug)
    where rg.geom is not null
      and (p_river_id is null or r.id = p_river_id)
  ),
  candidates as (
    select
      rs.river_id,
      s.site_no,
      s.station_name,
      coalesce(s.is_active, true) as is_active,
      coalesce(s.has_temp, false) as has_temp,
      st_dwithin(
        st_setsrid(st_makepoint(s.longitude, s.latitude), 4326)::geography,
        rs.geom::geography,
        150
      ) as on_river_alignment,
      st_distance(
        st_setsrid(st_makepoint(s.longitude, s.latitude), 4326)::geography,
        rs.geom::geography
      )::numeric as distance_to_river_m,
      (
        lower(coalesce(s.station_name, '')) like
        '%' || split_part(lower(rs.river_name), ' ', 1) || '%'
      ) as name_match
    from river_scope rs
    join public.usgs_station_registry s
      on s.river_id = rs.river_id::text
     and coalesce(s.has_temp, false) = true
    where s.latitude is not null
      and s.longitude is not null
      and s.latitude between -90 and 90
      and s.longitude between -180 and 180
  ),
  scored as (
    select
      c.*,
      (
        (case when c.on_river_alignment then 100 else 0 end) +
        (case when c.is_active then 20 else 0 end) +
        (case when c.name_match then 8 else 0 end) +
        greatest(0, 30 - least(c.distance_to_river_m, 3000) / 100.0)
      )::numeric as rank_score
    from candidates c
  ),
  ranked as (
    select
      s.river_id,
      s.site_no,
      s.station_name,
      s.on_river_alignment,
      s.distance_to_river_m,
      s.is_active,
      s.has_temp,
      s.rank_score,
      row_number() over (
        partition by s.river_id
        order by
          s.on_river_alignment desc,
          s.distance_to_river_m asc nulls last,
          s.is_active desc,
          s.rank_score desc,
          s.site_no asc
      ) as candidate_rank
    from scored s
  )
  insert into public.river_temp_site_rankings (
    river_id,
    site_no,
    station_name,
    on_river_alignment,
    distance_to_river_m,
    is_active,
    has_temp,
    rank_score,
    candidate_rank,
    evaluated_at
  )
  select
    r.river_id,
    r.site_no,
    r.station_name,
    r.on_river_alignment,
    r.distance_to_river_m,
    r.is_active,
    r.has_temp,
    r.rank_score,
    r.candidate_rank,
    now()
  from ranked r;
end;
$$;

create or replace function public.apply_best_temp_site_map(
  p_river_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.river_usgs_map (river_id, flow_site_no, temp_site_no, stage_site_no)
  select
    r.id,
    r.usgs_site_no,
    null,
    r.usgs_site_no
  from public.rivers r
  where r.usgs_site_no is not null
    and (p_river_id is null or r.id = p_river_id)
  on conflict (river_id) do nothing;

  update public.river_usgs_map m
  set
    temp_site_no = best.site_no,
    updated_at = now()
  from (
    select river_id, site_no
    from public.river_temp_site_rankings
    where candidate_rank = 1
      and (p_river_id is null or river_id = p_river_id)
  ) best
  where m.river_id = best.river_id;

  -- Explicitly clear temp mapping when no same-river temp candidate exists.
  update public.river_usgs_map m
  set
    temp_site_no = null,
    updated_at = now()
  where (p_river_id is null or m.river_id = p_river_id)
    and not exists (
      select 1
      from public.river_temp_site_rankings rts
      where rts.river_id = m.river_id
        and rts.candidate_rank = 1
    );
end;
$$;

grant execute on function public.refresh_river_temp_site_rankings(uuid) to anon, authenticated, service_role;
grant execute on function public.apply_best_temp_site_map(uuid) to anon, authenticated, service_role;

create or replace view public.v_river_temp_station_selection as
select
  r.id as river_id,
  coalesce(r.river_name, r.slug, r.id::text) as river_name,
  m.flow_site_no,
  m.temp_site_no as selected_temp_site_no,
  ranker.site_no as top_ranked_temp_site_no,
  ranker.station_name as top_ranked_station_name,
  ranker.on_river_alignment,
  ranker.distance_to_river_m,
  ranker.rank_score,
  ranker.evaluated_at
from public.rivers r
left join public.river_usgs_map m on m.river_id = r.id
left join public.river_temp_site_rankings ranker
  on ranker.river_id = r.id
 and ranker.candidate_rank = 1;

grant select on public.river_temp_site_rankings to anon, authenticated, service_role;
grant select on public.v_river_temp_station_selection to anon, authenticated, service_role;

-- Recompute scoring so missing temp does not penalize until temp mapping is complete.
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
      d.water_temp_f as tmp,
      coalesce(d.wind_pm_mph, d.wind_am_mph, w.wind_pm_mph, w.wind_am_mph, 0.0) as wind,
      coalesce(w.precip_mm, 0.0) as precip
  ) base
  cross join lateral (
    select
      greatest(0, least(100, round((100 - abs(base.ratio - 1.0) * 80)::numeric, 2))) as flow_score,
      greatest(0, least(100, round((100 - abs(base.chg) * 1.2)::numeric, 2))) as stability_score,
      case
        when d.water_temp_f is null then null
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
      (
        parts.flow_score * 0.45 +
        parts.stability_score * 0.25 +
        coalesce(parts.thermal_score, 0) * (case when parts.thermal_score is null then 0 else 0.30 end)
      ) as weighted_sum,
      (
        0.45 + 0.25 + (case when parts.thermal_score is null then 0 else 0.30 end)
      ) as weighted_den
  ) wsum
  cross join lateral (
    select
      greatest(
        0,
        least(
          100,
          round((((wsum.weighted_sum / nullif(wsum.weighted_den, 0)) - parts.wind_penalty - parts.precip_penalty))::numeric, 0)
        )
      ) as fishability_score,
      parts.flow_score,
      parts.stability_score,
      parts.thermal_score,
      parts.wind_penalty,
      parts.precip_penalty
  ) raw
  cross join lateral (
    select
      raw.fishability_score,
      raw.flow_score,
      raw.stability_score,
      raw.thermal_score,
      raw.wind_penalty,
      raw.precip_penalty,
      case
        when d.flow_cfs is null then null
        when raw.fishability_score >= 85 then 'HOT'
        when raw.fishability_score >= 70 then 'GOOD'
        when raw.fishability_score >= 55 then 'FAIR'
        else 'TOUGH'
      end as bite_tier
  ) score
  where d.flow_cfs is not null
    and (p_obs_date is null or d.obs_date = p_obs_date)
    and (p_river_id is null or d.river_id = p_river_id);

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

