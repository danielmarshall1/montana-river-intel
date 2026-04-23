-- ─────────────────────────────────────────────────────────────────────────────
-- Priority 3: Seed usgs_sites catalog for Idaho and Wyoming gauges
-- 2026-04-23
--
-- The usgs_sites table previously only had Montana entries (527 rows).
-- All ID/WY gauges used in river_usgs_map_roles were missing, causing:
--   - flow_station_name null for all ID/WY rivers in audit queries
--   - flow_name_check always MISMATCH (no gauge metadata to validate against)
--
-- Fetched from USGS site service (?siteOutput=expanded) for all 25 site_nos
-- used in active ID/WY river_usgs_map_roles entries.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.usgs_sites
  (site_no, station_name, state, lat, lon, active)
VALUES
  ('06208500', 'Clarks Fork Yellowstone River at Edgar MT', 'MT', '45.46571389'::numeric, '-108.8441056'::numeric, true),
  ('06228000', 'WIND RIVER AT RIVERTON, WY', 'WY', '43.01051478'::numeric, '-108.3767701'::numeric, true),
  ('06274300', 'BIGHORN RIVER AT BASIN, WY', 'WY', '44.3832545'::numeric, '-108.0362688'::numeric, true),
  ('06279940', 'NORTH FORK SHOSHONE RIVER AT WAPITI, WY', 'WY', '44.4714444'::numeric, '-109.4183528'::numeric, true),
  ('06630000', 'N PLATTE RIV AB SEMINOE RESERVOIR, NR SINCLAIR, WY', 'WY', '41.87216636'::numeric, '-107.0575984'::numeric, true),
  ('06660000', 'LARAMIE RIVER AT LARAMIE, WY', 'WY', '41.32777778'::numeric, '-105.6074167'::numeric, true),
  ('09211200', 'GREEN RIVER BELOW FONTENELLE RESERVOIR, WY', 'WY', '42.0209722'::numeric, '-110.0498056'::numeric, true),
  ('13010065', 'SNAKE RIVER AB JACKSON LAKE AT FLAGG RANCH WY', 'WY', '44.09888889'::numeric, '-110.6675'::numeric, true),
  ('13011500', 'PACIFIC CREEK AT MORAN, WY', 'WY', '43.8510187'::numeric, '-110.5171751'::numeric, true),
  ('13014500', 'GROS VENTRE RIVER AT KELLY, WY', 'WY', '43.62088889'::numeric, '-110.6230556'::numeric, true),
  ('13018750', 'SNAKE RIVER BELOW FLAT CREEK, NEAR JACKSON, WY', 'WY', '43.3722222'::numeric, '-110.7386111'::numeric, true),
  ('13022500', 'SNAKE RIVER ABOVE RESERVOIR, NEAR ALPINE, WY', 'WY', '43.1961111'::numeric, '-110.8894444'::numeric, true),
  ('13032500', 'SNAKE RIVER NR IRWIN ID', 'ID', '43.3508333'::numeric, '-111.2188889'::numeric, true),
  ('13046000', 'HENRYS FORK NR ASHTON ID', 'ID', '44.0697222'::numeric, '-111.5105556'::numeric, true),
  ('13055000', 'TETON RIVER NR ST ANTHONY ID', 'ID', '43.9272222'::numeric, '-111.6138889'::numeric, true),
  ('13139510', 'BIG WOOD RIVER AT HAILEY ID TOTAL FLOW', 'ID', '43.5172222'::numeric, '-114.3216667'::numeric, true),
  ('13150430', 'SILVER CREEK AT SPORTSMAN ACCESS NR PICABO ID', 'ID', '43.3233611'::numeric, '-114.10835'::numeric, true),
  ('13185000', 'BOISE RIVER NR TWIN SPRINGS ID', 'ID', '43.66805556'::numeric, '-115.7252778'::numeric, true),
  ('13206000', 'BOISE RIVER AT GLENWOOD BRIDGE NR BOISE ID', 'ID', '43.66055556'::numeric, '-116.2791667'::numeric, true),
  ('13295000', 'VALLEY CREEK AT STANLEY ID', 'ID', '44.2225'::numeric, '-114.931111'::numeric, true),
  ('13302500', 'SALMON RIVER AT SALMON ID', 'ID', '45.1836111'::numeric, '-113.8952778'::numeric, true),
  ('13337000', 'LOCHSA RIVER NR LOWELL ID', 'ID', '46.1508333'::numeric, '-115.5872222'::numeric, true),
  ('13340000', 'CLEARWATER RIVER AT OROFINO ID', 'ID', '46.4783333'::numeric, '-116.2575'::numeric, true),
  ('13341050', 'CLEARWATER RIVER NR PECK ID', 'ID', '46.50027778'::numeric, '-116.3925'::numeric, true),
  ('13342500', 'CLEARWATER RIVER AT SPALDING ID', 'ID', '46.4483333'::numeric, '-116.8275'::numeric, true)
ON CONFLICT (site_no) DO UPDATE
  SET station_name = EXCLUDED.station_name,
      state        = EXCLUDED.state,
      lat          = EXCLUDED.lat,
      lon          = EXCLUDED.lon,
      active       = true;
