-- ─────────────────────────────────────────────────────────────────────────────
-- Flow thresholds for ID/WY rivers + Gallatin drift range
-- 2026-04-30
--
-- wading_threshold_cfs: flow above which wading becomes unsafe/impractical
-- drift_optimal_min_cfs: minimum flow for a comfortable drift boat float
-- drift_optimal_max_cfs: maximum flow before floating becomes dangerous
--
-- Sources: outfitter guide pages, state FWP/WGFD reports, USGS historical
-- medians, biological instream flow assessments. Values reflect fly fishing
-- guide consensus — not whitewater standards.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Big Wood River near Hailey, ID
-- Primarily wade fishery; too small/braided for routine drift boats.
-- Idaho Angling Services: wading "difficult" above 1,050 cfs; spring float
-- window 800–1,500 cfs. Source: Idaho Angling Services; USGS 13139510.
UPDATE public.rivers SET
  wading_threshold_cfs    = 800,
  drift_optimal_min_cfs   = 800,
  drift_optimal_max_cfs   = 1500
WHERE slug = 'big-wood-hailey';

-- 2. Bighorn River at Thermopolis, WY
-- Large tailwater below Boysen Reservoir; float-dominant fishery.
-- Bighorn Drifters + Wyoming Anglers: drift boats 600–3,000 cfs;
-- wading marginal above ~900 cfs. Source: Bighorn Drifters; Crazy Rainbow.
UPDATE public.rivers SET
  wading_threshold_cfs    = 900,
  drift_optimal_min_cfs   = 600,
  drift_optimal_max_cfs   = 3000
WHERE slug = 'bighorn-river-thermopolis';

-- 3. Boise River at Glenwood Bridge, ID (tailwater)
-- Regulated urban tailwater. TRR Outfitters: wading good ≤1,000 cfs;
-- float season 1,000–2,500 cfs. Source: TRR Outfitters; USGS 13206000.
UPDATE public.rivers SET
  wading_threshold_cfs    = 1000,
  drift_optimal_min_cfs   = 1000,
  drift_optimal_max_cfs   = 2500
WHERE slug = 'boise-river-boise';

-- 4. Clarks Fork Yellowstone near Belfry, MT
-- Freestone canyon/valley river. USGS 06207500 median summer 500–2,000 cfs.
-- Guide consensus for similar canyon freestone: wade ≤800 cfs, float 600–2,500 cfs.
-- Source: Cody/Red Lodge outfitter descriptions; USGS historical.
UPDATE public.rivers SET
  wading_threshold_cfs    = 800,
  drift_optimal_min_cfs   = 600,
  drift_optimal_max_cfs   = 2500
WHERE slug = 'clarks-fork-yellowstone';

-- 5. Clearwater River at Orofino, ID
-- Large freestone/steelhead river. Clearwater Steelhead Syndicate: prime
-- wading window 3,000–5,000 cfs (fall/winter); drift boats/sleds 3,000–15,000 cfs.
-- Source: Clearwater Steelhead Syndicate; IDFG planner; USGS historical.
UPDATE public.rivers SET
  wading_threshold_cfs    = 5000,
  drift_optimal_min_cfs   = 3000,
  drift_optimal_max_cfs   = 15000
WHERE slug = 'clearwater-orofino';

-- 6. Green River below Fontenelle Dam, WY (tailwater)
-- FWS Seedskadee minimum release 800 cfs. Imagine That Outfitters + Dunoir:
-- wading feasible ≤1,500 cfs; float optimal 800–4,000 cfs.
-- Source: FWS Seedskadee FAQ; Imagine That Outfitters; Dunoir Fishing.
UPDATE public.rivers SET
  wading_threshold_cfs    = 1500,
  drift_optimal_min_cfs   = 800,
  drift_optimal_max_cfs   = 4000
WHERE slug = 'green-river-fontenelle';

-- 7. Gros Ventre River near Kelly, WY
-- Small freestone; primarily walk-wade fishery. Wandering Angler + Stonefly
-- Fish: wading difficult above ~500 cfs; drift impractical on most sections.
-- Source: Wandering Angler; Stonefly Fish guide pages.
UPDATE public.rivers SET
  wading_threshold_cfs    = 500,
  drift_optimal_min_cfs   = 400,
  drift_optimal_max_cfs   = 1200
WHERE slug = 'gros-ventre-jackson';

-- 8. Henry's Fork at Ashton, ID (tailwater below Ashton Dam)
-- Spring-fed tailwater with stable releases. TRR Outfitters + Henry's Fork
-- Foundation: wading good ≤1,500 cfs; float optimal 1,000–3,000 cfs.
-- Source: TRR Outfitters; Henry's Fork Foundation conditions.
UPDATE public.rivers SET
  wading_threshold_cfs    = 1500,
  drift_optimal_min_cfs   = 1000,
  drift_optimal_max_cfs   = 3000
WHERE slug = 'henrys-fork-ashton';

-- 9. Laramie River near Laramie, WY
-- Small wade fishery; Four Seasons Anglers + High Plains: prime wading
-- 75–300 cfs; float window brief and technical; impractical above 1,000 cfs.
-- Source: Four Seasons Anglers; High Plains Fly Fishing.
UPDATE public.rivers SET
  wading_threshold_cfs    = 400,
  drift_optimal_min_cfs   = 300,
  drift_optimal_max_cfs   = 1000
WHERE slug = 'laramie-river-laramie';

-- 10. North Platte at Grey Reef, WY (tailwater below Alcova)
-- Premier WY tailwater. Grey Reef Anglers + Wyoming Anglers: wade fishing
-- best ≤1,200 cfs; drift optimal 1,000–4,000 cfs (summer irrigation season).
-- Source: Grey Reef Anglers; wyominganglers.com.
UPDATE public.rivers SET
  wading_threshold_cfs    = 1200,
  drift_optimal_min_cfs   = 1000,
  drift_optimal_max_cfs   = 4000
WHERE slug = 'north-platte-grey-reef';

-- 11. North Platte at Miracle Mile, WY (tailwater below Seminoe/Kortes)
-- Technical 5.5-mile tailwater. RiverReports + North Platte Lodge: wade
-- sweet spot 400–1,200 cfs; above 1,200 cfs "you'll want a drift boat";
-- technical whitewater limits boats above ~3,500 cfs.
-- Source: RiverReports NP Wyoming; North Platte Lodge fishing reports.
UPDATE public.rivers SET
  wading_threshold_cfs    = 1200,
  drift_optimal_min_cfs   = 800,
  drift_optimal_max_cfs   = 3500
WHERE slug = 'north-platte-miracle-mile';

-- 12. Salmon River at Salmon, ID (upper mainstem)
-- Large freestone; float-dominant through canyon. RiverScout + USGS 13302500:
-- wading feasible in upper braided valley ≤2,500 cfs; float optimal 2,000–10,000 cfs.
-- Source: RiverScout Salmon conditions; USGS historical.
UPDATE public.rivers SET
  wading_threshold_cfs    = 2500,
  drift_optimal_min_cfs   = 2000,
  drift_optimal_max_cfs   = 10000
WHERE slug = 'salmon-river-salmon';

-- 13. Shoshone River above Willwood Dam near Cody, WY (tailwater)
-- Below Buffalo Bill Dam. USBR/WGFD instream flow study: ~420 cfs biologically
-- optimal. North Fork Anglers: wade good ≤1,200 cfs; drift optimal 600–2,500 cfs.
-- Source: USBR/WGFD biological assessment; North Fork Anglers.
UPDATE public.rivers SET
  wading_threshold_cfs    = 1200,
  drift_optimal_min_cfs   = 600,
  drift_optimal_max_cfs   = 2500
WHERE slug = 'shoshone-river-cody';

-- 14. Silver Creek near Picabo, ID (spring creek)
-- World-class spring creek; stable ~100–200 cfs. Strictly walk-wade — float
-- craft impractical and contrary to access agreements. Drift values NULL.
-- Source: Picabo Angler; DIY Fly Fishing Silver Creek; IDFG planner.
UPDATE public.rivers SET
  wading_threshold_cfs    = 300,
  drift_optimal_min_cfs   = NULL,
  drift_optimal_max_cfs   = NULL
WHERE slug = 'silver-creek-picabo';

-- 15. Snake River at Jackson, WY (below Jackson Lake Dam)
-- Regulated release; upper section stays clear. Wandering Angler + Snake River
-- Angler: wading excellent ≤1,500 cfs; drift optimal 1,500–7,000 cfs.
-- Source: Wandering Angler; NPS GRTE floating guide; Snake River Angler.
UPDATE public.rivers SET
  wading_threshold_cfs    = 1500,
  drift_optimal_min_cfs   = 1500,
  drift_optimal_max_cfs   = 7000
WHERE slug = 'snake-river-jackson';

-- 16. South Fork Boise near Featherville, ID (tailwater below Anderson Ranch Dam)
-- Compact 10-mile canyon tailwater. Fish Fly Water + Idaho Angler: wading
-- good ≤1,000 cfs; drift boat season 1,000–2,000 cfs.
-- Source: Fish Fly Water SF Boise guide; southforkboise.org; USGS 13190500.
UPDATE public.rivers SET
  wading_threshold_cfs    = 1000,
  drift_optimal_min_cfs   = 1000,
  drift_optimal_max_cfs   = 2000
WHERE slug = 'sf-boise-featherville';

-- 17. South Fork Snake River below Palisades Dam, ID (tailwater)
-- Large tailwater; irrigation-driven flows 875–14,000+ cfs. TLAPC + TRR
-- Outfitters: wading opens below ~3,000 cfs (fall/winter); drift boats
-- 3,000–12,000 cfs. Source: TLAPC river sections; TRR Outfitters; NW Fly Fishing.
UPDATE public.rivers SET
  wading_threshold_cfs    = 3000,
  drift_optimal_min_cfs   = 3000,
  drift_optimal_max_cfs   = 12000
WHERE slug = 'sf-snake-palisades';

-- 18. Teton River near Newdale, ID
-- Narrow walk-wade cutthroat fishery with willow-choked banks. WorldCast
-- Anglers + TRR Outfitters: ideal wading 150–400 cfs; above ~500 cfs wading
-- difficult; small drift boats possible on lower sections.
-- Source: WorldCast Anglers Teton guide; TRR Outfitters Teton page.
UPDATE public.rivers SET
  wading_threshold_cfs    = 500,
  drift_optimal_min_cfs   = 400,
  drift_optimal_max_cfs   = 1500
WHERE slug = 'teton-river-newdale';

-- 19. Wind River near Riverton, WY
-- Trophy tailwater through Wind River Canyon (permit section). WGFD instream
-- flow study: 110 cfs biological minimum. Guide consensus: wade ≤1,200 cfs;
-- drift boat 600–3,500 cfs through canyon. Source: WGFD instream flow map;
-- windrivercanyon.com; wyomingfishing.net.
UPDATE public.rivers SET
  wading_threshold_cfs    = 1200,
  drift_optimal_min_cfs   = 600,
  drift_optimal_max_cfs   = 3500
WHERE slug = 'wind-river-riverton';

-- 20. Gallatin River near Gallatin Gateway, MT (drift range only — wading already set)
-- Lower float section Logan to Three Forks. Montana Angler + FlyFishingBozeman:
-- drift boat optimal 500–2,000 cfs; below 300 cfs too shallow; above 2,000 cfs
-- fishing impractical from boat. Source: Montana Angler; FlyFishingBozeman.com.
UPDATE public.rivers SET
  wading_threshold_cfs    = 400,
  drift_optimal_min_cfs   = 500,
  drift_optimal_max_cfs   = 2000
WHERE slug = 'gallatin-gateway';
