-- ─────────────────────────────────────────────────────────────────────────────
-- Priority 2: Henry's Fork Anglers — extend to SF Snake and Teton rivers
-- 2026-04-23
--
-- The original migration (20260422190000) only added Henry's Fork Anglers
-- for henrys-fork-ashton. The audit spec requires it to also cover
-- sf-snake-palisades and teton-river-newdale (both nearby and commonly
-- reported together by this shop from Last Chance, ID).
--
-- Scraper status (as of 2026-04-22):
--   - is_active = true, last_successful_scrape_at = 2026-04-22 22:38
--   - last 30d reports = 0 (scrape runs but extracts no content)
--   - Root cause: henrysforkanglers.com is a Shopify store with JS-rendered
--     blog content. The /blogs/fishing-reports.json and /articles.json APIs
--     return 404 (disabled). Raw HTML fetch returns ~500 bytes of JS shell.
--     Claude Haiku gets no extractable text → no reports stored.
--   - Workaround: entries added for coverage; HTML scraping will succeed
--     when/if shop adds static HTML or enables Shopify API.
--     No action needed in scraper code — the issue is the source site.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.fly_shop_sources (shop_name, river_id, report_url, is_active)
VALUES
  ('Henry''s Fork Anglers',
   (SELECT id FROM rivers WHERE slug = 'sf-snake-palisades'),
   'https://www.henrysforkanglers.com/blogs/fishing-reports',
   true),

  ('Henry''s Fork Anglers',
   (SELECT id FROM rivers WHERE slug = 'teton-river-newdale'),
   'https://www.henrysforkanglers.com/blogs/fishing-reports',
   true)

ON CONFLICT DO NOTHING;
