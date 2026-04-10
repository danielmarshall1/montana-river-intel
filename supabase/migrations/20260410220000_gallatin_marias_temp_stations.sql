-- Assign year-round temp stations for Gallatin and Marias rivers.
-- Both rivers had flow stations without 00010 capability.
--
-- Gallatin River (slug: gallatin-gateway)
--   06043120 — Gallatin River above Deer Creek, near Big Sky, MT
--   Live IV temp: 8.6°C as of 2026-04-10. Closest station to the canyon fishery.
--
-- Marias River (slug: marias-chester)
--   06101630 — Marias River at Highway 223 bridge near Chester, MT
--   Live IV temp: 10.9°C as of 2026-04-10. Adjacent to existing flow gauge 06101500.
--
-- Bitterroot River: 12344000 and 12352500 both returning -999999 as of 2026-04-10.
--   No live IV temp available — temp will remain NULL until sensor comes back online.

-- ── Gallatin ──────────────────────────────────────────────────────────────────
-- Get river_id for gallatin-gateway
DO $$
DECLARE
  v_gallatin_id uuid;
  v_marias_id   uuid;
BEGIN
  SELECT id INTO v_gallatin_id FROM public.rivers WHERE slug = 'gallatin-gateway';
  SELECT id INTO v_marias_id   FROM public.rivers WHERE slug = 'marias-chester';

  -- Gallatin: deactivate any existing temp roles
  UPDATE public.river_usgs_map_roles
  SET is_active = false
  WHERE river_id = v_gallatin_id AND role = 'temp';

  -- Gallatin: insert 06043120 as primary temp station
  INSERT INTO public.usgs_sites (site_no, station_name, state, lat, lon, active, has_iv, parameter_codes, source)
  VALUES ('06043120', 'Gallatin River above Deer Creek, near Big Sky, MT', 'MT', 45.28527778, -111.4016667, true, true, ARRAY['00010','00060'], '{}'::jsonb)
  ON CONFLICT (site_no) DO UPDATE SET active = true, has_iv = true,
    parameter_codes = CASE WHEN '00010' = ANY(usgs_sites.parameter_codes) THEN usgs_sites.parameter_codes ELSE usgs_sites.parameter_codes || ARRAY['00010'] END,
    last_seen_at = now();

  INSERT INTO public.river_usgs_map_roles (river_id, site_no, role, priority, is_active, notes)
  VALUES (v_gallatin_id, '06043120', 'temp', 1, true, 'Gallatin above Deer Creek near Big Sky — year-round IV temp')
  ON CONFLICT (river_id, site_no, role) DO UPDATE SET is_active = true, priority = 1;

  -- ── Marias ────────────────────────────────────────────────────────────────
  -- Marias: deactivate any existing temp roles
  UPDATE public.river_usgs_map_roles
  SET is_active = false
  WHERE river_id = v_marias_id AND role = 'temp';

  -- Marias: insert 06101630 as primary temp station
  INSERT INTO public.usgs_sites (site_no, station_name, state, lat, lon, active, has_iv, parameter_codes, source)
  VALUES ('06101630', 'Marias River at Highway 223 bridge near Chester,MT', 'MT', 48.51527778, -110.9747222, true, true, ARRAY['00010','00060'], '{}'::jsonb)
  ON CONFLICT (site_no) DO UPDATE SET active = true, has_iv = true,
    parameter_codes = CASE WHEN '00010' = ANY(usgs_sites.parameter_codes) THEN usgs_sites.parameter_codes ELSE usgs_sites.parameter_codes || ARRAY['00010'] END,
    last_seen_at = now();

  INSERT INTO public.river_usgs_map_roles (river_id, site_no, role, priority, is_active, notes)
  VALUES (v_marias_id, '06101630', 'temp', 1, true, 'Marias at Hwy 223 near Chester — year-round IV temp, adjacent to flow gauge')
  ON CONFLICT (river_id, site_no, role) DO UPDATE SET is_active = true, priority = 1;

  RAISE NOTICE 'Gallatin temp station 06043120 and Marias temp station 06101630 assigned.';
END $$;
