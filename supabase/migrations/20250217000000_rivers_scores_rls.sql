-- RLS policies for rivers and river_daily_scores (development read access)
alter table public.rivers enable row level security;
alter table public.river_daily_scores enable row level security;

drop policy if exists "Allow public read rivers" on public.rivers;
create policy "Allow public read rivers"
  on public.rivers for select
  using (true);

drop policy if exists "Allow public read scores" on public.river_daily_scores;
create policy "Allow public read scores"
  on public.river_daily_scores for select
  using (true);
