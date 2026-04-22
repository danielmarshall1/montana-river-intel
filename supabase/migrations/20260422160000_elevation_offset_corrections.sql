-- ─────────────────────────────────────────────────────────────────────────────
-- Elevation offset corrections for ID/WY rivers
-- 2026-04-22
--
-- Corrects two rivers from the initial idaho_wyoming_data_fixes migration:
--   - sf-boise-featherville: 0 → 2 (5,500ft, late runoff basin)
--   - gros-ventre-jackson: 2 → 3 (6,800ft, high-altitude WY tributary)
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.rivers SET elevation_offset_weeks = 2
WHERE slug IN (
  'henrys-fork-ashton',     -- 6,300ft Island Park (was already 2, confirm)
  'big-wood-hailey',        -- 5,800ft Ketchum/Hailey (was already 2, confirm)
  'teton-river-newdale',    -- 6,200ft Teton Valley (was already 2, confirm)
  'sf-boise-featherville'   -- 5,500ft late runoff basin (was 0, fix)
);

UPDATE public.rivers SET elevation_offset_weeks = 3
WHERE slug IN (
  'snake-river-jackson',       -- 6,800ft Jackson Hole (was already 3, confirm)
  'gros-ventre-jackson',       -- 6,800ft WY tributary (was 2, fix → 3)
  'clarks-fork-yellowstone',   -- 7,000ft Cooke City area (was already 3, confirm)
  'salmon-river-salmon'        -- 6,500ft Stanley headwaters (was already 3, confirm)
);
