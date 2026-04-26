-- ─────────────────────────────────────────────────────────────────────────────
-- Clear stale geom_simplified for SF Snake River
-- 2026-04-26
--
-- Root cause: get_river_geojson() prefers geom_simplified over geom when
-- geom_simplified is not null. Migration 20260426120000 updated geom with
-- the correct Swan Valley corridor geometry but left geom_simplified holding
-- the old stale geometry (lat 43.32–43.70, lon -111.80–-111.19) which
-- extended into the agricultural flatlands near Rigby/Rexburg.
--
-- Fix: set geom_simplified = NULL so the RPC falls through to the correct geom.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.river_geometries
SET geom_simplified = NULL
WHERE river_id = (SELECT id FROM public.rivers WHERE slug = 'sf-snake-palisades');

-- Verify: geom_simplified must now be null, geom must be in Swan Valley
DO $$
DECLARE
  v_simplified_null bool;
  v_centroid_lat    float;
  v_centroid_lon    float;
BEGIN
  SELECT
    geom_simplified IS NULL,
    ST_Y(ST_Centroid(geom)),
    ST_X(ST_Centroid(geom))
  INTO v_simplified_null, v_centroid_lat, v_centroid_lon
  FROM public.river_geometries
  WHERE river_id = (SELECT id FROM public.rivers WHERE slug = 'sf-snake-palisades');

  RAISE NOTICE 'SF Snake: geom_simplified null=%, geom centroid (%, %)',
    v_simplified_null,
    round(v_centroid_lat::numeric, 4),
    round(v_centroid_lon::numeric, 4);

  IF NOT v_simplified_null THEN
    RAISE EXCEPTION 'geom_simplified still set — clear failed';
  END IF;
  IF v_centroid_lat < 43.3 OR v_centroid_lat > 43.6 THEN
    RAISE EXCEPTION 'geom centroid lat=% outside Swan Valley range', v_centroid_lat;
  END IF;
  IF v_centroid_lon < -111.75 OR v_centroid_lon > -111.15 THEN
    RAISE EXCEPTION 'geom centroid lon=% outside Swan Valley range', v_centroid_lon;
  END IF;
END;
$$;
