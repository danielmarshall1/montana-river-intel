require("dotenv").config();
console.log("Loaded URL:", process.env.SUPABASE_URL);
console.log("Key exists:", !!process.env.SUPABASE_SERVICE_ROLE_KEY);
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Start with ONE river first
const RIVERS = [
    { river: "Madison – West Yellowstone", usgs_site_no: "06037500" },
    { river: "Madison – Ennis Lake", usgs_site_no: "06041000" },
    { river: "Madison – Kirby Ranch", usgs_site_no: "06038800" },
    { river: "West Fork Madison", usgs_site_no: "06039200" },
    { river: "Gallatin – Gallatin Gateway", usgs_site_no: "06043500" },
    { river: "Jefferson – Three Forks", usgs_site_no: "06036650" },
    { river: "Yellowstone – Livingston", usgs_site_no: "06192500" }
  ];
  ;
  

function cToF(c) {
  return (c * 9) / 5 + 32;
}

async function fetchUSGS({ usgs_site_no }) {
  const url =
    "https://waterservices.usgs.gov/nwis/iv/?format=json" +
    `&sites=${usgs_site_no}` +
    "&parameterCd=00060,00010" +
    "&siteStatus=all";

  const { data } = await axios.get(url, { timeout: 20000 });
  const series = data?.value?.timeSeries || [];

  const flowSeries = series.find(
    (s) => s?.variable?.variableCode?.[0]?.value === "00060"
  );
  const tempSeries = series.find(
    (s) => s?.variable?.variableCode?.[0]?.value === "00010"
  );

  const flowVal = flowSeries?.values?.[0]?.value?.slice(-1)?.[0]?.value;
  const tempCVal = tempSeries?.values?.[0]?.value?.slice(-1)?.[0]?.value;

  const flow_cfs = flowVal != null ? Number(flowVal) : null;
  const water_temp_f = tempCVal != null ? cToF(Number(tempCVal)) : null;

  return { flow_cfs, water_temp_f };
}

function todayYYYYMMDD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function upsertObservation(row) {
  const { error } = await supabase
    .from("river_daily_observations")
    .upsert(row, { onConflict: "river,date,usgs_site_no" });

  if (error) throw error;
}

async function main() {
  const date = todayYYYYMMDD();

  for (const r of RIVERS) {
    console.log(`Fetching USGS for ${r.river} (${r.usgs_site_no})...`);
    const { flow_cfs, water_temp_f } = await fetchUSGS(r);

    const row = {
      river: r.river,
      date,
      usgs_site_no: r.usgs_site_no,
      flow_cfs,
      water_temp_f,
      source: "usgs_iv",
    };

    console.log("Upserting:", row);
    await upsertObservation(row);
    console.log(`✅ Saved ${r.river} ${date}`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error("❌ Failed:", err?.message || err);
  process.exit(1);
});
