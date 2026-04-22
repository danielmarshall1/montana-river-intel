-- ─────────────────────────────────────────────────────────────────────────────
-- Idaho/Wyoming data completeness fixes
-- 2026-04-22
--
-- 1. Add elevation_offset_weeks column (hatch calendar calibration)
-- 2. Set elevation offsets for high-altitude ID/WY rivers
-- 3. Fix broken/offline WY flow gauges → working alternatives
-- 4. Add temp gauge roles for 7 rivers whose flow gauges also measure temperature
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Add elevation_offset_weeks column ──────────────────────────────────────
ALTER TABLE public.rivers
  ADD COLUMN IF NOT EXISTS elevation_offset_weeks integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.rivers.elevation_offset_weeks IS
  'Weeks to shift hatch calendar later vs sea level. '
  'Approx rule: +2 weeks per 2000ft above 4000ft.';


-- ── 2. Set elevation offsets for high-altitude ID/WY rivers ──────────────────
-- Montana rivers at 4000-5500ft: offset 0-1 (already calibrated)
-- Rationale: ~2 weeks per 2000ft gain above 4000ft baseline

UPDATE public.rivers SET elevation_offset_weeks = 2
WHERE slug IN (
  'henrys-fork-ashton',     -- 6,300ft Island Park
  'big-wood-hailey',        -- 5,800ft Ketchum/Hailey
  'teton-river-newdale',    -- 6,200ft Teton Valley
  'gros-ventre-jackson'     -- 6,500ft Jackson Hole
);

UPDATE public.rivers SET elevation_offset_weeks = 3
WHERE slug IN (
  'salmon-river-salmon',      -- 6,500ft near Stanley headwaters
  'snake-river-jackson',      -- 6,800ft Jackson Hole
  'clarks-fork-yellowstone',  -- 7,000ft Cooke City area
  'sf-snake-palisades'        -- 5,700ft Swan Valley (runoff driven)
);

-- Wyoming mid-elevation rivers: 1 week offset
UPDATE public.rivers SET elevation_offset_weeks = 1
WHERE slug IN (
  'laramie-river-laramie',   -- 7,200ft Medicine Bow area (late runoff)
  'wind-river-riverton',     -- 5,100ft (mixed elevation basin)
  'shoshone-river-cody'      -- 5,100ft Wapiti Valley
);


-- ── 3. Fix broken/offline Wyoming flow gauges ─────────────────────────────────
-- Shoshone: 06282900 (inactive) → 06279940 (N Fork Shoshone at Wapiti, live)
UPDATE public.river_usgs_map_roles
SET site_no = '06279940',
    notes   = 'North Fork Shoshone River at Wapiti, WY — upstream of Cody fishing section. '
              'Replaces 06282900 (inactive). Active gauge ~20mi upstream.'
WHERE river_id = '574becbb-380f-47c9-9cc3-837d8c9e42d1'
  AND role = 'flow'
  AND site_no = '06282900';

UPDATE public.rivers
SET usgs_site_no = '06279940'
WHERE slug = 'shoshone-river-cody';

-- Bighorn: 06259500 (no data in 30+ days) → 06274300 (Bighorn at Basin, live)
UPDATE public.river_usgs_map_roles
SET site_no = '06274300',
    notes   = 'Bighorn River at Basin, WY — ~90mi downstream of Thermopolis. '
              'Replaces 06259500 (offline). Best available active gauge for this river.'
WHERE river_id = '1449bee7-9e6e-4ec9-b8ba-68ab18fe1634'
  AND role = 'flow'
  AND site_no = '06259500';

UPDATE public.rivers
SET usgs_site_no = '06274300'
WHERE slug = 'bighorn-river-thermopolis';

-- N Platte Grey Reef: 06642000 (no valid data) → 06630000 (above Seminoe, live)
-- Note: 06630000 is upstream of Seminoe Reservoir; best available active gauge
UPDATE public.river_usgs_map_roles
SET site_no = '06630000',
    notes   = 'N Platte above Seminoe Reservoir, nr Sinclair WY — upstream proxy. '
              'Replaces 06642000 (offline). Flows regulated through Seminoe/Alcova dams.'
WHERE river_id = '4e97bacb-d65c-41aa-8d32-bed0ad3f43c1'
  AND role = 'flow'
  AND site_no = '06642000';

UPDATE public.rivers
SET usgs_site_no = '06630000'
WHERE slug = 'north-platte-grey-reef';

-- N Platte Miracle Mile: 06636000 (offline) → 06630000 (same upstream proxy)
-- Note: rivers.usgs_site_no not updated here — unique constraint prevents both
-- N Platte rows sharing 06630000. The river_usgs_map_roles update below is what
-- the ingest functions actually use.
UPDATE public.river_usgs_map_roles
SET site_no = '06630000',
    notes   = 'N Platte above Seminoe Reservoir — upstream of Miracle Mile. '
              'Replaces 06636000 (offline, above Pathfinder Reservoir).'
WHERE river_id = '4151a517-8a0e-4b64-889d-17606049f2f3'
  AND role = 'flow'
  AND site_no = '06636000';


-- ── 4. Add temp gauge roles for rivers whose flow gauges measure temperature ───
-- Confirmed via USGS IV API (parameterCd=00010): these 7 flow gauges have temp sensors.
-- All others in ID/WY lack USGS temperature monitoring.

INSERT INTO public.river_usgs_map_roles
  (river_id, role, site_no, priority, is_active, notes)
VALUES
  -- Idaho
  ((SELECT id FROM rivers WHERE slug = 'sf-snake-palisades'),
   'temp', '13032500', 1, true,
   'SF Snake R at Irwin, ID — measures both flow and water temp'),

  ((SELECT id FROM rivers WHERE slug = 'big-wood-hailey'),
   'temp', '13139510', 1, true,
   'Big Wood R at Hailey, ID — measures both flow and water temp'),

  ((SELECT id FROM rivers WHERE slug = 'silver-creek-picabo'),
   'temp', '13150430', 1, true,
   'Silver Cr at Sportsmens Access nr Picabo, ID — measures both flow and water temp'),

  ((SELECT id FROM rivers WHERE slug = 'clearwater-orofino'),
   'temp', '13340000', 1, true,
   'Clearwater R at Orofino, ID — measures both flow and water temp'),

  -- Wyoming
  ((SELECT id FROM rivers WHERE slug = 'green-river-fontenelle'),
   'temp', '09211200', 1, true,
   'Green R below Fontenelle Reservoir, WY — measures both flow and water temp'),

  ((SELECT id FROM rivers WHERE slug = 'gros-ventre-jackson'),
   'temp', '13014500', 1, true,
   'Gros Ventre R near Kelly, WY — measures both flow and water temp'),

  ((SELECT id FROM rivers WHERE slug = 'snake-river-jackson'),
   'temp', '13018750', 1, true,
   'Snake R at Moose, WY — measures both flow and water temp')

ON CONFLICT (river_id, role, site_no) DO NOTHING;
