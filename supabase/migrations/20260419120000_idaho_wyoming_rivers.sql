-- ─────────────────────────────────────────────────────────────────────────────
-- Add Idaho and Wyoming rivers
--
-- All USGS site numbers verified against waterservices.usgs.gov on 2026-04-19.
-- 11 of the 19 originally-proposed site numbers were wrong and have been
-- corrected here with the verified values.
--
-- Corrected sites:
--   SF Snake      13027500 → 13032500  (Snake R nr Irwin ID, actual below-dam gauge)
--   Clearwater    13341000 → 13340000  (NF Clearwater → main stem at Orofino)
--   Teton         13057940 → 13055000  (Willow Creek → Teton R nr St Anthony; no active Newdale gauge)
--   N Platte Grey Reef 06653000 → 06642000  (Horseshoe Creek → N Platte at Alcova WY)
--   N Platte Miracle Mile 06638000 → 06636000 (Sweetwater R → N Platte above Pathfinder Reservoir)
--   Snake Jackson  13010065 → 13018750  (Flagg Ranch above Jackson Lake → Snake R bl Flat Creek nr Jackson)
--   Wind           06227000 → 06228000  (Pilot Canal → Wind R at Riverton WY)
--   Shoshone       06213500 → 06282000  (Rock Creek at Joliet MT → Shoshone R bl Buffalo Bill Reservoir)
--   Bighorn WY     06258000 → 06259500  (Muddy Creek → Bighorn R at Thermopolis WY)
--   Laramie        06696000 → 06660000  (South Platte in CO → Laramie R at Laramie WY)
--   Gros Ventre    13011900 → 13014500  (Buffalo Fork → Gros Ventre R at Kelly WY)
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  -- Idaho
  v_henrys_fork   uuid;
  v_sf_snake      uuid;
  v_silver_creek  uuid;
  v_clearwater    uuid;
  v_salmon        uuid;
  v_sf_boise      uuid;
  v_big_wood      uuid;
  v_teton         uuid;
  v_boise         uuid;
  -- Wyoming
  v_np_grey_reef     uuid;
  v_np_miracle_mile  uuid;
  v_snake_jackson    uuid;
  v_green_fontenelle uuid;
  v_wind             uuid;
  v_shoshone         uuid;
  v_bighorn_wy       uuid;
  v_laramie          uuid;
  v_gros_ventre      uuid;
  v_clarks_fork      uuid;
begin

  -- ── Idaho Rivers ───────────────────────────────────────────────────────────

  insert into public.rivers
    (slug, river_name, gauge_label, usgs_site_no, state, latitude, longitude, is_active, is_tailwater, elevation_ft)
  values
    ('henrys-fork-ashton', 'Henry''s Fork of the Snake River', 'at Ashton',
     '13046000', 'ID', 44.0697222, -111.5105556, true, false, 5093)
  on conflict (slug) do nothing
  returning id into v_henrys_fork;
  if v_henrys_fork is null then
    select id into v_henrys_fork from public.rivers where slug = 'henrys-fork-ashton';
  end if;

  -- Verified gauge: 13032500 "SNAKE RIVER NR IRWIN ID" — immediately below Palisades Dam
  -- (user-supplied 13027500 was Salt River near Etna WY)
  insert into public.rivers
    (slug, river_name, gauge_label, usgs_site_no, state, latitude, longitude, is_active, is_tailwater, elevation_ft)
  values
    ('sf-snake-palisades', 'South Fork Snake River', 'below Palisades Dam',
     '13032500', 'ID', 43.3508333, -111.2188889, true, true, 5357)
  on conflict (slug) do nothing
  returning id into v_sf_snake;
  if v_sf_snake is null then
    select id into v_sf_snake from public.rivers where slug = 'sf-snake-palisades';
  end if;

  insert into public.rivers
    (slug, river_name, gauge_label, usgs_site_no, state, latitude, longitude, is_active, is_tailwater, elevation_ft)
  values
    ('silver-creek-picabo', 'Silver Creek', 'near Picabo',
     '13150430', 'ID', 43.3233611, -114.10835, true, false, 4834)
  on conflict (slug) do nothing
  returning id into v_silver_creek;
  if v_silver_creek is null then
    select id into v_silver_creek from public.rivers where slug = 'silver-creek-picabo';
  end if;

  -- Verified gauge: 13340000 "CLEARWATER RIVER AT OROFINO ID"
  -- (user-supplied 13341000 was NF Clearwater at Ahsahka)
  insert into public.rivers
    (slug, river_name, gauge_label, usgs_site_no, state, latitude, longitude, is_active, is_tailwater, elevation_ft)
  values
    ('clearwater-orofino', 'Clearwater River', 'at Orofino',
     '13340000', 'ID', 46.4783333, -116.2575, true, false, 994)
  on conflict (slug) do nothing
  returning id into v_clearwater;
  if v_clearwater is null then
    select id into v_clearwater from public.rivers where slug = 'clearwater-orofino';
  end if;

  insert into public.rivers
    (slug, river_name, gauge_label, usgs_site_no, state, latitude, longitude, is_active, is_tailwater, elevation_ft)
  values
    ('salmon-river-salmon', 'Salmon River', 'at Salmon',
     '13302500', 'ID', 45.1836111, -113.8952778, true, false, 3915)
  on conflict (slug) do nothing
  returning id into v_salmon;
  if v_salmon is null then
    select id into v_salmon from public.rivers where slug = 'salmon-river-salmon';
  end if;

  insert into public.rivers
    (slug, river_name, gauge_label, usgs_site_no, state, latitude, longitude, is_active, is_tailwater, elevation_ft)
  values
    ('sf-boise-featherville', 'South Fork Boise River', 'near Featherville',
     '13185000', 'ID', 43.66805556, -115.7252778, true, true, 3275)
  on conflict (slug) do nothing
  returning id into v_sf_boise;
  if v_sf_boise is null then
    select id into v_sf_boise from public.rivers where slug = 'sf-boise-featherville';
  end if;

  insert into public.rivers
    (slug, river_name, gauge_label, usgs_site_no, state, latitude, longitude, is_active, is_tailwater, elevation_ft)
  values
    ('big-wood-hailey', 'Big Wood River', 'near Hailey',
     '13139510', 'ID', 43.5172222, -114.3216667, true, false, 5299)
  on conflict (slug) do nothing
  returning id into v_big_wood;
  if v_big_wood is null then
    select id into v_big_wood from public.rivers where slug = 'big-wood-hailey';
  end if;

  -- Verified gauge: 13055000 "TETON RIVER NR ST ANTHONY ID" — closest active gauge;
  -- no gauge exists at Newdale (Teton Dam failed 1976, gauge discontinued)
  -- (user-supplied 13057940 was Willow Creek near Ririe ID)
  insert into public.rivers
    (slug, river_name, gauge_label, usgs_site_no, state, latitude, longitude, is_active, is_tailwater, elevation_ft)
  values
    ('teton-river-newdale', 'Teton River', 'near Newdale',
     '13055000', 'ID', 43.9272222, -111.6138889, true, false, 4973)
  on conflict (slug) do nothing
  returning id into v_teton;
  if v_teton is null then
    select id into v_teton from public.rivers where slug = 'teton-river-newdale';
  end if;

  insert into public.rivers
    (slug, river_name, gauge_label, usgs_site_no, state, latitude, longitude, is_active, is_tailwater, elevation_ft)
  values
    ('boise-river-boise', 'Boise River', 'at Glenwood Bridge Boise',
     '13206000', 'ID', 43.66055556, -116.2791667, true, true, 2603)
  on conflict (slug) do nothing
  returning id into v_boise;
  if v_boise is null then
    select id into v_boise from public.rivers where slug = 'boise-river-boise';
  end if;

  -- ── Wyoming Rivers ─────────────────────────────────────────────────────────

  -- Verified gauge: 06642000 "NORTH PLATTE RIVER AT ALCOVA, WY"
  -- (user-supplied 06653000 was Horseshoe Creek near Esterbrook WY)
  insert into public.rivers
    (slug, river_name, gauge_label, usgs_site_no, state, latitude, longitude, is_active, is_tailwater, elevation_ft)
  values
    ('north-platte-grey-reef', 'North Platte River', 'at Grey Reef',
     '06642000', 'WY', 42.5741069, -106.692594, true, true, 5299)
  on conflict (slug) do nothing
  returning id into v_np_grey_reef;
  if v_np_grey_reef is null then
    select id into v_np_grey_reef from public.rivers where slug = 'north-platte-grey-reef';
  end if;

  -- Verified gauge: 06636000 "NORTH PLATTE RIVER ABOVE PATHFINDER RESERVOIR WY"
  -- This gauge sits at the downstream end of the Miracle Mile section.
  -- (user-supplied 06638000 was Sweetwater River near Atlantic City WY)
  insert into public.rivers
    (slug, river_name, gauge_label, usgs_site_no, state, latitude, longitude, is_active, is_tailwater, elevation_ft)
  values
    ('north-platte-miracle-mile', 'North Platte River', 'at Cortes WY',
     '06636000', 'WY', 42.17827577, -106.8764847, true, true, 5930)
  on conflict (slug) do nothing
  returning id into v_np_miracle_mile;
  if v_np_miracle_mile is null then
    select id into v_np_miracle_mile from public.rivers where slug = 'north-platte-miracle-mile';
  end if;

  -- Verified gauge: 13018750 "SNAKE RIVER BELOW FLAT CREEK, NEAR JACKSON, WY" (active through present)
  -- (user-supplied 13010065 was Snake R at Flagg Ranch, above Jackson Lake — wrong watershed section)
  insert into public.rivers
    (slug, river_name, gauge_label, usgs_site_no, state, latitude, longitude, is_active, is_tailwater, elevation_ft)
  values
    ('snake-river-jackson', 'Snake River', 'at Jackson WY',
     '13018750', 'WY', 43.3722222, -110.7386111, true, false, 5956)
  on conflict (slug) do nothing
  returning id into v_snake_jackson;
  if v_snake_jackson is null then
    select id into v_snake_jackson from public.rivers where slug = 'snake-river-jackson';
  end if;

  insert into public.rivers
    (slug, river_name, gauge_label, usgs_site_no, state, latitude, longitude, is_active, is_tailwater, elevation_ft)
  values
    ('green-river-fontenelle', 'Green River', 'below Fontenelle Dam',
     '09211200', 'WY', 42.0209722, -110.0498056, true, true, 6378)
  on conflict (slug) do nothing
  returning id into v_green_fontenelle;
  if v_green_fontenelle is null then
    select id into v_green_fontenelle from public.rivers where slug = 'green-river-fontenelle';
  end if;

  -- Verified gauge: 06228000 "WIND RIVER AT RIVERTON, WY"
  -- (user-supplied 06227000 was Pilot Canal near Morton WY)
  insert into public.rivers
    (slug, river_name, gauge_label, usgs_site_no, state, latitude, longitude, is_active, is_tailwater, elevation_ft)
  values
    ('wind-river-riverton', 'Wind River', 'near Riverton',
     '06228000', 'WY', 43.01051478, -108.3767701, true, false, 4902)
  on conflict (slug) do nothing
  returning id into v_wind;
  if v_wind is null then
    select id into v_wind from public.rivers where slug = 'wind-river-riverton';
  end if;

  -- Verified gauge: 06282000 "SHOSHONE RIVER BELOW BUFFALO BILL RESERVOIR, WY"
  -- Note: gauge was discontinued ~2016; coordinates still valid for weather;
  -- USGS-ingest will show stale flow until an active replacement is identified.
  -- (user-supplied 06213500 was Rock Creek at Joliet MT)
  insert into public.rivers
    (slug, river_name, gauge_label, usgs_site_no, state, latitude, longitude, is_active, is_tailwater, elevation_ft)
  values
    ('shoshone-river-cody', 'Shoshone River', 'near Cody',
     '06282000', 'WY', 44.51658049, -109.0979716, true, false, 4900)
  on conflict (slug) do nothing
  returning id into v_shoshone;
  if v_shoshone is null then
    select id into v_shoshone from public.rivers where slug = 'shoshone-river-cody';
  end if;

  -- Verified gauge: 06259500 "BIGHORN RIVER AT THERMOPOLIS, WY"
  -- (user-supplied 06258000 was Muddy Creek near Shoshoni WY)
  insert into public.rivers
    (slug, river_name, gauge_label, usgs_site_no, state, latitude, longitude, is_active, is_tailwater, elevation_ft)
  values
    ('bighorn-river-thermopolis', 'Bighorn River', 'at Thermopolis',
     '06259500', 'WY', 43.64603505, -108.202932, true, false, 4305)
  on conflict (slug) do nothing
  returning id into v_bighorn_wy;
  if v_bighorn_wy is null then
    select id into v_bighorn_wy from public.rivers where slug = 'bighorn-river-thermopolis';
  end if;

  -- Verified gauge: 06660000 "LARAMIE RIVER AT LARAMIE, WY"
  -- (user-supplied 06696000 was South Platte River near Lake George CO)
  insert into public.rivers
    (slug, river_name, gauge_label, usgs_site_no, state, latitude, longitude, is_active, is_tailwater, elevation_ft)
  values
    ('laramie-river-laramie', 'Laramie River', 'near Laramie',
     '06660000', 'WY', 41.32777778, -105.6074167, true, false, 7132)
  on conflict (slug) do nothing
  returning id into v_laramie;
  if v_laramie is null then
    select id into v_laramie from public.rivers where slug = 'laramie-river-laramie';
  end if;

  -- Verified gauge: 13014500 "GROS VENTRE RIVER AT KELLY, WY"
  -- (user-supplied 13011900 was Buffalo Fork above Lava Creek near Moran WY)
  insert into public.rivers
    (slug, river_name, gauge_label, usgs_site_no, state, latitude, longitude, is_active, is_tailwater, elevation_ft)
  values
    ('gros-ventre-jackson', 'Gros Ventre River', 'near Kelly WY',
     '13014500', 'WY', 43.62088889, -110.6230556, true, false, 6648)
  on conflict (slug) do nothing
  returning id into v_gros_ventre;
  if v_gros_ventre is null then
    select id into v_gros_ventre from public.rivers where slug = 'gros-ventre-jackson';
  end if;

  -- Verified gauge: 06208500 "Clarks Fork Yellowstone River at Edgar MT"
  -- Nearest active gauge; gauge is just across the MT border, correct river reach.
  insert into public.rivers
    (slug, river_name, gauge_label, usgs_site_no, state, latitude, longitude, is_active, is_tailwater, elevation_ft)
  values
    ('clarks-fork-yellowstone', 'Clarks Fork Yellowstone', 'near Belfry MT',
     '06208500', 'WY', 45.46571389, -108.8441056, true, false, 3460)
  on conflict (slug) do nothing
  returning id into v_clarks_fork;
  if v_clarks_fork is null then
    select id into v_clarks_fork from public.rivers where slug = 'clarks-fork-yellowstone';
  end if;

  -- ── USGS gauge role assignments ────────────────────────────────────────────
  -- One 'flow' role per river, priority=1, is_active=true.
  -- These are inserted after all rivers are created so FK constraints are satisfied.

  insert into public.river_usgs_map_roles (river_id, role, site_no, priority, is_active, notes)
  values
    -- Idaho
    (v_henrys_fork,   'flow', '13046000', 1, true, 'Henry''s Fork at Ashton ID'),
    (v_sf_snake,      'flow', '13032500', 1, true, 'Snake R nr Irwin ID (below Palisades Dam)'),
    (v_silver_creek,  'flow', '13150430', 1, true, 'Silver Creek at Sportsman Access nr Picabo ID'),
    (v_clearwater,    'flow', '13340000', 1, true, 'Clearwater R at Orofino ID'),
    (v_salmon,        'flow', '13302500', 1, true, 'Salmon R at Salmon ID'),
    (v_sf_boise,      'flow', '13185000', 1, true, 'Boise R nr Twin Springs ID (SF Boise)'),
    (v_big_wood,      'flow', '13139510', 1, true, 'Big Wood R at Hailey ID'),
    (v_teton,         'flow', '13055000', 1, true, 'Teton R nr St Anthony ID (closest active gauge)'),
    (v_boise,         'flow', '13206000', 1, true, 'Boise R at Glenwood Bridge nr Boise ID'),
    -- Wyoming
    (v_np_grey_reef,     'flow', '06642000', 1, true, 'N Platte at Alcova WY (Grey Reef tailwater)'),
    (v_np_miracle_mile,  'flow', '06636000', 1, true, 'N Platte above Pathfinder Reservoir WY (Miracle Mile)'),
    (v_snake_jackson,    'flow', '13018750', 1, true, 'Snake R below Flat Creek near Jackson WY'),
    (v_green_fontenelle, 'flow', '09211200', 1, true, 'Green R below Fontenelle Reservoir WY'),
    (v_wind,             'flow', '06228000', 1, true, 'Wind R at Riverton WY'),
    (v_shoshone,         'flow', '06282000', 1, true, 'Shoshone R below Buffalo Bill Reservoir WY'),
    (v_bighorn_wy,       'flow', '06259500', 1, true, 'Bighorn R at Thermopolis WY'),
    (v_laramie,          'flow', '06660000', 1, true, 'Laramie R at Laramie WY'),
    (v_gros_ventre,      'flow', '13014500', 1, true, 'Gros Ventre R at Kelly WY'),
    (v_clarks_fork,      'flow', '06208500', 1, true, 'Clarks Fork Yellowstone R at Edgar MT')
  on conflict (river_id, role, site_no) do nothing;

end $$;
