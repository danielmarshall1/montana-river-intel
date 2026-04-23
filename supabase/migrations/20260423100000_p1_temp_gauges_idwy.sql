-- ─────────────────────────────────────────────────────────────────────────────
-- Priority 1: Add temperature gauge assignments for ID/WY rivers
-- 2026-04-23
--
-- Tested all 10 primary flow gauges — none transmit temperature (parameterCd=00010).
-- Searched USGS IV API by bbox for each river basin and identified the nearest
-- active temp sensors. Results:
--
--  RIVERS WITH ASSIGNABLE TEMP GAUGES (5 new):
--    Salmon River     → 13307000  SALMON RIVER NR SHOUP ID (9.0°C, 0.8h ago)
--    SF Boise River   → 13192200  SF BOISE RIVER AT NEAL BRIDGE NR ARROWROCK (8.3°C)
--    Boise River      → 13211205  BOISE RIVER AT CALDWELL ID (9.4°C) [~25mi downstream]
--    Wind River       → 06236100  WIND RIVER AB BOYSEN RESERVOIR NR SHOSHONI (14.1°C)
--    Shoshone River   → 06285100  SHOSHONE RIVER NEAR LOVELL WY (10.5°C) [downstream]
--
--  NO USGS TEMP COVERAGE FOUND (7 rivers — no sensors in basin):
--    Henry's Fork     — no active temp sensors in Henry's Fork drainage
--    Teton River      — no active temp sensors in Teton drainage
--    Bighorn WY       — no active temp sensors near Thermopolis
--    Clarks Fork YS   — 06208500 only has flow; no temp in Clarks Fork WY drainage
--    Laramie River    — no active temp sensors in Laramie basin
--    North Platte GR  — no active temp sensors near Alcova/Grey Reef tailrace
--    North Platte MM  — shared condition with Grey Reef
--
--  TEMP COVERAGE: Before = 7/19, After = 12/19 (63%)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.river_usgs_map_roles
  (river_id, role, site_no, priority, is_active, notes)
VALUES

  -- Salmon River — 13307000 is ~90mi downstream (Shoup) but same main Salmon drainage
  ((SELECT id FROM rivers WHERE slug = 'salmon-river-salmon'),
   'temp', '13307000', 1, true,
   'SALMON RIVER NR SHOUP ID — downstream temp proxy; no active temp gauge at Salmon city. '
   'Shoup is ~90 river miles below the Salmon fishing section but reflects the same drainage. '
   'Verified live: 9.0°C as of 2026-04-23.'),

  -- SF Boise River — 13192200 is at Neal Bridge, downstream of Featherville section
  ((SELECT id FROM rivers WHERE slug = 'sf-boise-featherville'),
   'temp', '13192200', 1, true,
   'SF BOISE RIVER AT NEAL BRIDGE NR ARROWROCK DAM ID — downstream temp proxy. '
   'Featherville section is upstream; this gauge is ~20mi below on the lower SF Boise canyon. '
   'Verified live: 8.3°C as of 2026-04-23.'),

  -- Boise River — 13211205 is at Caldwell (~25mi downstream of Boise city fishing section)
  -- 13206000 (Glenwood Bridge — the flow gauge) does not transmit temperature.
  ((SELECT id FROM rivers WHERE slug = 'boise-river-boise'),
   'temp', '13211205', 1, true,
   'BOISE RIVER AT CALDWELL ID — downstream temp proxy (~25mi below Boise city fishing reach). '
   'The primary flow gauge at Glenwood Bridge (13206000) has no temp sensor. '
   'Caldwell reading may run 1-2°C warmer than fishing section due to ag return flows. '
   'Verified live: 9.4°C as of 2026-04-23.'),

  -- Wind River — 06236100 is at Boysen Reservoir (lower end of Wind River section)
  ((SELECT id FROM rivers WHERE slug = 'wind-river-riverton'),
   'temp', '06236100', 1, true,
   'WIND RIVER AB BOYSEN RESERVOIR NR SHOSHONI WY — near the lower end of the '
   'Wind River Riverton fishing section. Best available active temp sensor on this river. '
   'Verified live: 14.1°C as of 2026-04-23.'),

  -- Shoshone River — 06285100 at Lovell is ~50mi downstream of Cody fishing section
  -- No active temp gauges exist near Cody or Wapiti Valley
  ((SELECT id FROM rivers WHERE slug = 'shoshone-river-cody'),
   'temp', '06285100', 1, true,
   'SHOSHONE RIVER NEAR LOVELL WY — downstream temp proxy (~50mi below Cody fishing section). '
   'No active USGS temp sensors exist near Cody or Wapiti Valley on the Shoshone. '
   'Lovell reading provides directional temp signal; may differ from upper section. '
   'Verified live: 10.5°C as of 2026-04-23.')

ON CONFLICT (river_id, role, site_no) DO UPDATE
  SET is_active = true,
      priority  = 1,
      notes     = EXCLUDED.notes;
