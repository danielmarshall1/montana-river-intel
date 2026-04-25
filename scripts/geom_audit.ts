/**
 * scripts/geom_audit.ts
 *
 * Geometry centroid audit for ID/WY rivers.
 * Fetches rivers + river_geometries via REST API, computes client-side
 * centroids, and reports distance between gauge coordinates and geometry centroid.
 *
 * Usage:
 *   npx ts-node scripts/geom_audit.ts
 */

import * as fs from "fs";
import * as path from "path";

// ─── Load env ────────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) throw new Error(".env.local not found");
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  const env: Record<string, string> = {};
  for (const line of lines) {
    const m = line.match(/^([^#=]+)=(.+)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env["SUPABASE_URL"];
const SERVICE_KEY = env["SUPABASE_SERVICE_ROLE_KEY"];

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
}

// ─── REST helpers ─────────────────────────────────────────────────────────────
async function apiGet(path: string): Promise<any[]> {
  const url = SUPABASE_URL + path;
  const res = await fetch(url, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────
interface GeoJSON {
  type: string;
  coordinates: any;
}

function centroidOfGeom(geom: GeoJSON): { lat: number; lon: number } | null {
  let allCoords: [number, number][] = [];

  if (geom.type === "MultiLineString") {
    for (const path of geom.coordinates as [number, number][][]) {
      allCoords.push(...path);
    }
  } else if (geom.type === "LineString") {
    allCoords = geom.coordinates as [number, number][];
  } else {
    return null;
  }

  if (allCoords.length === 0) return null;

  const avgLon = allCoords.reduce((s, c) => s + c[0], 0) / allCoords.length;
  const avgLat = allCoords.reduce((s, c) => s + c[1], 0) / allCoords.length;
  return { lat: avgLat, lon: avgLon };
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dlat = toRad(lat2 - lat1);
  const dlon = toRad(lon2 - lon1);
  const a =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dlon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function geomBbox(geom: GeoJSON): { minLat: number; maxLat: number; minLon: number; maxLon: number } | null {
  let allCoords: [number, number][] = [];
  if (geom.type === "MultiLineString") {
    for (const path of geom.coordinates as [number, number][][]) allCoords.push(...path);
  } else if (geom.type === "LineString") {
    allCoords = geom.coordinates as [number, number][];
  } else return null;
  if (!allCoords.length) return null;
  return {
    minLat: Math.min(...allCoords.map((c) => c[1])),
    maxLat: Math.max(...allCoords.map((c) => c[1])),
    minLon: Math.min(...allCoords.map((c) => c[0])),
    maxLon: Math.max(...allCoords.map((c) => c[0])),
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("Fetching ID/WY rivers…");
  const rivers = await apiGet(
    "/rest/v1/rivers?select=id,river_name,state,slug,latitude,longitude&state=in.(ID,WY)&order=state,river_name"
  );
  console.log(`  ${rivers.length} rivers found`);

  const riverMap = new Map(rivers.map((r) => [r.id, r]));
  const riverIds = rivers.map((r) => r.id).join(",");

  console.log("Fetching river_geometries…");
  const geoms = await apiGet(
    `/rest/v1/river_geometries?river_id=in.(${riverIds})&select=river_id,geom`
  );
  console.log(`  ${geoms.length} geometry records found`);

  const geomMap = new Map(geoms.map((g) => [g.river_id, g.geom]));

  // ── Table header
  console.log("\n" + "─".repeat(120));
  console.log(
    "River".padEnd(42) +
      "St".padEnd(4) +
      "Gauge Lat".padStart(10) +
      "Gauge Lon".padStart(11) +
      "Geom Lat".padStart(10) +
      "Geom Lon".padStart(10) +
      "Dist km".padStart(9) +
      "  Status"
  );
  console.log("─".repeat(120));

  const flagged: Array<{
    name: string;
    state: string;
    distKm: number;
    gaugeLat: number;
    gaugeLon: number;
    geomLat: number;
    geomLon: number;
    withinBbox: boolean;
  }> = [];

  const noGeom: string[] = [];

  for (const river of rivers) {
    const geom = geomMap.get(river.id);
    if (!geom) {
      noGeom.push(river.slug);
      console.log(`  ${river.river_name.padEnd(40)} ${river.state}  [NO GEOMETRY]`);
      continue;
    }

    const centroid = centroidOfGeom(geom);
    if (!centroid) {
      console.log(`  ${river.river_name.padEnd(40)} ${river.state}  [BAD GEOM TYPE: ${geom.type}]`);
      continue;
    }

    const distKm = haversineKm(river.latitude, river.longitude, centroid.lat, centroid.lon);
    const status = distKm <= 50 ? "OK" : "FAR";

    if (distKm > 50) {
      const bbox = geomBbox(geom);
      const withinBbox = bbox
        ? river.latitude >= bbox.minLat - 0.5 &&
          river.latitude <= bbox.maxLat + 0.5 &&
          river.longitude >= bbox.minLon - 0.5 &&
          river.longitude <= bbox.maxLon + 0.5
        : false;
      flagged.push({
        name: river.river_name,
        state: river.state,
        distKm,
        gaugeLat: river.latitude,
        gaugeLon: river.longitude,
        geomLat: centroid.lat,
        geomLon: centroid.lon,
        withinBbox,
      });
    }

    console.log(
      river.river_name.padEnd(42) +
        river.state.padEnd(4) +
        river.latitude.toFixed(4).padStart(10) +
        river.longitude.toFixed(4).padStart(11) +
        centroid.lat.toFixed(4).padStart(10) +
        centroid.lon.toFixed(4).padStart(10) +
        distKm.toFixed(1).padStart(9) +
        `  ${status}`
    );
  }

  console.log("─".repeat(120));

  if (noGeom.length) {
    console.log(`\nRivers without geometry (${noGeom.length}):`);
    noGeom.forEach((s) => console.log(`  ${s}`));
  }

  if (flagged.length === 0) {
    console.log("\nAll rivers with geometry are within 50 km of their gauge coordinates.");
  } else {
    console.log(`\nRivers > 50 km from gauge (${flagged.length}):`);
    flagged
      .sort((a, b) => b.distKm - a.distKm)
      .forEach(({ name, state, distKm, gaugeLat, gaugeLon, geomLat, geomLon, withinBbox }) => {
        const note = withinBbox
          ? "(gauge within geom bbox — long river, geometry likely OK)"
          : "(gauge OUTSIDE geom bbox — possible geometry error)";
        console.log(`  ${name} (${state}): ${distKm.toFixed(1)} km`);
        console.log(`    gauge=(${gaugeLat.toFixed(4)}, ${gaugeLon.toFixed(4)})  geom_centroid=(${geomLat.toFixed(4)}, ${geomLon.toFixed(4)})`);
        console.log(`    ${note}`);
      });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
