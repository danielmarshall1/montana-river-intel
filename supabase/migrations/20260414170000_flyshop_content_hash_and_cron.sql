-- ─────────────────────────────────────────────────────────────────────────────
-- Add content_hash to fly_shop_reports for deduplication
-- Update cron: replace Tue/Fri schedule with single Wednesday run
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.fly_shop_reports
  add column if not exists content_hash text;

comment on column public.fly_shop_reports.content_hash is
  'SHA-256 hex digest of raw_text at scrape time. Used to skip Claude call when page content has not changed since last scrape.';

create index if not exists fly_shop_reports_source_hash_idx
  on public.fly_shop_reports (source_id, content_hash);

-- Remove old Tue/Fri cron (may not exist if initial migration cron block was skipped)
select cron.unschedule('flyshop-scraper') where exists (
  select 1 from cron.job where jobname = 'flyshop-scraper'
);

-- Wednesday 14:00 UTC (8am MT) — shops update weekly at most
select cron.schedule(
  'flyshop-scraper-weekly',
  '0 14 * * 3',
  $$
  select net.http_post(
    url     := 'https://relkyvqwmfbmzzlqypmu.supabase.co/functions/v1/flyshop-scraper',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body    := '{}'::jsonb
  );
  $$
);
