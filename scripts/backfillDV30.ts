import "dotenv/config";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.");
}

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
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res;
}

async function getActiveRivers(): Promise<{ usgs_site_no: string; slug: string }[]> {
  const res = await supabaseFetch(
    `/rest/v1/rivers?select=usgs_site_no,slug&is_active=eq.true`,
    { method: "GET" }
  );
  return await res.json();
}

function isoDate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function fetchUSGSDV(site: string, start: string, end: string) {
  // Daily Values for discharge (00060)
  const url =
    `https://waterservices.usgs.gov/nwis/dv/?format=json` +
    `&sites=${site}&parameterCd=00060&startDT=${start}&endDT=${end}&siteStatus=all`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`USGS DV ${res.status}`);
  return await res.json();
}

async function upsertDaily(site: string, dateISO: string, payload: any) {
  await supabaseFetch(`/rest/v1/rpc/upsert_river_daily_by_site`, {
    method: "POST",
    body: JSON.stringify({
      p_usgs_site_no: site,
      p_date: dateISO,
      p_payload: payload,
    }),
  });
}

async function main() {
  const rivers = await getActiveRivers();

  const start = isoDate(daysAgo(30));
  const end = isoDate(daysAgo(0));

  console.log(`Backfilling DV discharge from ${start} to ${end}`);
  console.log(`Rivers: ${rivers.length}`);

  for (const r of rivers) {
    try {
      const data = await fetchUSGSDV(r.usgs_site_no, start, end);
      const series = data?.value?.timeSeries ?? [];
      const values = series?.[0]?.values?.[0]?.value ?? [];

      let count = 0;

      for (const row of values) {
        const dateTime: string = row?.dateTime; // like 2026-02-10T00:00:00.000-05:00
        const v = row?.value;

        if (!dateTime || v === undefined || v === null || v === "") continue;

        const num = Number(v);
        if (!Number.isFinite(num) || num <= -9990) continue;

        const day = dateTime.slice(0, 10);

        await upsertDaily(r.usgs_site_no, day, {
          flow_cfs: num,
          source: { usgs_dv: true, fetched_at: new Date().toISOString() },
        });
        count++;
      }

      console.log(`✅ ${r.slug} backfilled ${count} days`);
    } catch (e: any) {
      console.error(`❌ ${r.slug}: ${e.message}`);
    }
  }

  console.log("Backfill done.");
}

main().catch(console.error);
