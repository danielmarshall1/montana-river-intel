-- RLS: allow public read, block public writes. Ingestion uses service role (bypasses RLS).
alter table public.pai_sources enable row level security;
alter table public.pai_reports enable row level security;

create policy "Allow public read on pai_sources"
  on public.pai_sources for select using (true);

create policy "Allow public read on pai_reports"
  on public.pai_reports for select using (true);

-- No insert/update/delete policies for anon/authenticated = public writes blocked.
