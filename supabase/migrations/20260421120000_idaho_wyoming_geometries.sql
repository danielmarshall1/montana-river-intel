-- ─────────────────────────────────────────────────────────────────────────────
-- Seed approximate river geometries for Idaho and Wyoming rivers
--
-- Geometries are simplified representative LineStrings covering the primary
-- fishing section near each gauge. Coordinates derived from USGS gauge
-- locations and known river geography. Precision is sufficient for map display;
-- exact centerlines can be improved with an NHD sync job later.
--
-- All geometries stored as MultiLineString (required by river_geometries schema).
-- Inserted as ON CONFLICT DO NOTHING — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.river_geometries (river_id, geom)
values

  -- ── Idaho ──────────────────────────────────────────────────────────────────

  -- Henry's Fork: Island Park → Last Chance → Harriman Ranch → Warm River → Ashton → St Anthony
  ('bbcb5721-f628-4ac0-aa78-fe051d3379ab',
   st_multi(st_geomfromgeojson('{"type":"LineString","coordinates":[
     [-111.43,44.49],[-111.47,44.47],[-111.48,44.43],[-111.47,44.36],
     [-111.46,44.23],[-111.46,44.17],[-111.48,44.07],[-111.56,43.97]
   ]}'::text))),

  -- South Fork Snake River: below Palisades Dam → Swan Valley → Heise area
  ('902b13d9-2f6e-49ea-9bbc-f4c8d9e3e99b',
   st_multi(st_geomfromgeojson('{"type":"LineString","coordinates":[
     [-111.22,43.35],[-111.32,43.38],[-111.38,43.45],[-111.42,43.47],
     [-111.52,43.55],[-111.65,43.61],[-111.85,43.62],[-111.92,43.63]
   ]}'::text))),

  -- Silver Creek: spring creek corridor near Picabo ID
  ('4b35d1e0-d28e-44df-b6ef-a79117a22802',
   st_multi(st_geomfromgeojson('{"type":"LineString","coordinates":[
     [-114.02,43.30],[-114.08,43.32],[-114.11,43.32],[-114.20,43.33],[-114.30,43.35]
   ]}'::text))),

  -- Clearwater River: Kooskia → Kamiah → Orofino → Ahsahka → Lewiston
  ('8a7933db-61b8-4b1b-a708-cf089affe2bb',
   st_multi(st_geomfromgeojson('{"type":"LineString","coordinates":[
     [-115.98,46.13],[-116.02,46.20],[-116.03,46.23],[-116.15,46.38],
     [-116.26,46.48],[-116.32,46.50],[-116.60,46.46],[-116.99,46.42]
   ]}'::text))),

  -- Salmon River: Stanley → Challis → Salmon → NF confluence
  ('b6366671-9a5a-47c7-9b12-25c30a7e0554',
   st_multi(st_geomfromgeojson('{"type":"LineString","coordinates":[
     [-114.94,44.21],[-114.68,44.32],[-114.22,44.50],[-113.90,45.18],
     [-113.88,45.25],[-113.80,45.35],[-113.70,45.40]
   ]}'::text))),

  -- South Fork Boise River: Atlanta → Featherville → Twin Springs canyon
  ('ee017d8e-f95f-436d-bcd0-5ca2b9c46f13',
   st_multi(st_geomfromgeojson('{"type":"LineString","coordinates":[
     [-115.12,43.82],[-115.22,43.86],[-115.30,43.90],[-115.48,43.88],
     [-115.60,43.83],[-115.73,43.67]
   ]}'::text))),

  -- Big Wood River: Galena Summit → Ketchum → Hailey → Bellevue → Richfield
  ('afb25b69-b6f8-423a-a640-e6cc4b2020f4',
   st_multi(st_geomfromgeojson('{"type":"LineString","coordinates":[
     [-114.72,43.88],[-114.66,43.78],[-114.48,43.73],[-114.36,43.68],
     [-114.32,43.52],[-114.27,43.47],[-114.28,43.39]
   ]}'::text))),

  -- Teton River: Victor → Driggs → Tetonia → Newdale → St Anthony
  ('57b63258-930e-4f64-84db-986e759e4320',
   st_multi(st_geomfromgeojson('{"type":"LineString","coordinates":[
     [-111.08,43.60],[-111.12,43.72],[-111.21,43.85],[-111.36,43.88],
     [-111.54,43.89],[-111.61,43.93],[-111.73,43.97]
   ]}'::text))),

  -- Boise River: Lucky Peak Dam → Barber Park → downtown → Glenwood Bridge → Parma
  ('f4994e5f-9f29-4b7e-8a3b-3b4144b9fee7',
   st_multi(st_geomfromgeojson('{"type":"LineString","coordinates":[
     [-116.07,43.59],[-116.12,43.60],[-116.18,43.60],[-116.21,43.61],
     [-116.28,43.66],[-116.35,43.68],[-116.42,43.71]
   ]}'::text))),

  -- ── Wyoming ────────────────────────────────────────────────────────────────

  -- North Platte Grey Reef: below Alcova Dam → Grey Reef → Government Bridge → Casper
  ('4e97bacb-d65c-41aa-8d32-bed0ad3f43c1',
   st_multi(st_geomfromgeojson('{"type":"LineString","coordinates":[
     [-106.71,42.55],[-106.68,42.55],[-106.62,42.56],[-106.53,42.58],
     [-106.44,42.66],[-106.38,42.75],[-106.33,42.84]
   ]}'::text))),

  -- North Platte Miracle Mile: below Seminoe Dam → Miracle Mile → above Pathfinder
  ('4151a517-8a0e-4b64-889d-17606049f2f3',
   st_multi(st_geomfromgeojson('{"type":"LineString","coordinates":[
     [-106.88,42.17],[-106.84,42.22],[-106.80,42.28],[-106.76,42.36],
     [-106.78,42.42],[-106.85,42.47]
   ]}'::text))),

  -- Snake River Jackson Hole: Moran → Deadman's Bar → Moose → Wilson → Hoback confluence
  ('010c2af0-53c2-423b-8ccc-93f2e64a34d5',
   st_multi(st_geomfromgeojson('{"type":"LineString","coordinates":[
     [-110.59,43.85],[-110.63,43.78],[-110.65,43.75],[-110.72,43.65],
     [-110.77,43.56],[-110.84,43.47],[-110.87,43.37],[-110.89,43.19]
   ]}'::text))),

  -- Green River: Fontenelle Dam → LaBarge → Big Sandy → Green River WY
  ('ec3d49a0-dd7b-4fa5-b7be-94274681c8d6',
   st_multi(st_geomfromgeojson('{"type":"LineString","coordinates":[
     [-110.05,42.02],[-110.08,41.95],[-110.12,41.85],[-110.10,41.75],
     [-109.88,41.65],[-109.67,41.57],[-109.47,41.53]
   ]}'::text))),

  -- Wind River: Dubois → Crowheart → Fort Washakie → Riverton → Boysen
  ('706c98ad-fb6b-4793-ad8b-fabee7abafbf',
   st_multi(st_geomfromgeojson('{"type":"LineString","coordinates":[
     [-109.63,43.53],[-109.35,43.42],[-109.15,43.31],[-108.95,43.18],
     [-108.80,43.08],[-108.38,43.01],[-108.27,43.20],[-108.18,43.40]
   ]}'::text))),

  -- Shoshone River: below Buffalo Bill Reservoir → through Cody → east toward Powell
  ('574becbb-380f-47c9-9cc3-837d8c9e42d1',
   st_multi(st_geomfromgeojson('{"type":"LineString","coordinates":[
     [-109.10,44.52],[-109.07,44.53],[-109.05,44.54],[-108.94,44.59],
     [-108.80,44.67],[-108.56,44.74]
   ]}'::text))),

  -- Bighorn River: Wedding of the Waters → Thermopolis → north canyon
  ('1449bee7-9e6e-4ec9-b8ba-68ab18fe1634',
   st_multi(st_geomfromgeojson('{"type":"LineString","coordinates":[
     [-108.21,43.58],[-108.20,43.65],[-108.19,43.74],[-108.17,43.82],
     [-108.14,43.87],[-108.10,44.00],[-107.97,44.02]
   ]}'::text))),

  -- Laramie River: Woods Landing → Jelm → Laramie → north
  ('6a65e05f-5441-455f-87c4-607307f24099',
   st_multi(st_geomfromgeojson('{"type":"LineString","coordinates":[
     [-106.01,41.11],[-105.89,41.16],[-105.82,41.18],[-105.73,41.23],
     [-105.61,41.33],[-105.47,41.43],[-105.41,41.50],[-105.22,41.63]
   ]}'::text))),

  -- Gros Ventre River: Crystal Creek → Slide Lake → Kelly → Snake confluence
  ('bfa36c2a-aa8c-4237-9cf3-fbef3d67afb8',
   st_multi(st_geomfromgeojson('{"type":"LineString","coordinates":[
     [-110.24,43.64],[-110.35,43.63],[-110.46,43.63],[-110.56,43.62],
     [-110.62,43.62],[-110.68,43.63],[-110.72,43.64]
   ]}'::text))),

  -- Clarks Fork Yellowstone: Sunlight Basin → Clark WY → Belfry/Edgar area
  ('a62c93c7-dd3d-444e-8b0d-acf887cd36c8',
   st_multi(st_geomfromgeojson('{"type":"LineString","coordinates":[
     [-109.85,44.65],[-109.48,44.84],[-109.22,44.91],[-109.05,44.96],
     [-108.88,45.06],[-108.84,45.20],[-108.84,45.47]
   ]}'::text)))

on conflict (river_id) do nothing;
