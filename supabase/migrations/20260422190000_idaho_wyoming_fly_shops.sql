-- ─────────────────────────────────────────────────────────────────────────────
-- Fly shop report sources for Idaho and Wyoming rivers
-- 2026-04-22
--
-- Shops confirmed to have scrapable HTML fishing report pages:
--   Grey Reef Anglers — greyreefanglers.com/fishing-report (plain HTML, verified)
--
-- Shops with Shopify blog (JS-rendered, partial scrape possible):
--   Henry's Fork Anglers — henrysforkanglers.com/blogs/fishing-reports
--
-- Shops without accessible report pages (503/404 as of 2026-04-22):
--   South Fork Lodge, Silver Creek Outfitters, Jack Dennis Outdoor Shop
--   → is_active = false until report pages are confirmed available
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.fly_shop_sources
  (shop_name, river_id, report_url, is_active)
VALUES

  -- ── Grey Reef Anglers (Casper, WY) ───────────────────────────────────────
  -- Plain HTML report page, confirmed scrapable
  ('Grey Reef Anglers',
   (SELECT id FROM rivers WHERE slug = 'north-platte-grey-reef'),
   'https://www.greyreefanglers.com/fishing-report',
   true),

  ('Grey Reef Anglers',
   (SELECT id FROM rivers WHERE slug = 'north-platte-miracle-mile'),
   'https://www.greyreefanglers.com/fishing-report',
   true),

  -- ── Henry's Fork Anglers (Last Chance, ID) ───────────────────────────────
  -- Shopify blog — scrapable via /blogs/fishing-reports.json API endpoint
  ('Henry''s Fork Anglers',
   (SELECT id FROM rivers WHERE slug = 'henrys-fork-ashton'),
   'https://www.henrysforkanglers.com/blogs/fishing-reports',
   true),

  -- ── South Fork Lodge (Swan Valley, ID) ───────────────────────────────────
  -- Report page not confirmed — set inactive, revisit
  ('South Fork Lodge',
   (SELECT id FROM rivers WHERE slug = 'sf-snake-palisades'),
   'https://www.southforklodge.com/fishing-reports',
   false),

  -- ── Silver Creek Outfitters (Ketchum, ID) ────────────────────────────────
  ('Silver Creek Outfitters',
   (SELECT id FROM rivers WHERE slug = 'silver-creek-picabo'),
   'https://www.silvercreekoutfitters.com/fishing-report',
   false),

  ('Silver Creek Outfitters',
   (SELECT id FROM rivers WHERE slug = 'big-wood-hailey'),
   'https://www.silvercreekoutfitters.com/fishing-report',
   false),

  -- ── Jack Dennis Outdoor Shop (Jackson, WY) ───────────────────────────────
  ('Jack Dennis Outdoor Shop',
   (SELECT id FROM rivers WHERE slug = 'snake-river-jackson'),
   'https://www.jackdennis.com/fishing-reports',
   false),

  ('Jack Dennis Outdoor Shop',
   (SELECT id FROM rivers WHERE slug = 'gros-ventre-jackson'),
   'https://www.jackdennis.com/fishing-reports',
   false)

ON CONFLICT DO NOTHING;
