-- ─────────────────────────────────────────────────────────────────────────────
-- Fly shop report scraping system
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.fly_shop_sources (
  id                        uuid primary key default gen_random_uuid(),
  shop_name                 text not null,
  river_id                  uuid references public.rivers(id) on delete set null,
  report_url                text not null,
  is_active                 boolean default true,
  last_scraped_at           timestamptz,
  last_successful_scrape_at timestamptz,
  scrape_error              text,
  created_at                timestamptz default now()
);

create table if not exists public.fly_shop_reports (
  id                  uuid primary key default gen_random_uuid(),
  source_id           uuid references public.fly_shop_sources(id) on delete cascade,
  river_id            uuid references public.rivers(id) on delete set null,
  scraped_at          timestamptz default now(),
  report_date         date,
  raw_text            text,
  -- Extracted fields
  overall_conditions  text check (overall_conditions in ('excellent', 'good', 'fair', 'poor', 'unfishable')),
  water_clarity       text check (water_clarity in ('clear', 'slightly_off', 'off_color', 'blown')),
  primary_hatch       text,
  salmonfly_status    text check (salmonfly_status in ('not_started', 'pre_hatch', 'starting', 'peak', 'trailing', 'done', 'not_applicable')),
  salmonfly_section   text,
  recommended_flies   text[],
  tactical_notes      text,
  -- Metadata
  confidence_score    numeric check (confidence_score between 0 and 1),
  is_verified         boolean default false,
  created_at          timestamptz default now()
);

create index if not exists fly_shop_reports_river_scraped_idx
  on public.fly_shop_reports (river_id, scraped_at desc);

create index if not exists fly_shop_reports_salmonfly_idx
  on public.fly_shop_reports (salmonfly_status, scraped_at desc);

grant select on public.fly_shop_sources to anon, authenticated, service_role;
grant select on public.fly_shop_reports to anon, authenticated, service_role;
grant all    on public.fly_shop_sources to service_role;
grant all    on public.fly_shop_reports to service_role;

-- ── Seed sources ─────────────────────────────────────────────────────────────

-- Active sources — verified to return static HTML content without JavaScript rendering
insert into public.fly_shop_sources (shop_name, river_id, report_url, is_active) values
  ('Grizzly Hackle',  (select id from public.rivers where slug = 'bitterroot-missoula'),  'https://grizzlyhackle.com/pages/bitterroot-river-fishing-report',  true),
  ('Grizzly Hackle',  (select id from public.rivers where slug = 'blackfoot-bonner'),     'https://grizzlyhackle.com/pages/blackfoot-river-fishing-report',    true),
  ('Grizzly Hackle',  (select id from public.rivers where slug = 'clark-fork-st-regis'),  'https://grizzlyhackle.com/pages/clark-fork-river-fishing-report',   true),
  ('Grizzly Hackle',  (select id from public.rivers where slug = 'missouri-toston'),      'https://grizzlyhackle.com/pages/missouri-river-fishing-report',     true),
  ('Grizzly Hackle',  (select id from public.rivers where slug = 'rock-creek-clinton'),   'https://grizzlyhackle.com/pages/rock-creek-fishing-report',         true),
  ('Sunrise Fly Shop',(select id from public.rivers where slug = 'big-hole-melrose'),     'https://www.sunriseflyshop.com/montana-fishing-reports/big-hole-river/', true),
  -- Inactive: theriversedge.com is a Shopify store — all pages are JS-rendered shells
  ('The River''s Edge',(select id from public.rivers where slug = 'madison-west-yellowstone'), 'https://theriversedge.com/pages/montana-fishing-reports', false),
  ('The River''s Edge',(select id from public.rivers where slug = 'gallatin-gateway'),          'https://theriversedge.com/pages/montana-fishing-reports',          false),
  ('The River''s Edge',(select id from public.rivers where slug = 'yellowstone-livingston'),    'https://theriversedge.com/pages/montana-fishing-reports',          false)
on conflict do nothing;

-- ── Cron: every Tuesday and Friday at 8am MT (14:00 UTC) ─────────────────────
-- Requires pg_cron and pg_net extensions enabled in Supabase project.

select cron.schedule(
  'flyshop-scraper',
  '0 14 * * 2,5',
  $$
  select net.http_post(
    url     := (select 'https://' || current_setting('app.supabase_url', true) || '/functions/v1/flyshop-scraper'),
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body    := '{}'::jsonb
  );
  $$
);
