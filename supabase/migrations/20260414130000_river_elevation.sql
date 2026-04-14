-- ─────────────────────────────────────────────────────────────────────────────
-- Add elevation_ft to rivers table
-- Used by hatch timing logic to offset effective date for high-elevation rivers.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.rivers
  add column if not exists elevation_ft integer default null;

comment on column public.rivers.elevation_ft is
  'River gauge elevation in feet above sea level. Used to offset hatch timing — high-elevation rivers run 1-3 weeks behind lower rivers at the same temperature.';

update public.rivers set elevation_ft = 6700 where slug = 'madison-west-yellowstone';
update public.rivers set elevation_ft = 4200 where slug = 'gallatin-gateway';
update public.rivers set elevation_ft = 4100 where slug = 'yellowstone-corwin-springs';
update public.rivers set elevation_ft = 4500 where slug = 'yellowstone-livingston';
update public.rivers set elevation_ft = 5100 where slug = 'big-hole-melrose';
update public.rivers set elevation_ft = 4000 where slug = 'jefferson-river-three-forks';
update public.rivers set elevation_ft = 3200 where slug = 'bitterroot-missoula';
update public.rivers set elevation_ft = 3100 where slug = 'blackfoot-bonner';
update public.rivers set elevation_ft = 2900 where slug = 'clark-fork-st-regis';
update public.rivers set elevation_ft = 3400 where slug = 'rock-creek-clinton';
update public.rivers set elevation_ft = 3600 where slug = 'marias-chester';
update public.rivers set elevation_ft = 3800 where slug = 'missouri-toston';
update public.rivers set elevation_ft = 2600 where slug = 'flathead-columbia-falls';
update public.rivers set elevation_ft = 2400 where slug = 'nf-flathead-columbia-falls';
update public.rivers set elevation_ft = 2800 where slug = 'kootenai-below-libby-dam';
update public.rivers set elevation_ft = 3600 where slug = 'bighorn-st-xavier';
