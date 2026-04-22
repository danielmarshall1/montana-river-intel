-- ─────────────────────────────────────────────────────────────────────────────
-- Idaho and Wyoming river regulations
-- 2026-04-22
--
-- Sources:
--   ID: idfg.idaho.gov/fishing/regulations
--   WY: wgfd.wyo.gov/fishing/fishing-regulations
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.river_regulations
  (river_id, regulation_type, description, start_date, end_date, is_active, source_url, notes)
VALUES

  -- ── Idaho ──────────────────────────────────────────────────────────────────

  -- Henry's Fork — Railroad Ranch (Harriman State Park) section
  ((SELECT id FROM rivers WHERE slug = 'henrys-fork-ashton'),
   'catch_release',
   'Railroad Ranch section (Harriman State Park boundary downstream ~3 miles): catch-and-release only, artificial flies and lures only, barbless hooks required.',
   '2026-06-15',
   '2026-11-30',
   true,
   'https://idfg.idaho.gov/fishing/regulations',
   'Railroad Ranch C&R section is one of the most famous dry-fly reaches in the US. Open June 15–Nov 30 only.'),

  -- Silver Creek — TNC Preserve section
  ((SELECT id FROM rivers WHERE slug = 'silver-creek-picabo'),
   'catch_release',
   'Silver Creek Preserve (TNC section): catch-and-release only, single barbless hooks, artificial flies only. No wading within 50ft of posted banks in preserve.',
   NULL,
   NULL,
   true,
   'https://www.nature.org/en-us/get-involved/how-to-help/places-we-protect/silver-creek-preserve/',
   'TNC Preserve rules apply year-round on preserve section. IDFG season rules apply outside preserve.'),

  -- Clearwater — barbless hooks for salmon/steelhead
  ((SELECT id FROM rivers WHERE slug = 'clearwater-orofino'),
   'hours_restricted',
   'Barbless hooks required for all salmon and steelhead fishing throughout the Clearwater River drainage. Check IDFG for current salmon/steelhead season status — runs subject to emergency closures.',
   NULL,
   NULL,
   true,
   'https://idfg.idaho.gov/fishing/regulations',
   'Salmon/steelhead seasons vary annually by run strength. Clearwater historically opens Aug–Oct for fall chinook, Oct–Dec for B-run steelhead.'),

  -- Salmon River — bull trout protection
  ((SELECT id FROM rivers WHERE slug = 'salmon-river-salmon'),
   'catch_release',
   'Bull trout: catch-and-release only throughout the Salmon River drainage. All bull trout must be released immediately.',
   NULL,
   NULL,
   true,
   'https://idfg.idaho.gov/fishing/regulations',
   'Bull trout are a threatened species in Idaho. Accidental catch common when targeting rainbow/cutthroat in the Salmon drainage.'),

  -- SF Boise — season opening date
  ((SELECT id FROM rivers WHERE slug = 'sf-boise-featherville'),
   'closed',
   'South Fork Boise River closes annually for the winter/spring period. Season typically opens the Saturday of Memorial Day weekend (late May). Check current year IDFG proclamation.',
   '2026-01-01',
   '2026-05-23',
   true,
   'https://idfg.idaho.gov/fishing/regulations',
   'High-elevation river with late snowmelt — closed season protects spawning redds. Featherville section runs through a BLM canyon.'),

  -- ── Wyoming ────────────────────────────────────────────────────────────────

  -- Snake River Jackson — cutthroat protection
  ((SELECT id FROM rivers WHERE slug = 'snake-river-jackson'),
   'catch_release',
   'Snake River fine-spotted cutthroat: catch-and-release strongly encouraged throughout the Jackson Hole reach. All cutthroat under 18" must be released; check current WGFD proclamation for possession limits on larger fish.',
   NULL,
   NULL,
   true,
   'https://wgfd.wyo.gov/fishing/fishing-regulations',
   'The Snake River fine-spotted cutthroat is endemic to the upper Snake. National Park Service C&R rules apply within Grand Teton National Park boundaries.'),

  -- Wind River — tribal permit required
  ((SELECT id FROM rivers WHERE slug = 'wind-river-riverton'),
   'hours_restricted',
   'Portions of the Wind River flow through the Wind River Indian Reservation (Eastern Shoshone and Northern Arapaho Tribes). A tribal fishing permit is required in addition to a Wyoming state license for reservation sections. Check reservation boundaries carefully — penalties apply.',
   NULL,
   NULL,
   true,
   'https://wgfd.wyo.gov/fishing/fishing-regulations',
   'The reservation section runs roughly between Riverton and Boysen Reservoir. Non-tribal anglers must carry both state and tribal permits on reservation water.')

ON CONFLICT DO NOTHING;
