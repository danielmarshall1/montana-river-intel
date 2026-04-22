import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// NRCS SNOTEL CSV: Date, Station Id, Station Name, SWE (in), % of 1981 Median
// Fetched per-state (MT, ID, WY) and merged — NRCS doesn't support multi-state OR queries
function nrcsUrl(state: string): string {
  return `https://wcc.sc.egov.usda.gov/reportGenerator/view_csv/customMultipleStationReport/daily/start_of_period/state=%22${state}%22%20AND%20element=%22WTEQ%22%20AND%20outServiceDate=%222100-01-01%22%7Cname/-7,0/WTEQ::value,WTEQ::pctOfMedian_1981`;
}

// Station ID → basin — verified from NRCS station list
const STATION_BASIN: Record<string, string> = {
  // ── Montana ─────────────────────────────────────────────────────────────────

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

  // ── Idaho ────────────────────────────────────────────────────────────────────

  // Upper Snake — Henry's Fork, SF Snake, Teton River drainages
  "546": "Upper Snake",   // Island Park — Henry's Fork headwaters
  "471": "Upper Snake",   // Emigrant Summit — Teton Pass / upper Snake

  // Salmon River
  "312": "Salmon",        // Banner Summit — Valley Creek → Salmon River
  "639": "Salmon",        // Morgan Creek — Salmon River tributary
  "926": "Salmon",        // Smiley Mountain — upper Salmon near Salmon city

  // Boise River (includes SF Boise)
  "306": "Boise",         // Atlanta Summit — SF Boise / Middle Fork headwaters
  "637": "Boise",         // Mores Creek Summit — Boise River drainage
  "978": "Boise",         // Bogus Basin — foothills, Boise River

  // Wood River (Big Wood River)
  "537": "Wood River",    // Hyndman — Sun Valley, Big Wood River
  "490": "Wood River",    // Galena Summit — Big Wood headwaters
  "450": "Wood River",    // Dollarhide Summit — Big Wood drainage

  // Clearwater River
  "588": "Clearwater",    // Lolo Pass — Lochsa River (Clearwater tributary)
  "623": "Clearwater",    // Mica Creek — Clearwater basin
  "1142": "Clearwater",   // Pierce R.S. — North Fork Clearwater

  // ── Wyoming ──────────────────────────────────────────────────────────────────

  // Upper Green River
  "342": "Upper Green",   // Big Sandy Opening — Green River tributary
  "468": "Upper Green",   // Elkhart Park G.S. — Fremont/New Fork → Green River
  "661": "Upper Green",   // New Fork Lake — New Fork River → Green River

  // Wind River
  "822": "Wind River",    // Togwotee Pass — Wind River headwaters
  "878": "Wind River",    // Younts Peak — Wind River headwaters

  // Snake Headwaters (Jackson Hole — Snake + Gros Ventre)
  "506": "Snake Headwaters", // Gros Ventre Summit — Gros Ventre drainage
  "764": "Snake Headwaters", // Snake River Station — Snake River, Jackson Hole
  "554": "Snake Headwaters", // Kelley R.S. — Kelly WY, Gros Ventre River

  // North Platte / Laramie River
  "367": "North Platte",  // Brooklyn Lake — Laramie River headwaters
  "772": "North Platte",  // South Brush Creek — Laramie / North Platte drainage
  "1196": "North Platte", // Med Bow — Medicine Bow Mtns, Laramie River

  // Shoshone / Clarks Fork Yellowstone
  "350": "Shoshone",      // Blackwater — North Fork Shoshone River tributary
  "326": "Shoshone",      // Beartooth Lake — Beartooth Plateau, near Clarks Fork headwaters

  // Bighorn River
  "377": "Bighorn",       // Burgess Junction — Bighorn Mountains, feeds Bighorn drainage
  "402": "Bighorn",       // Cloud Peak Reservoir — Bighorn Mountains
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

  // Fetch MT, ID, WY in parallel — NRCS doesn't support multi-state queries
  const states = ["MT", "ID", "WY"];
  const fetchResults = await Promise.allSettled(
    states.map((st) =>
      fetch(nrcsUrl(st), {
        headers: { Accept: "text/csv, text/plain, */*" },
        signal: AbortSignal.timeout(30_000),
      }).then((r) => {
        if (!r.ok) throw new Error(`NRCS ${st} fetch ${r.status}`);
        return r.text();
      })
    )
  );

  // Merge results — skip states that failed (log warnings)
  const basinData = new Map<string, { pctSum: number; count: number }>();
  for (let i = 0; i < states.length; i++) {
    const result = fetchResults[i];
    if (result.status === "rejected") {
      console.warn(`[snowpack-ingest] ${states[i]} fetch failed:`, result.reason);
      continue;
    }
    for (const [basin, accum] of parseNrcsCsv(result.value).entries()) {
      const existing = basinData.get(basin) ?? { pctSum: 0, count: 0 };
      existing.pctSum += accum.pctSum;
      existing.count += accum.count;
      basinData.set(basin, existing);
    }
  }

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
