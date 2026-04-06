# Montana River Intelligence Handoff

This package is a source-level handoff for `/Users/daniel/montana-river-v2`.

Included alongside this file:
- `FOLDER_STRUCTURE.txt`: source tree file list
- `ACTIVE_RIVERS.json`: active river rows from Supabase at export time
- `montana-river-intelligence-source-2026-04-06.tgz`: source archive

Not included in the archive:
- `.git`
- `node_modules`
- `.next`
- local secret env files (`.env`, `.env.local`)

Use `.env.local.example` as the env template.

## Stack

- Next.js App Router
- TypeScript
- Mapbox GL JS
- Supabase Postgres + Edge Functions
- USGS NWIS for hydrology and water temperature
- Open-Meteo-backed weather ingest
- PostGIS-backed river geometries

## High-Level Data Flow

1. USGS ingest:
   - Edge function: `supabase/functions/usgs-ingest/index.ts`
   - Pulls USGS IV time-series parameters:
     - `00060` flow
     - `00010` water temperature
     - `00065` gage height
   - Falls back to USGS DV temperature where needed.
   - Writes daily/intraday observations into `river_daily` and related temp/source fields.
   - Uses `river_usgs_map_roles` to determine active flow/temp/stage/aux stations.

2. Weather ingest:
   - Edge function: `supabase/functions/weather-ingest/index.ts`
   - Pulls Open-Meteo hourly and daily data by river lat/lon.
   - Writes `weather_daily` rows keyed by `(river_id, date)`.
   - Current implementation targets Mountain-local `today`, `day+1`, `day+2`, `day+3`.

3. Scoring:
   - Core SQL function: `public.compute_river_daily_scores`
   - Defined in `supabase/migrations/20260221164000_temp_source_decoupling_and_ranking.sql`
   - Populates `river_daily` score columns:
     - `flow_score`
     - `stability_score`
     - `thermal_score`
     - `wind_penalty`
     - `precip_penalty`
     - `fishability_score`
     - `bite_tier`

4. Product-facing views:
   - `v_river_detail`
   - `v_river_latest`
   - `v_river_detail_analytics`
   - Latest forecast retrieval fix is in:
     - `supabase/migrations/20260328150000_forecast_row_retrieval_fix.sql`

5. Frontend fetch:
   - Homepage: `app/page.tsx`
   - Main client shell: `components/OnxShell.tsx`
   - Data fetchers: `lib/supabase.ts`, `lib/supabase-server.ts`
   - Detailed analytics builder: `lib/riverAnalytics.ts`

6. Map rendering:
   - Main map: `components/MapView.tsx`
   - Layer registry/toggles: `src/map/layers/registry.ts`
   - River lines come from `river_geometries` joined via `lib/supabase-server.ts`
   - Active USGS station markers come through `fetchActiveStationGeojsonByRiverIds` in `lib/supabase.ts`

## Fishability Scoring Formula

Authoritative source:
- `supabase/migrations/20260221164000_temp_source_decoupling_and_ranking.sql`

Intermediate parts:

1. Flow ratio base:
- `ratio = coalesce(flow_ratio, 1.0)`

2. 48h flow change base:
- `chg = coalesce(change_48h_pct, 0.0)`

3. Weather bases:
- `wind = coalesce(wind_pm_mph, wind_am_mph, weather wind, 0.0)`
- `precip = coalesce(precip_mm, 0.0)`

4. Component scores:
- `flow_score = clamp(100 - abs(ratio - 1.0) * 80, 0, 100)`
- `stability_score = clamp(100 - abs(chg) * 1.2, 0, 100)`
- `thermal_score`:
  - `null` if temp missing
  - `40` if temp `< 34F`
  - `clamp(100 - abs(temp - 56) * 2.2, 0, 100)` if `34F <= temp <= 68F`
  - `clamp(60 - (temp - 68) * 4, 0, 100)` if `temp > 68F`

5. Penalties:
- `wind_penalty`
  - `0` if wind `<= 8`
  - `5` if wind `<= 15`
  - `12` if wind `<= 22`
  - `20` otherwise
- `precip_penalty`
  - `15` if precip `>= 12`
  - `8` if precip `>= 6`
  - `3` if precip `>= 2`
  - `0` otherwise

6. Weights:
- `flow_score * 0.45`
- `stability_score * 0.25`
- `thermal_score * 0.30` when thermal exists

7. Final score:
- `weighted_sum = flow*0.45 + stability*0.25 + thermal*0.30`
- `weighted_den = 0.45 + 0.25 + 0.30` when thermal exists, otherwise `0.45 + 0.25`
- `fishability_score = clamp(round((weighted_sum / weighted_den) - wind_penalty - precip_penalty), 0, 100)`

8. Bite tier:
- `HOT` if `fishability_score >= 85`
- `GOOD` if `>= 70`
- `FAIR` if `>= 55`
- `TOUGH` otherwise

## Active River Gauge IDs At Export Time

From `ACTIVE_RIVERS.json`:

1. Big Hole River, near Melrose, `06025500`
2. Bighorn River, at bridge, at St. Xavier, `06287800`
3. Bitterroot River, near Missoula, `12352500`
4. Blackfoot River, near Bonner, `12340000`
5. Clark Fork, at St. Regis, `12354500`
6. Flathead River, at Columbia Falls, `12363000`
7. Gallatin River, near Gallatin Gateway, `06043500`
8. Jefferson River, near Three Forks, `06036650`
9. Kootenai River, below Libby Dam near Libby, `12301933`
10. Kootenai River, at Libby, `12303000`
11. Madison River, near West Yellowstone, `06037500`
12. Marias River, near Chester, `06101500`
13. Missouri River, at Toston, `06054500`
14. North Fork Flathead River, near Columbia Falls, `12355500`
15. Rock Creek, near Clinton, `12334510`
16. Yellowstone River, near Livingston, `06192500`
17. Yellowstone River, at Corwin Springs, `06191500`

## Mapbox Configuration

Primary map implementation:
- `components/MapView.tsx`

Basemap styles:
- `hybrid: mapbox://styles/mapbox/satellite-streets-v12`
- `satellite: mapbox://styles/mapbox/satellite-v9`
- `topo: mapbox://styles/mapbox/outdoors-v12`
- `light: mapbox://styles/mapbox/light-v11`
- `dark: mapbox://styles/mapbox/dark-v11`

Map defaults:
- center: `[-109.75, 47.05]`
- bounds: `[[-116.15, 44.25], [-103.85, 49.2]]`
- default zoom: `6.15`

Key runtime layer IDs:
- `all-rivers-source`
- `rivers-casing`
- `rivers-base`
- `rivers-hit`
- `rivers-selected`
- `active-usgs-stations-source`
- `active-usgs-stations-layer`

Terrain:
- DEM source: `mapbox://mapbox.mapbox-terrain-dem-v1`

Env:
- `NEXT_PUBLIC_MAPBOX_TOKEN`

Legacy note:
- There are older `maplibre` references in backups and registry defaults, but active map runtime is `mapbox-gl`.

## Key Files By Responsibility

Frontend app shell:
- `app/page.tsx`
- `components/OnxShell.tsx`
- `components/MapView.tsx`
- `app/globals.css`

Data access:
- `lib/supabase.ts`
- `lib/supabase-server.ts`
- `lib/supabaseClient.ts`
- `lib/supabaseBrowser.ts`
- `lib/types.ts`

Analytics:
- `lib/riverAnalytics.ts`
- `lib/scoreBreakdown.ts`
- `lib/todaysRead.ts`
- `lib/riskFlags.ts`
- `lib/seasonalIntel.ts`
- `lib/trend.ts`

Supabase / SQL:
- `supabase/migrations/*.sql`
- `supabase/sql/*.sql`

Ingest:
- `supabase/functions/usgs-ingest/index.ts`
- `supabase/functions/weather-ingest/index.ts`
- `scripts/*.ts`

## Practical Pickup Order For A New Developer

1. Read `README.md`
2. Read this handoff doc
3. Inspect `app/page.tsx`, `components/OnxShell.tsx`, `components/MapView.tsx`
4. Inspect `lib/supabase.ts`, `lib/supabase-server.ts`, `lib/riverAnalytics.ts`
5. Read scoring SQL in `20260221164000_temp_source_decoupling_and_ranking.sql`
6. Read latest analytics migrations:
   - `20260328143000_detail_analytics_enrichment.sql`
   - `20260328150000_forecast_row_retrieval_fix.sql`
7. Read ingest functions:
   - `supabase/functions/usgs-ingest/index.ts`
   - `supabase/functions/weather-ingest/index.ts`

## Known Operational Notes

- Local dev often needs `npm run dev:reset`
- `npm run build` is the fastest truth source for code health
- Forecast weather rows require `weather_daily` future rows for `day+1/+2/+3`
- Detailed analytics depend on the newer analytics migrations being applied in Supabase
