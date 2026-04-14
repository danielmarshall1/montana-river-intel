-- ─────────────────────────────────────────────────────────────────────────────
-- Add coordinate_confidence to fishing_access_sites
--
-- Distinct from river_confidence (which records certainty of river association).
-- coordinate_confidence reflects positional accuracy of lat/lng:
--   high     → verified against satellite imagery or FWP survey (<50m error)
--   moderate → spatial join result, 300-500m possible error (default)
--   low      → coarse geocode or manual estimate, >500m possible error
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.fishing_access_sites
  add column if not exists coordinate_confidence text
  default 'moderate'
  check (coordinate_confidence in ('high', 'moderate', 'low'));

comment on column public.fishing_access_sites.coordinate_confidence is
  'Positional accuracy of lat/lng. high=verified <50m, moderate=spatial join 300-500m, low=coarse estimate >500m.';

-- Backfill from river_confidence where it captures the same meaning
update public.fishing_access_sites
set coordinate_confidence = river_confidence
where river_confidence in ('high', 'moderate', 'low')
  and coordinate_confidence is null;
