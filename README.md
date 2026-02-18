# Montana River Intel

Map-first outdoor intelligence platform for Montana rivers. Premium, data-forward design inspired by OnX.

## Tech Stack

- **Next.js 14+** (App Router) with TypeScript
- **TailwindCSS** for styling
- **Supabase** for data
- **Mapbox GL JS** (fallback to MapLibre when token is missing)

## Setup

1. **Clone and install**

   ```bash
   npm install
   ```

2. **Environment variables**

   Copy `.env.local.example` to `.env.local` and fill in:

   ```bash
   cp .env.local.example .env.local
   ```

   - `NEXT_PUBLIC_SUPABASE_URL` – your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` – Supabase anon/public key
   - `NEXT_PUBLIC_MAPBOX_TOKEN` – (optional) Mapbox token for better map tiles; falls back to MapLibre if not set

3. **Run development server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Data

- **Primary list/map view:** `public.v_river_latest`
- **Selected river detail view:** `public.v_river_detail`
- **Mini-chart RPC (14 day):** `public.river_history_14d(p_river_id bigint)`
- **Health/Audit views:** `public.v_river_health`, `public.v_usgs_pull_log`
- **River geometry RPC:** `public.get_river_geojson_by_slug(p_slug text)`

Core normalized table:

- `public.river_daily` (one row per river per date; source timestamps + parameter codes + payload summary for auditability)

USGS ingestion logs:

- `public.usgs_pull_runs`
- `public.usgs_pull_sites`

If Supabase env vars are missing, the app uses mocked data.

## PAI Reports

PAI (Publicly Available Information) Reports aggregate fly shop fishing reports and newsletters from public RSS feeds and HTML pages.

### Environment

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server only, for ingest API; never exposed to client)

### Add sources

```sql
insert into public.pai_sources (shop_name, source_type, url) values
  ('Example Fly Shop', 'rss', 'https://example.com/feed.xml'),
  ('Another Shop', 'html', 'https://anothershop.com/reports');
```

### Run ingestion

```bash
curl -X POST http://localhost:3000/api/ingest/pai
```

Or from a cron job. Response includes `inserted`, `skipped`, `errors`, and `bySource`.

### Features

- **Rate limit:** Max 1 request per domain per minute
- **robots.txt:** Best-effort respect (skips if disallowed)
- **Upsert:** Updates only when title or excerpt changed
- **UI:** `/reports` – filter by river, shop, 7/30/90 day range; cards link to original sources

## Scripts

- `npm run dev` – Start dev server
- `npm run build` – Production build
- `npm run start` – Start production server
- `npx tsx scripts/ingestDaily.ts` – Daily data ingestion

## USGS Edge Function Ingestion

1. Apply latest migration in Supabase SQL editor:

```sql
-- file:
-- supabase/migrations/20260217090000_core_data_model_and_usgs_audit.sql
```

2. Deploy function:

```bash
supabase functions deploy usgs-ingest
```

3. Invoke once manually:

```bash
supabase functions invoke usgs-ingest --method POST
```

4. Verify:

```sql
-- file:
-- supabase/sql/verify_usgs_backend.sql
```

### Hourly Auto-Refresh (USGS + Weather)

Run this once in Supabase SQL editor:

```sql
-- file:
-- supabase/sql/setup_hourly_ingest_schedule.sql
```

This schedules:

- `usgs-ingest` at minute `05` each hour
- `weather-ingest` at minute `12` each hour

The UI shows pull freshness in the top bar (`Last pull ... MT`) and in selected river details (`Updated ... MT`).

## Map Layers Configuration

Layers are defined in one place:

- `src/map/layers/registry.ts`

The registry is the single source of truth for:

- Basemap options
- Layer groups (`Public Lands`, `Access`, `MRI Overlays`)
- Layer defaults
- Source metadata and map layer ids
- Optional UI hints (`comingSoon`, `minZoomNote`)

Layer UI state is persisted in localStorage using `mri.layers.v2`.

### Add a new overlay

1. Add a typed entry in `src/map/layers/registry.ts` to `LAYER_REGISTRY`.
2. Give it a unique `id`, `group`, `defaultOn`, `source`, and `layers`.
3. Implement sync behavior in `components/MapView.tsx` (add/remove layer without map re-init).
4. The Layers panel in `components/OnxShell.tsx` renders it automatically from the registry.

## Seasonal Intel Placeholder

The current Seasonal Intel panel is UI-first and uses lightweight month-based logic:

- `lib/seasonalIntel.ts`

Output includes:

- Season label
- Likely bugs
- Recommended approach

This is intentionally simple and can be replaced later with hatch-probability modeling without changing panel structure.
