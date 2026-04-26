-- ─────────────────────────────────────────────────────────────────────────────
-- Strip stray eastern components from SF Boise River geometry
-- 2026-04-26
--
-- Problem: sf-boise-featherville geometry has 73 NHD components east of
-- lon=-115.0 (lon range -115.00 to -114.89, lat 43.64-43.71). This area
-- is the Pioneer Mountains / Big Smoky Creek drainage — NOT the SF Boise
-- watershed. The SF Boise flows from near Atlanta, ID (lon≈-115.12) westward.
-- These stray components were likely included because the NHD bbox used for
-- fetching overlapped with the Big Wood / Pioneer Mountains drainage.
--
-- Also confirmed: boise-river-boise has NO stray segments. Its geometry
-- (lon=-116.75 to -115.83, lat=43.52-43.70) correctly covers the Boise
-- River corridor from Lucky Peak Dam to Caldwell. No Snake River mainstem
-- segments were captured.
--
-- Fix: Rebuild sf-boise geometry keeping only components with max_lon < -115.0.
-- Before: 200 components, max_lon=-114.893
-- After: 127 components, max_lon≈-115.0
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.river_geometries rg
SET
  geom = filtered.clean_geom,
  updated_at = now()
FROM (
  SELECT
    rg2.river_id,
    ST_Multi(
      ST_Collect(ST_GeometryN(rg2.geom, gs.n))
    ) AS clean_geom
  FROM public.river_geometries rg2
  CROSS JOIN generate_series(1, ST_NumGeometries(rg2.geom)) AS gs(n)
  WHERE rg2.river_id = (SELECT id FROM rivers WHERE slug = 'sf-boise-featherville')
    AND ST_XMax(ST_GeometryN(rg2.geom, gs.n)) < -115.0
  GROUP BY rg2.river_id
) filtered
WHERE rg.river_id = filtered.river_id;

-- Verify
DO $$
DECLARE
  v_npts int;
  v_max_lon float;
  v_min_lon float;
  v_num_geom int;
BEGIN
  SELECT
    ST_NPoints(geom),
    ST_XMax(geom),
    ST_XMin(geom),
    ST_NumGeometries(geom)
  INTO v_npts, v_max_lon, v_min_lon, v_num_geom
  FROM public.river_geometries rg
  JOIN public.rivers r ON r.id = rg.river_id
  WHERE r.slug = 'sf-boise-featherville';

  RAISE NOTICE 'SF Boise after cleanup: % pts, % components, lon % to %',
    v_npts, v_num_geom, round(v_min_lon::numeric,4), round(v_max_lon::numeric,4);

  IF v_max_lon > -115.0 THEN
    RAISE EXCEPTION 'Cleanup failed: max_lon=% still east of -115.0', v_max_lon;
  END IF;
END;
$$;
