-- ─────────────────────────────────────────────────────────────────────────────
-- Secondary/corridor USGS gauges for Idaho and Wyoming rivers
-- 2026-04-22
--
-- These are priority=2 'flow' entries — context gauges for the corridor strip.
-- The ingest uses priority=1 (primary) for scoring; priority=2 entries provide
-- upstream/downstream context for the conditions display.
--
-- Verified active as of 2026-04-22 via USGS IV API.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.river_usgs_map_roles
  (river_id, role, site_no, priority, is_active, notes)
VALUES

  -- ── Clearwater River corridor ─────────────────────────────────────────────
  -- Primary: 13340000 (Clearwater at Orofino, 19,800 cfs)
  -- Add downstream gauges to show full corridor

  ((SELECT id FROM rivers WHERE slug = 'clearwater-orofino'),
   'flow', '13341050', 2, true,
   'Clearwater River near Peck, ID — downstream corridor gauge (~12mi below Orofino). '
   'Shows how flows evolve heading toward Lewiston.'),

  ((SELECT id FROM rivers WHERE slug = 'clearwater-orofino'),
   'flow', '13342500', 3, true,
   'Clearwater River at Spalding, ID — near Lewiston, terminus gauge. '
   'Includes Potlatch/Lapwai tributary inflows.'),

  -- Lochsa River (major Clearwater tributary — upstream snowmelt indicator)
  ((SELECT id FROM rivers WHERE slug = 'clearwater-orofino'),
   'flow', '13337000', 4, true,
   'Lochsa River near Lowell, ID — major Clearwater tributary. '
   'Strong upstream runoff indicator; Lochsa is ~40% of Clearwater flow during snowmelt.'),

  -- ── Snake River Jackson Hole corridor ────────────────────────────────────
  -- Primary: 13018750 (Snake at Moose, WY)
  -- Add upstream context gauges

  ((SELECT id FROM rivers WHERE slug = 'snake-river-jackson'),
   'flow', '13010065', 2, true,
   'Snake River above Jackson Lake at Flagg Ranch, WY — headwaters context gauge. '
   'Shows upper basin inflow before Jackson Lake regulation.'),

  ((SELECT id FROM rivers WHERE slug = 'snake-river-jackson'),
   'flow', '13011500', 3, true,
   'Pacific Creek at Moran, WY — major tributary entering Snake above fishing section. '
   'Useful spring runoff indicator for upper Jackson Hole.'),

  -- ── North Platte corridor — Grey Reef and Miracle Mile share basin ────────
  -- Both sections currently use 06630000 (above Seminoe, upstream proxy)
  -- The two sections are linked — share upstream basin readings

  -- Grey Reef section gets Miracle Mile as downstream context reference
  -- (they're on same river, ~25 miles apart)
  -- No additional active gauges confirmed between sections

  -- ── Salmon River corridor ────────────────────────────────────────────────
  -- Primary: gauge near Salmon city
  -- Add upstream Stanley headwaters gauge for early-season runoff indication

  ((SELECT id FROM rivers WHERE slug = 'salmon-river-salmon'),
   'flow', '13295000', 2, true,
   'Valley Creek at Stanley, ID — upper Salmon Basin context gauge. '
   'Stanley/Sawtooth headwaters; shows early snowmelt pulse entering the main Salmon.')

ON CONFLICT (river_id, role, site_no) DO NOTHING;
