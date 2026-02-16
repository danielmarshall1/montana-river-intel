import "dotenv/config";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function supabaseFetch(path: string, init: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res;
}

async function getRivers() {
  const res = await supabaseFetch(
    `/rest/v1/rivers?select=id,slug,usgs_site_no`,
    { method: "GET" }
  );
  return await res.json();
}

async function fetchUSGSSite(site: string): Promise<{ lat: number; lon: number }> {
  const url =
    `https://api.waterdata.usgs.gov/ogcapi/v0/collections/monitoring-locations/items` +
    `?monitoring_location_number=${site}&agency_code=USGS&f=json&limit=1`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`USGS site error ${res.status}`);
  const data = await res.json();
  const feature = data?.features?.[0];
  const [lon, lat] = feature?.geometry?.coordinates ?? [];
  if (lat == null || lon == null) throw new Error("Missing lat/lon");
  return { lat, lon };
}

async function updateRiver(id: string, lat: number, lon: number) {
  await supabaseFetch(`/rest/v1/rivers?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      latitude: lat,
      longitude: lon,
    }),
  });
}

async function main() {
  const rivers = await getRivers();

  for (const r of rivers) {
    try {
      const { lat, lon } = await fetchUSGSSite(r.usgs_site_no);
      await updateRiver(r.id, lat, lon);
      console.log(`✅ ${r.slug} → ${lat}, ${lon}`);
    } catch (e: any) {
      console.log(`❌ ${r.slug}: ${e.message}`);
    }
  }

  console.log("Done.");
}

main();
