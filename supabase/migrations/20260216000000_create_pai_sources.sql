create table if not exists public.pai_sources (
  id uuid primary key default gen_random_uuid(),
  shop_name text not null,
  source_type text not null check (source_type in ('rss', 'html')),
  url text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_pai_sources_active on public.pai_sources(active) where active = true;
