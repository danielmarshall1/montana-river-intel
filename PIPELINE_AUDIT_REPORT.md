# Supabase → Rivers → river_daily_scores → Map Pipeline Audit Report

## PHASE 1 — Database Verification

### 1. rivers row count
**17 rows**

### 2. coordinates
- `lat`/`lng` columns: **NOT populated**
- `latitude`/`longitude` columns: **populated** ✓

**Action taken:** Standardized on `latitude` / `longitude`. Frontend uses these.

### 3. scores row count
**20+ rows** (from river_daily_scores)

### Actual schema (discovered)
- **rivers**: `id` (uuid), `slug`, `river_name`, `gauge_label`, `usgs_site_no`, `latitude`, `longitude`, `is_active` — **no** `river` or `lat`/`lng` columns
- **river_daily_scores**: `river_id` (uuid, references rivers.id), `date`, `fishability_score`, `flow_cfs`, `bite_tier`, etc. — **no** `river` text column

## PHASE 2 — RLS

Migration added: `supabase/migrations/20250217000000_rivers_scores_rls.sql`

- `rivers`: `Allow public read rivers` policy
- `river_daily_scores`: `Allow public read scores` policy

Run: `supabase db push` or apply migration.

## PHASE 3 — Frontend Data Audit

### Changes made
1. **Select columns** updated to match schema:
   - rivers: `id, slug, river_name, gauge_label, usgs_site_no, latitude, longitude`
   - river_daily_scores: `river_id, date, fishability_score, flow_cfs, change_48h_pct, water_temp_f, wind_am_mph, wind_pm_mph, bite_tier, median_flow_cfs, flow_ratio`

2. **Join logic**: Join by `rivers.id` = `river_daily_scores.river_id` (not by river name or usgs_site_no)

3. **Debug logging**: `console.log("[fetchRiversWithLatest] RIVERS:", rivers.length, rivers)` and `SCORES:` added — check **server terminal** (not browser) when the page loads.

## PHASE 4 — Map Render Validation

- `setLngLat([lng, lat])` — coordinates use **[longitude, latitude]** ✓
- Uses `river.longitude` / `river.latitude` (or `river.lng` / `river.lat`) when present
- Fallback: `RIVER_FOCUS_POINTS[river.river_id]` for mock/legacy data

## PHASE 5 — Auto Fit

After markers are created:
```ts
const bounds = new maplibregl.LngLatBounds();
// ... extend for each river
map.fitBounds(bounds, { padding: 40 });
```

## How to verify

1. **Run verification script:**
   ```bash
   npx tsx scripts/verifySupabasePipeline.ts
   ```

2. **Start dev server, load page:**
   - Check server terminal for `[fetchRiversWithLatest] RIVERS:` and `SCORES:` logs
   - If arrays are empty → RLS or table schema issue
   - If arrays contain data → map should render markers

3. **Browser:**
   - Map should fit bounds to all markers
   - Markers should be clickable
   - Popups show river name + score

## Summary

| Item                  | Status                                |
|-----------------------|----------------------------------------|
| rivers row count      | 17                                     |
| scores row count      | 20+                                    |
| Frontend fetch        | Returns merged array (rivers + scores) |
| Markers render        | Expected when fetch returns data       |
| Console errors        | None observed                          |
