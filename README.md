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

- **Primary view:** `public.v_today_fishability_canonical`
- **Fallback:** `public.v_today_fishability`
- **River geometry (optional):** `public.river_geoms` (river_id, geom GeoJSON)

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
