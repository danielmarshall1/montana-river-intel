-- ─────────────────────────────────────────────────────────────────────────────
-- Fix SF Snake River (sf-snake-palisades) temperature gauge
-- 2026-04-22
--
-- Problem: The temp role entry for site 13032500 (Snake River near Irwin ID)
-- is stale — USGS discontinued the temperature sensor in November 2015.
-- The site is still active for flow (9,450 cfs), but temp has not been
-- transmitted in ~91,000 hours, causing the UI to show impossibly stale data.
--
-- Fix: Deactivate the stale temp entry for 13032500.
--      Add 13022500 (Snake River above Palisades Reservoir, near Alpine WY)
--      as the active temp source. This gauge is upstream of Palisades Dam
--      at the WY/ID border — it measures incoming Snake River water before
--      the reservoir and is the best available active temp gauge for this
--      section. Current reading: 8.0°C (2026-04-22).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Deactivate stale temp sensor on 13032500 ───────────────────────────────
UPDATE public.river_usgs_map_roles
SET is_active = false,
    notes     = COALESCE(notes, '') ||
                ' [TEMP DISCONTINUED: Last temp reading 2015-11-04; flow sensor still active.]'
WHERE river_id = '902b13d9-2f6e-49ea-9bbc-f4c8d9e3e99b'::uuid
  AND role    = 'temp'
  AND site_no = '13032500';


-- ── 2. Add 13022500 as active temp source ────────────────────────────────────
-- Snake River above Palisades Reservoir near Alpine WY
-- lat=43.196, lon=-110.889 — at Wyoming/Idaho border, upstream of dam
-- Active temp data: 8.0°C as of 2026-04-22
INSERT INTO public.river_usgs_map_roles
  (river_id, role, site_no, priority, is_active, notes)
VALUES
  ('902b13d9-2f6e-49ea-9bbc-f4c8d9e3e99b'::uuid,
   'temp', '13022500', 1, true,
   'Snake River above Palisades Reservoir near Alpine WY — upstream temp proxy. '
   'No active temp gauge exists in Swan Valley proper; this is the nearest '
   'continuously transmitting USGS temp site on the same river system. '
   'Pre-dam measurement: may be 0.5-2°C warmer than tailwater during summer.')
ON CONFLICT (river_id, role, site_no) DO UPDATE
  SET is_active = true,
      priority  = 1,
      notes     = EXCLUDED.notes;
