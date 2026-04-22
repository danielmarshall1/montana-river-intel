-- ─────────────────────────────────────────────────────────────────────────────
-- Remaining ID/WY fixes
-- 2026-04-22
--
-- 1. Railroad Ranch closed season (Dec 1 – Jun 14) — not in previous migration
-- 2. Fix Grey Reef Anglers report URL (/fishing-report redirects; correct URL confirmed)
-- 3. Add North Platte Lodge fly shop
-- 4. Activate Silver Creek Outfitters (Shopify blog endpoint confirmed 200)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Railroad Ranch closed season ──────────────────────────────────────────
INSERT INTO public.river_regulations
  (river_id, regulation_type, description, start_date, end_date, is_active, source_url, notes)
VALUES
  ((SELECT id FROM rivers WHERE slug = 'henrys-fork-ashton'),
   'closed',
   'Railroad Ranch section (Harriman State Park): closed December 1 through June 14. Open season is June 15–November 30 only.',
   '2026-12-01',
   '2027-06-14',
   true,
   'https://idfg.idaho.gov/fishing/regulations',
   'Annual closure — repeats every year. Protects spawning and winter redds on the famous Railroad Ranch reach.')
ON CONFLICT DO NOTHING;


-- ── 2. Fix Grey Reef Anglers URL (old /fishing-report redirects 301) ──────────
UPDATE public.fly_shop_sources
SET report_url = 'https://greyreefanglers.com/north-platte-river-grey-reef-outfitters-fishing-report/'
WHERE shop_name = 'Grey Reef Anglers'
  AND report_url = 'https://www.greyreefanglers.com/fishing-report';


-- ── 3. Add North Platte Lodge (The Reef Fly Shop) ────────────────────────────
INSERT INTO public.fly_shop_sources (shop_name, river_id, report_url, is_active)
VALUES
  ('North Platte Lodge',
   (SELECT id FROM rivers WHERE slug = 'north-platte-grey-reef'),
   'https://northplatteflyfishing.com/fishing-report/',
   true),
  ('North Platte Lodge',
   (SELECT id FROM rivers WHERE slug = 'north-platte-miracle-mile'),
   'https://northplatteflyfishing.com/fishing-report/',
   true)
ON CONFLICT DO NOTHING;


-- ── 4. Activate Silver Creek Outfitters (Shopify blog returns 200) ────────────
UPDATE public.fly_shop_sources
SET report_url   = 'https://silvercreekoutfitters.com/blogs/fishing-reports',
    is_active    = true
WHERE shop_name = 'Silver Creek Outfitters';
