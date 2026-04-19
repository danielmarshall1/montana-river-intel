import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// NRCS SNOTEL CSV: Date, Station Id, Station Name, SWE (in), % of 1981 Median
const NRCS_URL =
  "https://wcc.sc.egov.usda.gov/reportGenerator/view_csv/customMultipleStationReport/daily/start_of_period/state=%22MT%22%20AND%20element=%22WTEQ%22%20AND%20outServiceDate=%222100-01-01%22%7Cname/-7,0/WTEQ::value,WTEQ::pctOfMedian_1981";

// Station ID → basin — verified from NRCS station list for Montana
const STATION_BASIN: Record<string, string> = {
  // Big Hole
  "355": "Big Hole",    // Bloody Dick
  "448": "Big Hole",    // Divide
  "346": "Big Hole",    // Bisson Creek
  "656": "Big Hole",    // Mule Creek

  // Bitterroot
  "760": "Bitterroot",  // Skalkaho Summit
  "649": "Bitterroot",  // Mount Lockhart

  // Clark Fork (Upper) — Missoula/Deer Lodge/St Regis drainages
  "578": "Clark Fork",  // Lick Creek
  "410": "Clark Fork",  // Combination
  "932": "Clark Fork",  // Poorman Creek
  "722": "Clark Fork",  // Rocker Peak

  // Gallatin
  "590": "Gallatin",    // Lone Mountain
  "754": "Gallatin",    // Shower Falls
  "365": "Gallatin",    // Brackett Creek
  "813": "Gallatin",    // Tepee Creek

  // Madison
  "609": "Madison",     // Madison Plateau
  "930": "Madison",     // Peterson Meadows

  // Yellowstone
  "670": "Yellowstone", // Northeast Entrance
  "924": "Yellowstone", // West Yellowstone

  // Flathead (all forks)
  "530": "Flathead",    // Hoodoo Basin
  "664": "Flathead",    // Noisy Basin
  "787": "Flathead",    // Stahl Peak
  "480": "Flathead",    // Fisher Creek
  "436": "Flathead",    // Darkhorse Lake
  "635": "Flathead",    // Monument Peak
  "836": "Flathead",    // Twin Lakes
  "385": "Flathead",    // Carrot Basin
  "667": "Flathead",    // North Fork Jocko

  // Kootenai
  "500": "Kootenai",   // Grave Creek
  "700": "Kootenai",   // Porcupine
  "876": "Kootenai",   // Wood Creek

  // Missouri / Smith River headwaters
  "1009": "Missouri",  // Stringer Creek
  "781": "Missouri",   // Spur Park

  // Blackfoot
  "313": "Blackfoot",  // Barker Lakes — near Lincoln MT
};

function parseNrcsCsv(csvText: string): Map<string, { pctSum: number; count: number }> {
  // CSV columns: Date, Station Id, Station Name, SWE value, Pct of Median
  const basinAccum = new Map<string, { pctSum: number; count: number }>();

  // Find the most recent date in the data
  let latestDate = "";
  for (const line of csvText.split("\n")) {
    if (line.startsWith("#") || line.trim() === "" || line.startsWith("Date")) continue;
    const date = line.split(",")[0]?.trim();
    if (date && date > latestDate) latestDate = date;
  }
  if (!latestDate) return basinAccum;

  for (const line of csvText.split("\n")) {
    if (line.startsWith("#") || line.trim() === "" || line.startsWith("Date")) continue;
    const parts = line.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
    if (parts.length < 5) continue;

    const [date, stationId, , , pctRaw] = parts;
    if (date !== latestDate) continue;
    if (!stationId) continue;

    const basin = STATION_BASIN[stationId];
    if (!basin) continue;

    const pct = parseFloat(pctRaw);
    if (isNaN(pct) || pct <= 0) continue;

    const existing = basinAccum.get(basin) ?? { pctSum: 0, count: 0 };
    existing.pctSum += pct;
    existing.count += 1;
    basinAccum.set(basin, existing);
  }

  return basinAccum;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return new Response("Missing env vars", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  let csvText: string;
  try {
    const res = await fetch(NRCS_URL, {
      headers: { Accept: "text/csv, text/plain, */*" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`NRCS fetch ${res.status}`);
    csvText = await res.text();
  } catch (err) {
    console.error("[snowpack-ingest] fetch error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 502 });
  }

  const basinData = parseNrcsCsv(csvText);

  if (basinData.size === 0) {
    return new Response(JSON.stringify({ message: "No stations matched any basin" }), { status: 200 });
  }

  const readingDate = new Date().toISOString().slice(0, 10);

  // One row per basin — river_id left null; API route resolves basin from slug lookup
  const upsertRows: Array<{
    basin_name: string;
    river_id: null;
    snowpack_pct_median: number;
    reading_date: string;
    station_count: number;
  }> = [];

  const summary: Record<string, string> = {};

  for (const [basin, { pctSum, count }] of basinData.entries()) {
    const avgPct = Math.round((pctSum / count) * 10) / 10;
    summary[basin] = `${avgPct}% (${count} stations)`;
    upsertRows.push({
      basin_name: basin,
      river_id: null,
      snowpack_pct_median: avgPct,
      reading_date: readingDate,
      station_count: count,
    });
  }

  const { error: upsertErr } = await supabase
    .from("snowpack_readings")
    .upsert(upsertRows, { onConflict: "basin_name,reading_date", ignoreDuplicates: false });

  if (upsertErr) {
    return new Response(JSON.stringify({ error: upsertErr.message }), { status: 500 });
  }

  console.log("[snowpack-ingest] complete", summary);
  return new Response(
    JSON.stringify({ date: readingDate, basins: summary, rows: upsertRows.length }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
