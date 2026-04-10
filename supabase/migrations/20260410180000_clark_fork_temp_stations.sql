-- Assign year-round temp stations for Clark Fork (river_id: 9219df3d-e432-4232-b523-a17e1f4cb4d9)
-- Previous assignments were seasonal (June–September only).
-- 12340500 (Clark Fork above Missoula) — primary, year-round live data
-- 12324200 (Clark Fork at Deer Lodge)   — backup, year-round live data

-- Step 1: deactivate all existing temp roles for Clark Fork
UPDATE public.river_usgs_map_roles
SET is_active = false
WHERE river_id = '9219df3d-e432-4232-b523-a17e1f4cb4d9'
  AND role = 'temp';

-- Step 2: ensure usgs_sites rows exist for both stations
INSERT INTO public.usgs_sites (site_no, station_name, state, lat, lon, active, has_iv, parameter_codes, source)
VALUES
  ('12340500', 'Clark Fork above Missoula MT', 'MT', 46.87676389, -113.9321194, true, true, ARRAY['00010','00060'], '{"huc":"17010204","drain_area_va":6021}'::jsonb),
  ('12324200', 'Clark Fork at Deer Lodge MT',  'MT', 46.39765,    -112.7425389, true, true, ARRAY['00010','00060'], '{"huc":"17010201","drain_area_va":1001}'::jsonb)
ON CONFLICT (site_no) DO UPDATE SET
  active = true,
  has_iv = true,
  parameter_codes = CASE WHEN '00010' = ANY(usgs_sites.parameter_codes) THEN usgs_sites.parameter_codes ELSE usgs_sites.parameter_codes || ARRAY['00010'] END,
  last_seen_at = now();

-- Step 3: insert new temp roles (upsert by unique key on river_id + site_no + role)
INSERT INTO public.river_usgs_map_roles (river_id, site_no, role, priority, is_active)
VALUES
  ('9219df3d-e432-4232-b523-a17e1f4cb4d9', '12340500', 'temp', 1, true),
  ('9219df3d-e432-4232-b523-a17e1f4cb4d9', '12324200', 'temp', 2, true)
ON CONFLICT (river_id, site_no, role)
  DO UPDATE SET priority = EXCLUDED.priority, is_active = true;
