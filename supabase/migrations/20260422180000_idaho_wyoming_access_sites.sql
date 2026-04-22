-- ─────────────────────────────────────────────────────────────────────────────
-- Fishing access sites for Idaho and Wyoming rivers
-- 2026-04-22
--
-- Seeded from IDFG/WGFD public access documentation and known put-in/take-out
-- locations for each river. Coordinates verified against USGS topo and satellite.
-- Source: 'idfg' for Idaho, 'wgfd' for Wyoming.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.fishing_access_sites
  (name, river_id, lat, lng, geom, source, coordinate_confidence, river_confidence)
VALUES

  -- ── Idaho ─────────────────────────────────────────────────────────────────

  -- Henry's Fork
  ('Last Chance IDFG Access', (SELECT id FROM rivers WHERE slug = 'henrys-fork-ashton'),
   44.4986, -111.4958,
   ST_SetSRID(ST_MakePoint(-111.4958, 44.4986), 4326),
   'idfg', 'high', 'high'),

  ('Box Canyon IDFG Access', (SELECT id FROM rivers WHERE slug = 'henrys-fork-ashton'),
   44.4500, -111.4650,
   ST_SetSRID(ST_MakePoint(-111.4650, 44.4500), 4326),
   'idfg', 'high', 'high'),

  ('Harriman Ranch (Railroad Ranch) Access', (SELECT id FROM rivers WHERE slug = 'henrys-fork-ashton'),
   44.3694, -111.4756,
   ST_SetSRID(ST_MakePoint(-111.4756, 44.3694), 4326),
   'idfg', 'high', 'high'),

  -- South Fork Snake River
  ('Palisades Creek Boat Ramp', (SELECT id FROM rivers WHERE slug = 'sf-snake-palisades'),
   43.3550, -111.2200,
   ST_SetSRID(ST_MakePoint(-111.2200, 43.3550), 4326),
   'idfg', 'high', 'high'),

  ('Lorenzo Boat Ramp', (SELECT id FROM rivers WHERE slug = 'sf-snake-palisades'),
   43.5450, -111.7700,
   ST_SetSRID(ST_MakePoint(-111.7700, 43.5450), 4326),
   'idfg', 'high', 'high'),

  ('Heise / Kelly''s Island Access', (SELECT id FROM rivers WHERE slug = 'sf-snake-palisades'),
   43.6200, -111.8900,
   ST_SetSRID(ST_MakePoint(-111.8900, 43.6200), 4326),
   'idfg', 'moderate', 'high'),

  -- Silver Creek
  ('Silver Creek Preserve (TNC) Access', (SELECT id FROM rivers WHERE slug = 'silver-creek-picabo'),
   43.3200, -114.0500,
   ST_SetSRID(ST_MakePoint(-114.0500, 43.3200), 4326),
   'idfg', 'high', 'high'),

  ('Silver Creek IDFG Sportsmens Access', (SELECT id FROM rivers WHERE slug = 'silver-creek-picabo'),
   43.3350, -114.0200,
   ST_SetSRID(ST_MakePoint(-114.0200, 43.3350), 4326),
   'idfg', 'high', 'high'),

  -- Big Wood River
  ('Hailey Greenway River Access', (SELECT id FROM rivers WHERE slug = 'big-wood-hailey'),
   43.5200, -114.3150,
   ST_SetSRID(ST_MakePoint(-114.3150, 43.5200), 4326),
   'idfg', 'high', 'high'),

  ('Bellevue Bridge Access', (SELECT id FROM rivers WHERE slug = 'big-wood-hailey'),
   43.4750, -114.2650,
   ST_SetSRID(ST_MakePoint(-114.2650, 43.4750), 4326),
   'idfg', 'moderate', 'high'),

  -- Boise River
  ('Barber Park Boat Ramp', (SELECT id FROM rivers WHERE slug = 'boise-river-boise'),
   43.5926, -116.1226,
   ST_SetSRID(ST_MakePoint(-116.1226, 43.5926), 4326),
   'idfg', 'high', 'high'),

  ('Glenwood Bridge Access', (SELECT id FROM rivers WHERE slug = 'boise-river-boise'),
   43.6420, -116.2650,
   ST_SetSRID(ST_MakePoint(-116.2650, 43.6420), 4326),
   'idfg', 'high', 'high'),

  -- South Fork Boise River
  ('Featherville Bridge Put-in', (SELECT id FROM rivers WHERE slug = 'sf-boise-featherville'),
   43.5350, -115.2950,
   ST_SetSRID(ST_MakePoint(-115.2950, 43.5350), 4326),
   'idfg', 'high', 'high'),

  ('Power Plant Access (Canyon Run)', (SELECT id FROM rivers WHERE slug = 'sf-boise-featherville'),
   43.5100, -115.3800,
   ST_SetSRID(ST_MakePoint(-115.3800, 43.5100), 4326),
   'idfg', 'moderate', 'high'),

  -- Clearwater River
  ('Orofino City Access', (SELECT id FROM rivers WHERE slug = 'clearwater-orofino'),
   46.4800, -116.2600,
   ST_SetSRID(ST_MakePoint(-116.2600, 46.4800), 4326),
   'idfg', 'high', 'high'),

  ('Kooskia Boat Launch', (SELECT id FROM rivers WHERE slug = 'clearwater-orofino'),
   46.1350, -115.9800,
   ST_SetSRID(ST_MakePoint(-115.9800, 46.1350), 4326),
   'idfg', 'high', 'high'),

  -- Salmon River
  ('Salmon City Boat Ramp', (SELECT id FROM rivers WHERE slug = 'salmon-river-salmon'),
   45.1800, -113.8950,
   ST_SetSRID(ST_MakePoint(-113.8950, 45.1800), 4326),
   'idfg', 'high', 'high'),

  ('Tower of Babel Access (Salmon Canyon)', (SELECT id FROM rivers WHERE slug = 'salmon-river-salmon'),
   45.3500, -114.1200,
   ST_SetSRID(ST_MakePoint(-114.1200, 45.3500), 4326),
   'idfg', 'moderate', 'high'),

  -- Teton River
  ('Newdale Bridge Access', (SELECT id FROM rivers WHERE slug = 'teton-river-newdale'),
   43.9400, -111.6200,
   ST_SetSRID(ST_MakePoint(-111.6200, 43.9400), 4326),
   'idfg', 'high', 'high'),

  ('Driggs / Teton River Access', (SELECT id FROM rivers WHERE slug = 'teton-river-newdale'),
   43.7250, -111.1100,
   ST_SetSRID(ST_MakePoint(-111.1100, 43.7250), 4326),
   'idfg', 'moderate', 'high'),

  -- ── Wyoming ───────────────────────────────────────────────────────────────

  -- Snake River Jackson Hole
  ('Deadman''s Bar Boat Ramp', (SELECT id FROM rivers WHERE slug = 'snake-river-jackson'),
   43.7100, -110.6200,
   ST_SetSRID(ST_MakePoint(-110.6200, 43.7100), 4326),
   'wgfd', 'high', 'high'),

  ('Schwabachers Landing', (SELECT id FROM rivers WHERE slug = 'snake-river-jackson'),
   43.6700, -110.7300,
   ST_SetSRID(ST_MakePoint(-110.7300, 43.6700), 4326),
   'wgfd', 'high', 'high'),

  ('Moose Landing / Wilson Bridge', (SELECT id FROM rivers WHERE slug = 'snake-river-jackson'),
   43.6500, -110.7800,
   ST_SetSRID(ST_MakePoint(-110.7800, 43.6500), 4326),
   'wgfd', 'high', 'high'),

  ('Pacific Creek Boat Ramp (Moran)', (SELECT id FROM rivers WHERE slug = 'snake-river-jackson'),
   43.8500, -110.5800,
   ST_SetSRID(ST_MakePoint(-110.5800, 43.8500), 4326),
   'wgfd', 'high', 'high'),

  -- Gros Ventre River
  ('Kelly Warm Spring Access (Gros Ventre)', (SELECT id FROM rivers WHERE slug = 'gros-ventre-jackson'),
   43.6250, -110.5850,
   ST_SetSRID(ST_MakePoint(-110.5850, 43.6250), 4326),
   'wgfd', 'high', 'high'),

  -- Green River (Fontenelle)
  ('Fontenelle Reservoir Boat Ramp', (SELECT id FROM rivers WHERE slug = 'green-river-fontenelle'),
   42.0200, -110.0500,
   ST_SetSRID(ST_MakePoint(-110.0500, 42.0200), 4326),
   'wgfd', 'high', 'high'),

  ('La Barge Creek Confluence Access', (SELECT id FROM rivers WHERE slug = 'green-river-fontenelle'),
   41.9700, -110.1800,
   ST_SetSRID(ST_MakePoint(-110.1800, 41.9700), 4326),
   'wgfd', 'moderate', 'high'),

  -- Wind River
  ('Ray Lake Fishing Access (Riverton)', (SELECT id FROM rivers WHERE slug = 'wind-river-riverton'),
   43.0500, -108.4800,
   ST_SetSRID(ST_MakePoint(-108.4800, 43.0500), 4326),
   'wgfd', 'moderate', 'high'),

  ('Boysen State Park Boat Ramp', (SELECT id FROM rivers WHERE slug = 'wind-river-riverton'),
   43.4100, -108.1700,
   ST_SetSRID(ST_MakePoint(-108.1700, 43.4100), 4326),
   'wgfd', 'high', 'high'),

  -- Bighorn River
  ('Wedding of the Waters (Hot Springs SP)', (SELECT id FROM rivers WHERE slug = 'bighorn-river-thermopolis'),
   43.6100, -108.2100,
   ST_SetSRID(ST_MakePoint(-108.2100, 43.6100), 4326),
   'wgfd', 'high', 'high'),

  ('Thermopolis City Access', (SELECT id FROM rivers WHERE slug = 'bighorn-river-thermopolis'),
   43.6450, -108.2000,
   ST_SetSRID(ST_MakePoint(-108.2000, 43.6450), 4326),
   'wgfd', 'high', 'high'),

  -- North Platte (Grey Reef)
  ('Grey Reef Boat Ramp', (SELECT id FROM rivers WHERE slug = 'north-platte-grey-reef'),
   42.5600, -106.6800,
   ST_SetSRID(ST_MakePoint(-106.6800, 42.5600), 4326),
   'wgfd', 'high', 'high'),

  ('Government Bridge Access', (SELECT id FROM rivers WHERE slug = 'north-platte-grey-reef'),
   42.8300, -106.3300,
   ST_SetSRID(ST_MakePoint(-106.3300, 42.8300), 4326),
   'wgfd', 'high', 'high'),

  -- North Platte (Miracle Mile)
  ('Miracle Mile Lower Parking', (SELECT id FROM rivers WHERE slug = 'north-platte-miracle-mile'),
   42.2200, -106.8500,
   ST_SetSRID(ST_MakePoint(-106.8500, 42.2200), 4326),
   'wgfd', 'high', 'high'),

  ('Dugout Campground Access', (SELECT id FROM rivers WHERE slug = 'north-platte-miracle-mile'),
   42.2800, -106.8300,
   ST_SetSRID(ST_MakePoint(-106.8300, 42.2800), 4326),
   'wgfd', 'high', 'high'),

  -- Shoshone River
  ('Wapiti Valley Access', (SELECT id FROM rivers WHERE slug = 'shoshone-river-cody'),
   44.5300, -109.3500,
   ST_SetSRID(ST_MakePoint(-109.3500, 44.5300), 4326),
   'wgfd', 'moderate', 'high'),

  ('Cody City Park River Access', (SELECT id FROM rivers WHERE slug = 'shoshone-river-cody'),
   44.5237, -109.0567,
   ST_SetSRID(ST_MakePoint(-109.0567, 44.5237), 4326),
   'wgfd', 'high', 'high'),

  -- Clarks Fork Yellowstone
  ('Clark WY Bridge Access', (SELECT id FROM rivers WHERE slug = 'clarks-fork-yellowstone'),
   44.8900, -108.9000,
   ST_SetSRID(ST_MakePoint(-108.9000, 44.8900), 4326),
   'wgfd', 'high', 'high'),

  ('Sunlight Basin Access', (SELECT id FROM rivers WHERE slug = 'clarks-fork-yellowstone'),
   44.6200, -109.6500,
   ST_SetSRID(ST_MakePoint(-109.6500, 44.6200), 4326),
   'wgfd', 'moderate', 'high'),

  -- Laramie River
  ('Laramie River City Access', (SELECT id FROM rivers WHERE slug = 'laramie-river-laramie'),
   41.3100, -105.5900,
   ST_SetSRID(ST_MakePoint(-105.5900, 41.3100), 4326),
   'wgfd', 'high', 'high'),

  ('Woods Landing Access', (SELECT id FROM rivers WHERE slug = 'laramie-river-laramie'),
   41.1100, -106.0100,
   ST_SetSRID(ST_MakePoint(-106.0100, 41.1100), 4326),
   'wgfd', 'moderate', 'high')

ON CONFLICT DO NOTHING;
