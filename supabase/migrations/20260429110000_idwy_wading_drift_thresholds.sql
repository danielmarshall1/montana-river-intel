-- Migration: set wading/drift thresholds for ID/WY rivers
-- Values sourced from outfitter guides, state FWP/WGFD data, USGS flow history,
-- and fly-fishing guide consensus.  All values reflect fly-fishing safety/comfort
-- standards (not whitewater), targeting an average competent angler.
--
-- Column semantics:
--   wading_threshold_cfs  – flow ABOVE which wading becomes unsafe/impractical
--   drift_optimal_min_cfs – minimum for a comfortable drift-boat / raft float
--   drift_optimal_max_cfs – maximum before floating becomes hazardous or ineffective
--
-- Rivers where no drift boat fishery exists (spring creek, very small freestone,
-- NPS no-floating rules, etc.) have drift columns left NULL.

-- ---------------------------------------------------------------------------
-- 1. Big Wood River near Hailey, ID
-- ---------------------------------------------------------------------------
-- Classic small Sun Valley freestone. Too narrow and shallow for drift boats;
-- wading-only fishery. Comfortable wading: ~100-350 cfs. At 500+ cfs edges
-- blow out; 600+ is dangerous. Source: Lost River Outfitters, Flies Idaho,
-- Angling Services. No drift thresholds – river is unsuited for drift boats.
UPDATE public.rivers
SET wading_threshold_cfs  = 500,
    drift_optimal_min_cfs = NULL,
    drift_optimal_max_cfs = NULL
WHERE slug = 'big-wood-hailey';

-- ---------------------------------------------------------------------------
-- 2. Bighorn River at Thermopolis, WY
-- ---------------------------------------------------------------------------
-- Large tailwater regulated by Boysen Reservoir. Primarily a drift-boat river;
-- limited public wading access. Typical productive flows 950-3,500 cfs.
-- Wading difficult above ~1,500 cfs (strong currents, soft bottom); dangerous
-- at 3,000+. Drift boat optimal ~900-3,500 cfs; guides note 5,000+ is dangerous
-- for drift boats (Bighorn Drifters high-water advisory). Sources: Wyoming
-- Anglers, FlyFishBighorn, Bighorn Drifters high-water post.
UPDATE public.rivers
SET wading_threshold_cfs  = 1500,
    drift_optimal_min_cfs = 900,
    drift_optimal_max_cfs = 3500
WHERE slug = 'bighorn-river-thermopolis';

-- ---------------------------------------------------------------------------
-- 3. Boise River at Glenwood Bridge, ID  (tailwater below Arrowrock/Lucky Peak)
-- ---------------------------------------------------------------------------
-- Urban tailwater. Prime wading 300-600 cfs; above 1,000 cfs wading becomes
-- hazardous on slick basalt; 1,000 cfs is the practical wading cap. Drift-boat
-- floats from Barber Park to Glenwood are popular at 1,400-2,500 cfs; above
-- 3,000 the river sweeps log debris and braids become dangerous. Sources: TRR
-- Outfitters real-time flow page, PerfectFly Store, Orvis fishing reports.
UPDATE public.rivers
SET wading_threshold_cfs  = 1000,
    drift_optimal_min_cfs = 1400,
    drift_optimal_max_cfs = 3000
WHERE slug = 'boise-river-boise';

-- ---------------------------------------------------------------------------
-- 4. Clarks Fork Yellowstone near Belfry, MT
-- ---------------------------------------------------------------------------
-- Freestone river; lower valley section (Belfry–Bridger) is Class I, wide,
-- and slow. Wading manageable up to ~800 cfs; above that depth and current
-- limit safe access. Float with small raft/canoe is possible; Class I character
-- suitable 300-2,000 cfs; above 2,500 debris and bank-full conditions.
-- Sources: TotalFlyFishing, MontanaFlyFishingLodge, AllTrips (Belfry section).
UPDATE public.rivers
SET wading_threshold_cfs  = 800,
    drift_optimal_min_cfs = 300,
    drift_optimal_max_cfs = 2000
WHERE slug = 'clarks-fork-yellowstone';

-- ---------------------------------------------------------------------------
-- 5. Clearwater River at Orofino, ID
-- ---------------------------------------------------------------------------
-- Large, high-gradient mainstem steelhead river. Primarily jet-boat/drift-boat
-- fishery. Ideal steelhead-season flows 4,000-7,000 cfs (clear, dropping water
-- in Oct); wading from bank bars is possible at those levels but impractical
-- at 8,000+. Spring peak routinely exceeds 20,000 cfs (unfishable wade).
-- Drift/jet floats work 2,500-12,000 cfs; above 15,000 hazardous for guides.
-- Sources: Clearwater Steelhead Syndicate, HouseOfFly, Jones Sport Fishing.
UPDATE public.rivers
SET wading_threshold_cfs  = 8000,
    drift_optimal_min_cfs = 2500,
    drift_optimal_max_cfs = 12000
WHERE slug = 'clearwater-orofino';

-- ---------------------------------------------------------------------------
-- 6. Green River below Fontenelle Dam, WY  (tailwater)
-- ---------------------------------------------------------------------------
-- Cold, clear tailwater; flows rarely drop below 700 cfs (power/water-supply
-- minimum). Wading is excellent at 700-1,500 cfs on gravel bars. Above
-- ~2,000 cfs wading becomes difficult; above 2,500 unsafe. Drift boats used
-- throughout at 700-3,000 cfs; above 4,000 floating becomes challenging.
-- Sources: Reel Deal Anglers, Rendezvous Anglers, FWS Seedskadee FAQ,
-- WGFD Middle Green River float map.
UPDATE public.rivers
SET wading_threshold_cfs  = 2000,
    drift_optimal_min_cfs = 700,
    drift_optimal_max_cfs = 3500
WHERE slug = 'green-river-fontenelle';

-- ---------------------------------------------------------------------------
-- 7. Gros Ventre River near Kelly, WY
-- ---------------------------------------------------------------------------
-- Small freestone; wading-oriented. NPS prohibits motorized boating on
-- Grand Teton tributaries, and the river is too small/technical for drift
-- boats outside park anyway. Fishes well at 100-400 cfs; above 500 wading
-- becomes hazardous with swift pocket water and difficult crossings.
-- No drift thresholds set (float-fishing not a practical option).
-- Sources: GuideRecommended, TotalFlyFishing, GTNP Foundation.
UPDATE public.rivers
SET wading_threshold_cfs  = 500,
    drift_optimal_min_cfs = NULL,
    drift_optimal_max_cfs = NULL
WHERE slug = 'gros-ventre-jackson';

-- ---------------------------------------------------------------------------
-- 8. Henry's Fork of the Snake at Ashton, ID
-- ---------------------------------------------------------------------------
-- Tailwater from Island Park Reservoir. Box Canyon section: wading difficult
-- above 1,000 cfs (lava-boulder bottom, fast water); hazardous above 1,400.
-- Harriman / Last Chance flat-water section: wading workable to 800 cfs.
-- Use 1,000 cfs as system-wide wading threshold. Drift boats run Box Canyon
-- 400-1,800 cfs; below 400 too rocky, above 2,000 swift/unsafe. Sources:
-- Henry's Fork Anglers, TRR Outfitters, WorldCast Anglers.
UPDATE public.rivers
SET wading_threshold_cfs  = 1000,
    drift_optimal_min_cfs = 400,
    drift_optimal_max_cfs = 1800
WHERE slug = 'henrys-fork-ashton';

-- ---------------------------------------------------------------------------
-- 9. Laramie River near Laramie, WY
-- ---------------------------------------------------------------------------
-- Small freestone (Medicine Bow foothills). Ideal wading 75-300 cfs; above
-- 400 cfs wading becomes difficult; above 600 dangerous for average angler.
-- Small rafts/personal watercraft can be run during spring runoff; suitable
-- drift-boat float range limited but possible at 300-800 cfs; above 1,200
-- dangerous on log-strainer reaches. Sources: FlyGuysNLies, HighPlainsFlyFishing,
-- FourSeasonsAnglers.
UPDATE public.rivers
SET wading_threshold_cfs  = 400,
    drift_optimal_min_cfs = 300,
    drift_optimal_max_cfs = 800
WHERE slug = 'laramie-river-laramie';

-- ---------------------------------------------------------------------------
-- 10. North Platte at Grey Reef, WY  (tailwater below Alcova)
-- ---------------------------------------------------------------------------
-- Trophy Blue Ribbon tailwater. Summer flows 2,000-3,000 cfs; winter 500 cfs.
-- Wading restricted to public access points; comfortable wading below 1,000 cfs;
-- above 1,500 wading is hazardous (swift current, slick substrate). Drift boats
-- optimal 500-3,500 cfs; above 4,000 (flushing flows) too fast for safe fishing
-- floats. Sources: Wyoming Anglers, Grey Reef Anglers, WGFD flushing flow notice.
UPDATE public.rivers
SET wading_threshold_cfs  = 1000,
    drift_optimal_min_cfs = 500,
    drift_optimal_max_cfs = 3500
WHERE slug = 'north-platte-grey-reef';

-- ---------------------------------------------------------------------------
-- 11. North Platte at Miracle Mile, WY  (tailwater below Seminoe/Kortes)
-- ---------------------------------------------------------------------------
-- Primarily public-land wade fishery below Kortes Dam into Pathfinder Reservoir.
-- Most consistent wading below 1,000 cfs; at 2,000+ cfs wading is hazardous.
-- Float trips (raft/drift) viable 500-4,000 cfs; flows can spike to 10,000+
-- during releases (dangerous). Sources: HighPlainsFlyFishing, Grey Reef Anglers
-- float trips page, TravelWyoming, North Platte Lodge reports.
UPDATE public.rivers
SET wading_threshold_cfs  = 1000,
    drift_optimal_min_cfs = 500,
    drift_optimal_max_cfs = 4000
WHERE slug = 'north-platte-miracle-mile';

-- ---------------------------------------------------------------------------
-- 12. Salmon River at Salmon, ID  (mainstem upper)
-- ---------------------------------------------------------------------------
-- Large freestone; too deep/fast to wade across in most sections. Bank-bar
-- wading possible at 600-2,500 cfs; above 3,000 wading becomes unsafe (fast,
-- deep, rocky). Premier drift/float river: 1,500-8,000 cfs optimal for oar
-- boats; above 12,000 (peak runoff) too pushy for safe fishing floats.
-- Sources: DIYFlyFishing, SalmonRiverAnglers, IDFG steelhead reports,
-- IntoFlyFishing (Salmon River guide).
UPDATE public.rivers
SET wading_threshold_cfs  = 2500,
    drift_optimal_min_cfs = 1500,
    drift_optimal_max_cfs = 8000
WHERE slug = 'salmon-river-salmon';

-- ---------------------------------------------------------------------------
-- 13. Shoshone River above Willwood Dam near Cody, WY
-- ---------------------------------------------------------------------------
-- Tailwater below Buffalo Bill Dam. Known for enormous trout density; primarily
-- drift-boat fishery but multiple wade sections. Wading comfortable at 300-800
-- cfs; above 1,200 cfs wading is difficult; above 2,000 hazardous. Drift boats
-- viable 500-3,000 cfs; above 4,000 dangerous (canyon walls, sweepers).
-- Sources: TotalFlyFishing, BuglifeFlyfishing, WyWingsAndWaters, PerfectFlyStore.
UPDATE public.rivers
SET wading_threshold_cfs  = 1200,
    drift_optimal_min_cfs = 500,
    drift_optimal_max_cfs = 3000
WHERE slug = 'shoshone-river-cody';

-- ---------------------------------------------------------------------------
-- 14. Silver Creek near Picabo, ID  (spring creek)
-- ---------------------------------------------------------------------------
-- Slow, spring-fed stream averaging ~100-150 cfs with minimal seasonal variation.
-- Gin-clear; wading throughout most of TNC Preserve possible up to ~250 cfs.
-- Lower preserve sections too deep to wade. Boats/rafts prohibited by regulation
-- in the primary fishing section; float tubes allowed. No drift thresholds.
-- Sources: TNC Silver Creek Preserve, PicaboAngler, IDFG regulations,
-- DIYFlyFishing Silver Creek guide.
UPDATE public.rivers
SET wading_threshold_cfs  = 250,
    drift_optimal_min_cfs = NULL,
    drift_optimal_max_cfs = NULL
WHERE slug = 'silver-creek-picabo';

-- ---------------------------------------------------------------------------
-- 15. Snake River at Jackson, WY  (below Jackson Lake Dam)
-- ---------------------------------------------------------------------------
-- Dam-regulated, braided valley river. Wading best below 1,500 cfs (gravel
-- bar access, clear channels); difficult and hazardous above 2,500 cfs.
-- Late-season wade window often September-October (flows 500-1,200 cfs).
-- Drift boats: guided operations run July-October; optimal 800-5,000 cfs;
-- above 8,000 braided channels and sweepers become very dangerous for row
-- boats. Sources: WanderingAngler, WorldCast Anglers, Grand Teton Fly Fishing,
-- Orvis Snake River reports.
UPDATE public.rivers
SET wading_threshold_cfs  = 2500,
    drift_optimal_min_cfs = 800,
    drift_optimal_max_cfs = 8000
WHERE slug = 'snake-river-jackson';

-- ---------------------------------------------------------------------------
-- 16. South Fork Boise near Featherville, ID  (tailwater below Anderson Dam)
-- ---------------------------------------------------------------------------
-- Narrow canyon tailwater; 30-60 ft wide. Standard drift boats impractical
-- in the canyon (too narrow and rocky); small rafts/catarafts used. Wading
-- excellent 150-800 cfs on clean cobble; above 1,200 cfs wading unsafe.
-- Raft float 300-1,500 cfs; above 2,000 technical/dangerous for fishing float.
-- Sources: FishFlyWater SF Boise guide, IDFG Fishing Planner, TRR Outfitters.
UPDATE public.rivers
SET wading_threshold_cfs  = 1200,
    drift_optimal_min_cfs = 300,
    drift_optimal_max_cfs = 1500
WHERE slug = 'sf-boise-featherville';

-- ---------------------------------------------------------------------------
-- 17. South Fork Snake River below Palisades Dam, ID  (tailwater)
-- ---------------------------------------------------------------------------
-- Large tailwater; quintessential drift-boat river. Irrigation demand drives
-- summer peak 8,000-15,000 cfs (float-only, no safe wading). Wading viable
-- when flows drop to 2,000-4,000 cfs (Sept-Oct, some winter). Wading
-- dangerous above 5,000 cfs. Drift boats: optimal 2,000-12,000 cfs;
-- above 15,000 too swift/dangerous for row-boat fishing. Sources: Lodge at
-- Palisades Creek conditions, TRR Outfitters, WorldCast Anglers SF Snake.
UPDATE public.rivers
SET wading_threshold_cfs  = 5000,
    drift_optimal_min_cfs = 2000,
    drift_optimal_max_cfs = 12000
WHERE slug = 'sf-snake-palisades';

-- ---------------------------------------------------------------------------
-- 18. Teton River near Newdale, ID
-- ---------------------------------------------------------------------------
-- Meandering meadow river; narrow willow-lined channels. Feels like a spring
-- creek. Wading ideal 150-400 cfs; above 500 wading becomes difficult (deep
-- bends, soft banks); above 700 dangerous. Small drift boats/pontoons possible
-- at 200-600 cfs; overhanging willows and logjams make standard drift boats
-- impractical. Set conservative thresholds for small-watercraft float.
-- Sources: TRR Outfitters Teton River page, WildWaterFlyFishing, WorldCast
-- Anglers Teton River guide, TetonSpringsLodge blog.
UPDATE public.rivers
SET wading_threshold_cfs  = 500,
    drift_optimal_min_cfs = 200,
    drift_optimal_max_cfs = 600
WHERE slug = 'teton-river-newdale';

-- ---------------------------------------------------------------------------
-- 19. Wind River near Riverton, WY
-- ---------------------------------------------------------------------------
-- Below Boysen Reservoir: tailwater canyon with 2,000-2,850 trout/mile.
-- Canyon section accessed by raft (some Class II rapids). Wading from bank
-- bars possible 500-1,500 cfs; dangerous above 2,000 cfs (canyon walls,
-- no egress). WGFD instream-flow study documented 102-110 cfs minimum for
-- trout survival. Drift/raft float: 500-3,500 cfs optimal; above 5,000
-- dangerous for fishing boats. Sources: WGFD Wind River Instream Flow Study,
-- WindRiverCanyon.com, TotalFlyFishing, EcoAngler.
UPDATE public.rivers
SET wading_threshold_cfs  = 2000,
    drift_optimal_min_cfs = 500,
    drift_optimal_max_cfs = 3500
WHERE slug = 'wind-river-riverton';

-- ---------------------------------------------------------------------------
-- 20. Gallatin River near Gallatin Gateway, MT
-- ---------------------------------------------------------------------------
-- Wading threshold already set at 400 cfs (pre-existing data).
-- Only setting drift thresholds here for the lower 12-mile floatable section.
-- Drift boat optimal 400-800 cfs; below 300 too shallow, above 1,000 swift
-- with strainer risk; above 1,500 dangerous for row boats. Source: Gallatin
-- River Guides, FlyFishingBozeman.com float guide, OutsideBozeman "In the Flow".
UPDATE public.rivers
SET drift_optimal_min_cfs = 400,
    drift_optimal_max_cfs = 1000
WHERE slug = 'gallatin-gateway';
