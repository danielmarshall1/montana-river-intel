/**
 * Fetch NHD HR flowline geometries for Idaho and Wyoming rivers.
 *
 * Strategy:
 *   - POST to NHDPlus_HR MapServer layer 3 with a BBOX spatial filter (fast, reliable)
 *   - Filter results by GNIS_Name in JS (name+spatial WHERE combo times out server-side)
 *   - Paginate using resultOffset for large bounding boxes (2000 record limit)
 *   - Merge all paths into a GeoJSON MultiLineString
 *   - Write a SQL migration that upserts river_geometries
 *
 * Run: npx tsx scripts/fetchNhdGeometries.ts
 */

import "dotenv/config";
import { writeFileSync } from "fs";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const NHD_BASE =
  "https://hydro.nationalmap.gov/arcgis/rest/services/NHDPlus_HR/MapServer/3/query";

// NHD FCode notes:
//   46006 = perennial stream (small tributaries)
//   46003 = intermittent stream
//   55800 = StreamRiver ArtificialPath (main channel of large rivers — this is the
//           dominant code for all navigable mainstem rivers in NHDPlus_HR)
// We match by GNIS_Name only; no FCode filter, so we capture mainstems regardless.

interface RiverConfig {
  slug: string;
  nhd_name: string;       // GNIS_Name in NHD (exact match)
  bbox: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
}

const RIVERS: RiverConfig[] = [
  // ── Idaho ──────────────────────────────────────────────────────────────────
  {
    slug: "henrys-fork-ashton",
    nhd_name: "Henrys Fork",
    bbox: [-111.80, 43.90, -111.30, 44.70],
  },
  {
    slug: "sf-snake-palisades",
    nhd_name: "South Fork Snake River",
    bbox: [-111.95, 43.20, -111.00, 43.80],
  },
  {
    slug: "silver-creek-picabo",
    nhd_name: "Silver Creek",
    bbox: [-114.45, 43.20, -113.85, 43.55],
  },
  {
    slug: "clearwater-orofino",
    nhd_name: "Clearwater River",
    bbox: [-117.10, 45.95, -115.65, 46.65],
  },
  {
    slug: "salmon-river-salmon",
    nhd_name: "Salmon River",
    bbox: [-115.50, 44.00, -113.40, 45.55],
  },
  {
    slug: "sf-boise-featherville",
    nhd_name: "South Fork Boise River",
    bbox: [-116.00, 43.50, -114.85, 44.10],
  },
  {
    slug: "big-wood-hailey",
    nhd_name: "Big Wood River",
    bbox: [-115.00, 43.25, -114.10, 44.10],
  },
  {
    slug: "teton-river-newdale",
    nhd_name: "Teton River",
    bbox: [-111.85, 43.50, -110.95, 44.10],
  },
  {
    slug: "boise-river-boise",
    nhd_name: "Boise River",
    bbox: [-116.75, 43.50, -115.85, 43.80],
  },

  // ── Wyoming ────────────────────────────────────────────────────────────────
  {
    slug: "north-platte-grey-reef",
    nhd_name: "North Platte River",
    bbox: [-107.10, 42.10, -106.20, 42.95],
  },
  {
    slug: "north-platte-miracle-mile",
    nhd_name: "North Platte River",
    bbox: [-107.10, 42.05, -106.60, 42.55],
  },
  {
    slug: "snake-river-jackson",
    nhd_name: "Snake River",
    bbox: [-111.20, 43.00, -110.30, 44.10],
  },
  {
    slug: "green-river-fontenelle",
    nhd_name: "Green River",
    bbox: [-110.50, 41.30, -109.20, 42.25],
  },
  {
    slug: "wind-river-riverton",
    nhd_name: "Wind River",
    bbox: [-110.05, 42.95, -107.80, 43.70],
  },
  {
    slug: "shoshone-river-cody",
    nhd_name: "Shoshone River",
    bbox: [-109.55, 44.30, -108.30, 44.95],
  },
  {
    slug: "bighorn-river-thermopolis",
    nhd_name: "Bighorn River",
    bbox: [-108.45, 43.40, -107.75, 44.25],
  },
  {
    slug: "laramie-river-laramie",
    nhd_name: "Laramie River",
    bbox: [-106.20, 40.95, -104.85, 41.75],
  },
  {
    slug: "gros-ventre-jackson",
    nhd_name: "Gros Ventre River",
    bbox: [-110.95, 43.50, -110.05, 43.85],
  },
  {
    slug: "clarks-fork-yellowstone",
    nhd_name: "Clarks Fork Yellowstone River",
    bbox: [-110.10, 44.50, -108.50, 45.65],
  },
];

// ── NHD fetch via bbox POST (fast & reliable) ─────────────────────────────

interface NhdFeature {
  geometry: { paths: [number, number][][] };
  attributes: { gnis_name: string | null; fcode: number; lengthkm: number };
}

async function fetchByBbox(
  bbox: [number, number, number, number],
  nhd_name: string,
  offset: number
): Promise<{ features: NhdFeature[]; exceeded: boolean }> {
  const [minLon, minLat, maxLon, maxLat] = bbox;

  const body = new URLSearchParams({
    geometry: JSON.stringify({ xmin: minLon, ymin: minLat, xmax: maxLon, ymax: maxLat }),
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "GNIS_Name,FCode",
    returnGeometry: "true",
    outSR: "4326",
    geometryPrecision: "6",
    resultRecordCount: "2000",
    resultOffset: String(offset),
    f: "json",
  });

  const res = await fetch(NHD_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as {
    features?: NhdFeature[];
    exceededTransferLimit?: boolean;
    error?: { message: string };
  };

  if (data.error) throw new Error(data.error.message);

  // Filter by name only — major rivers use FCode 55800 (ArtificialPath), not 46006
  const filtered = (data.features ?? []).filter(
    (f) => f.attributes?.gnis_name === nhd_name
  );

  return { features: filtered, exceeded: data.exceededTransferLimit ?? false };
}

async function fetchNhdSegments(
  cfg: RiverConfig
): Promise<[number, number][][]> {
  const allPaths: [number, number][][] = [];
  let offset = 0;
  let page = 0;

  while (true) {
    let result: { features: NhdFeature[]; exceeded: boolean };
    try {
      result = await fetchByBbox(cfg.bbox, cfg.nhd_name, offset);
    } catch (err) {
      const isTimeout =
        err instanceof Error && err.message.includes("timeout");
      if (isTimeout && page === 0) {
        // First page timeout — skip this river
        process.stdout.write(`TIMEOUT`);
        return [];
      }
      console.warn(`  warn: page ${page} fetch error:`, err);
      break;
    }

    for (const f of result.features) {
      const paths = f.geometry?.paths ?? [];
      allPaths.push(...paths);
    }

    page++;
    if (!result.exceeded) break;
    offset += 2000;
    await new Promise((r) => setTimeout(r, 400));
  }

  return allPaths;
}

// ── Supabase helpers ───────────────────────────────────────────────────────

async function getRiverIdBySlug(slug: string): Promise<string | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/rivers?slug=eq.${encodeURIComponent(slug)}&select=id`,
    {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
    }
  );
  const rows = (await res.json()) as { id: string }[];
  return rows[0]?.id ?? null;
}

// ── SQL generation ─────────────────────────────────────────────────────────

function buildInsertTuple(river_id: string, paths: [number, number][][]): string {
  const geojson = JSON.stringify({ type: "MultiLineString", coordinates: paths });
  const escaped = geojson.replace(/'/g, "''");
  return (
    `  ('${river_id}'::uuid,\n` +
    `   ST_SetSRID(ST_GeomFromGeoJSON('${escaped}'), 4326))`
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const sqlTuples: string[] = [];
  const summary: Record<string, string> = {};

  for (const cfg of RIVERS) {
    process.stdout.write(`${cfg.slug} (${cfg.nhd_name})... `);

    const paths = await fetchNhdSegments(cfg);
    const totalPts = paths.reduce((s, p) => s + p.length, 0);

    if (paths.length === 0) {
      console.log(` — 0 paths`);
      summary[cfg.slug] = "NO_DATA";
      continue;
    }

    const river_id = await getRiverIdBySlug(cfg.slug);
    if (!river_id) {
      console.log(` — slug not in DB`);
      summary[cfg.slug] = "NO_DB_ROW";
      continue;
    }

    console.log(`${paths.length} segs / ${totalPts} pts`);
    summary[cfg.slug] = `${paths.length} segs / ${totalPts} pts`;
    sqlTuples.push(`  -- ${cfg.slug}\n` + buildInsertTuple(river_id, paths));

    await new Promise((r) => setTimeout(r, 300));
  }

  if (sqlTuples.length === 0) {
    console.error("\nNo rivers fetched — migration not written.");
    process.exit(1);
  }

  const ts = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "").slice(0, 12);
  const migFile = `supabase/migrations/${ts}0000_nhd_idaho_wyoming_geometries.sql`;

  const sql = `-- NHD HR flowline geometries for Idaho and Wyoming rivers
-- Generated: ${new Date().toISOString()}
-- Source: NHDPlus_HR MapServer layer 3, FCode 46006 (perennial), bbox-filtered per river
--
-- Replaces the low-quality 5-8 point placeholder geometries with real NHD centerlines.

INSERT INTO public.river_geometries (river_id, geom)
VALUES
${sqlTuples.join(",\n")}
ON CONFLICT (river_id) DO UPDATE
  SET geom = EXCLUDED.geom,
      updated_at = now();
`;

  writeFileSync(migFile, sql, "utf8");

  console.log("\n── Summary ──────────────────────────────────────────────────");
  for (const [slug, status] of Object.entries(summary)) {
    console.log(`  ${slug}: ${status}`);
  }
  console.log(`\nWritten: ${migFile}`);
  console.log(
    "Push:    npx supabase migration repair --status reverted 20260413 && npx supabase db push --linked --include-all"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
