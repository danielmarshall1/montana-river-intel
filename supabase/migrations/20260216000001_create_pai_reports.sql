create table if not exists public.pai_reports (
  id uuid primary key default gen_random_uuid(),
  shop_name text not null,
  source_url text not null unique,
  title text not null,
  published_at timestamptz,
  excerpt text,
  rivers text[],
  flies text[],
  summary text,
  created_at timestamptz not null default now()
);

create index if not exists idx_pai_reports_published_at on public.pai_reports(published_at desc);
create index if not exists idx_pai_reports_rivers on public.pai_reports using gin(rivers);
create index if not exists idx_pai_reports_shop on public.pai_reports(shop_name);
