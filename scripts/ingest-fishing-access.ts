// scripts/ingest-fishing-access.ts
//
// Fetches Montana FWP fishing access sites from the ArcGIS FeatureServer,
// upserts each point into fishing_access_sites with its PostGIS geometry.
//
// Usage:
//   npx tsx scripts/ingest-fishing-access.ts

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const FWP_URL =
  "https://fwp-gis.mt.gov/arcgis/rest/services/fwplnd/fwpLands/MapServer/1/query" +
  "?where=1%3D1&outFields=NAME&returnGeometry=true&f=geojson";

type GeoJSONFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: {
    type: string;
    coordinates: number[];
  };
};

type GeoJSONCollection = {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
};

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment");
    process.exit(1);
  }

  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("Fetching FWP fishing access sites…");
  const resp = await fetch(FWP_URL);
  if (!resp.ok) {
    console.error(`FWP API error: HTTP ${resp.status} ${resp.statusText}`);
    process.exit(1);
  }

  const data = (await resp.json()) as GeoJSONCollection;
  const features = data.features ?? [];
  console.log(`  ${features.length} features received`);

  type AccessRow = {
    name: string;
    lat: number;
    lng: number;
    geom: string; // WKT for PostGIS via RPC; handled below via raw SQL expression
    source: string;
  };

  // Build rows — skip non-Point or missing coordinates
  const rows: Array<{ name: string; lat: number; lng: number; source: string }> = [];
  let skipped = 0;

  for (const f of features) {
    if (f.geometry?.type !== "Point") { skipped++; continue; }
    const [lng, lat] = f.geometry.coordinates;
    if (lng == null || lat == null || !Number.isFinite(lng) || !Number.isFinite(lat)) {
      skipped++;
      continue;
    }
    const name = String(f.properties?.NAME ?? f.properties?.name ?? "").trim();
    if (!name) { skipped++; continue; }
    rows.push({ name, lat, lng, source: "fwp" });
  }

  console.log(`  ${rows.length} valid Point features, ${skipped} skipped`);

  if (rows.length === 0) {
    console.log("Nothing to insert.");
    return;
  }

  // Upsert in batches of 500 using rpc so we can pass geom as an expression.
  // Supabase doesn't support SQL expressions in .from().insert(), so we use
  // a direct SQL query via the management API pattern instead.
  // Strategy: insert name/lat/lng/source, then UPDATE geom from lat/lng.
  const BATCH = 500;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);

    // Insert without geom first (geom has NOT NULL — we'll use a temp workaround:
    // insert with geom computed from lat/lng via rpc call)
    // Use the PostgREST RPC to run a raw insert that includes the geom expression.
    // We pass rows as JSON and let a plpgsql function handle the ST_MakePoint.
    // Fallback: use .from() with geom as a pre-built WKT string that PostgREST
    // will cast to geometry via the column type.

    // WKT POINT(lng lat) is accepted by PostGIS geography/geometry columns.
    const insertRows = batch.map((r) => ({
      name: r.name,
      lat: r.lat,
      lng: r.lng,
      geom: `SRID=4326;POINT(${r.lng} ${r.lat})`,
      source: r.source,
    }));

    const { error, count } = await sb
      .from("fishing_access_sites")
      .upsert(insertRows, { onConflict: "name,lat,lng", ignoreDuplicates: false })
      .select("id", { count: "exact", head: true });

    if (error) {
      console.error(`  Batch ${i / BATCH + 1} error:`, error.message);
      // Continue — report at end
    } else {
      inserted += count ?? batch.length;
      process.stdout.write(`\r  Upserted ${inserted}/${rows.length}…`);
    }
  }

  console.log(`\nDone. ${inserted} rows upserted into fishing_access_sites.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
