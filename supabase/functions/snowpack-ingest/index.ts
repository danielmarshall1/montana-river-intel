import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// NRCS SNOTEL CSV endpoint — all MT stations with SWE value and % of 1981 median
const NRCS_URL =
  "https://wcc.sc.egov.usda.gov/reportGenerator/view_csv/customMultipleStationReport/daily/start_of_period/state=%22MT%22%20AND%20element=%22WTEQ%22%20AND%20outServiceDate=%222100-01-01%22%7Cname/-7,0/WTEQ::value,WTEQ::pctOfMedian_1981";

// Map SNOTEL station name keywords → basin name.
// Station names that contain these substrings are assigned to the basin.
const BASIN_KEYWORDS: Array<{ basin: string; keywords: string[] }> = [
  { basin: "Clark Fork", keywords: ["clark fork", "upper clark fork", "st. regis", "st regis", "lolo", "flint creek"] },
  { basin: "Bitterroot", keywords: ["bitterroot", "lost trail", "sula"] },
  { basin: "Big Hole", keywords: ["big hole", "bloody dick", "pattengail", "wisdom", "jackson", "gibbons"] },
  { basin: "Madison", keywords: ["madison", "grizzly", "earthquake", "cherry creek", "fountain"] },
  { basin: "Gallatin", keywords: ["gallatin", "shower falls", "garnet mountain"] },
  { basin: "Yellowstone", keywords: ["yellowstone", "corwin springs", "lamar", "gardiner", "cooke city"] },
  { basin: "Missouri", keywords: ["missouri", "divide", "marias", "smith river", "musselshell"] },
  { basin: "Flathead", keywords: ["flathead", "hungry horse", "spotted bear", "north fork", "south fork", "middle fork"] },
  { basin: "Kootenai", keywords: ["kootenai", "libby", "rexford", "mt. henry", "vermilion"] },
  { basin: "Blackfoot", keywords: ["blackfoot", "stemple pass"] },
];

// Basin → river slug mapping for DB lookup
const BASIN_RIVER_SLUGS: Record<string, string[]> = {
  "Clark Fork": ["clark-fork-st-regis"],
  "Bitterroot": ["bitterroot-missoula"],
  "Big Hole": ["big-hole-melrose"],
  "Madison": ["madison-west-yellowstone"],
  "Gallatin": ["gallatin-gateway"],
  "Yellowstone": ["yellowstone-livingston", "yellowstone-corwin-springs"],
  "Missouri": ["missouri-toston"],
  "Flathead": ["flathead-columbia-falls", "nf-flathead-columbia-falls"],
  "Kootenai": ["kootenai-below-libby-dam", "kootenai-libby"],
  "Blackfoot": ["blackfoot-missoula"],
};

function classifyStation(stationName: string): string | null {
  const lower = stationName.toLowerCase();
  for (const { basin, keywords } of BASIN_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) return basin;
  }
  return null;
}

interface StationReading {
  name: string;
  pctOfMedian: number | null;
}

function parseNrcsCsv(csvText: string): StationReading[] {
  const lines = csvText.split("\n");
  const readings: StationReading[] = [];

  for (const line of lines) {
    // Skip comment lines and header
    if (line.startsWith("#") || line.trim() === "" || line.toLowerCase().includes("station name")) continue;

    // CSV columns: Station Name, State, Network, ..., Date, Value (in), % of Median
    // The exact column order can vary — find the pct column by looking for numeric values
    const parts = line.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
    if (parts.length < 3) continue;

    // Station name is always first
    const name = parts[0];
    if (!name) continue;

    // Find the last numeric value that could be pct of median (typically last column)
    let pctOfMedian: number | null = null;
    for (let i = parts.length - 1; i >= 0; i--) {
      const val = parseFloat(parts[i]);
      if (!isNaN(val) && val >= 0 && val <= 500) {
        pctOfMedian = val;
        break;
      }
    }

    readings.push({ name, pctOfMedian });
  }

  return readings;
}

Deno.serve(async (req: Request) => {
  // Validate method / auth
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return new Response("Missing env vars", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Fetch NRCS data
  let csvText: string;
  try {
    const res = await fetch(NRCS_URL, {
      headers: { Accept: "text/csv, text/plain, */*" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`NRCS fetch failed: ${res.status}`);
    csvText = await res.text();
  } catch (err) {
    console.error("[snowpack-ingest] fetch error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 502 });
  }

  const stations = parseNrcsCsv(csvText);
  const readingDate = new Date().toISOString().slice(0, 10);

  // Aggregate stations → basins
  const basinData = new Map<string, { sum: number; count: number }>();
  for (const s of stations) {
    const basin = classifyStation(s.name);
    if (!basin || s.pctOfMedian == null) continue;
    const existing = basinData.get(basin) ?? { sum: 0, count: 0 };
    existing.sum += s.pctOfMedian;
    existing.count += 1;
    basinData.set(basin, existing);
  }

  if (basinData.size === 0) {
    return new Response(JSON.stringify({ message: "No stations matched any basin" }), { status: 200 });
  }

  // Fetch river_id for each slug
  const allSlugs = Object.values(BASIN_RIVER_SLUGS).flat();
  const { data: riverRows, error: riverErr } = await supabase
    .from("rivers")
    .select("id,slug")
    .in("slug", allSlugs);

  if (riverErr) {
    console.error("[snowpack-ingest] river lookup error:", riverErr);
    return new Response(JSON.stringify({ error: riverErr.message }), { status: 500 });
  }

  const slugToId = new Map<string, string>();
  for (const row of (riverRows ?? []) as Array<{ id: string; slug: string }>) {
    slugToId.set(row.slug, row.id);
  }

  // Build upsert rows — one row per (basin, river) pair
  const upsertRows: Array<{
    basin_name: string;
    river_id: string | null;
    snowpack_pct_median: number;
    reading_date: string;
    station_count: number;
  }> = [];

  for (const [basin, { sum, count }] of basinData) {
    const avgPct = Math.round((sum / count) * 10) / 10;
    const slugs = BASIN_RIVER_SLUGS[basin] ?? [];

    if (slugs.length === 0) {
      // Still record basin-level reading without a river_id
      upsertRows.push({ basin_name: basin, river_id: null, snowpack_pct_median: avgPct, reading_date: readingDate, station_count: count });
      continue;
    }

    for (const slug of slugs) {
      const riverId = slugToId.get(slug) ?? null;
      upsertRows.push({ basin_name: basin, river_id: riverId, snowpack_pct_median: avgPct, reading_date: readingDate, station_count: count });
    }
  }

  const { error: upsertErr } = await supabase
    .from("snowpack_readings")
    .upsert(upsertRows, { onConflict: "basin_name,reading_date", ignoreDuplicates: false });

  if (upsertErr) {
    console.error("[snowpack-ingest] upsert error:", upsertErr);
    return new Response(JSON.stringify({ error: upsertErr.message }), { status: 500 });
  }

  const summary = Object.fromEntries(
    Array.from(basinData.entries()).map(([basin, { sum, count }]) => [
      basin,
      `${Math.round((sum / count) * 10) / 10}% (${count} stations)`,
    ])
  );

  console.log("[snowpack-ingest] complete", summary);
  return new Response(JSON.stringify({ date: readingDate, basins: summary, rows: upsertRows.length }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
