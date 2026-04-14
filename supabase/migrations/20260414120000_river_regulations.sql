-- ─────────────────────────────────────────────────────────────────────────────
-- Fishing regulations table
-- Stores time-bounded regulation notices per river (hoot owl, closures, etc.)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.river_regulations (
  id              uuid        primary key default gen_random_uuid(),
  river_id        uuid        references public.rivers(id) on delete cascade,
  regulation_type text        not null check (regulation_type in ('hoot_owl','closed','catch_release','hours_restricted')),
  description     text        not null,
  start_date      date,
  end_date        date,
  is_active       boolean     default true,
  source_url      text,
  notes           text,
  created_at      timestamptz default now()
);

create index if not exists river_regulations_river_id_idx on public.river_regulations(river_id);
create index if not exists river_regulations_dates_idx    on public.river_regulations(start_date, end_date);

-- RLS: public read, service_role write
alter table public.river_regulations enable row level security;

create policy "public read regulations"
  on public.river_regulations for select
  using (true);

-- ── Seed 2026 known regulations ───────────────────────────────────────────────

-- Big Hole River: hoot owl restrictions July–September
-- FWP has issued voluntary hoot owl on Big Hole sections 2-4 most summers since 2012
insert into public.river_regulations
  (river_id, regulation_type, description, start_date, end_date, source_url, notes)
values (
  (select id from public.rivers where slug = 'big-hole-melrose'),
  'hoot_owl',
  'Sections 2–4: open midnight to 2:00 PM only. No fishing 2 PM–midnight when water temps exceed thresholds.',
  '2026-07-01',
  '2026-09-30',
  'https://fwp.mt.gov/fish/regulations',
  'Voluntary hoot owl typically declared by FWP when water temps approach 70°F. Check FWP for current status.'
);

-- Yellowstone at Corwin Springs: catch-and-release only in park boundary section
insert into public.river_regulations
  (river_id, regulation_type, description, start_date, end_date, source_url, notes)
values (
  (select id from public.rivers where slug = 'yellowstone-corwin-springs'),
  'catch_release',
  'Catch-and-release only from Reese Creek to Gardiner (Yellowstone National Park boundary section).',
  '2026-01-01',
  '2026-12-31',
  'https://www.nps.gov/yell/planyourvisit/fishing.htm',
  'NPS regulations apply within park boundary. State regulations apply below Gardiner.'
);

-- Gallatin: catch-and-release in certain sections (Wild and Scenic corridor)
insert into public.river_regulations
  (river_id, regulation_type, description, start_date, end_date, source_url, notes)
values (
  (select id from public.rivers where slug = 'gallatin-gateway'),
  'catch_release',
  'Catch-and-release for all salmonids from the mouth upstream to US-191 bridge at Big Sky.',
  '2026-01-01',
  '2026-12-31',
  'https://fwp.mt.gov/fish/regulations',
  'MT FWP Fishing District 3 special regulation. Applies year-round.'
);

grant select on public.river_regulations to anon, authenticated;
grant all    on public.river_regulations to service_role;
