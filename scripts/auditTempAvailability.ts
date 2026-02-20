import "dotenv/config";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

type SiteRow = {
  site_no: string;
  river_name?: string | null;
  slug?: string | null;
};

function hasSeriesWithValues(payload: any): boolean {
  const ts = payload?.value?.timeSeries;
  if (!Array.isArray(ts) || ts.length === 0) return false;
  return ts.some((s: any) => Array.isArray(s?.values?.[0]?.value) && s.values[0].value.length > 0);
}

async function sbFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Supabase ${res.status} ${path}: ${txt}`);
  }
  return res;
}

async function fetchSiteList(): Promise<SiteRow[]> {
  try {
    const usgsSites = await sbFetch("/rest/v1/usgs_sites?select=site_no,river_name,slug");
    const rows = (await usgsSites.json()) as SiteRow[];
    if (rows.length > 0) {
      return rows.filter((r) => !!r.site_no);
    }
  } catch {
    // fallback below
  }

  try {
    const mapped = await sbFetch("/rest/v1/river_usgs_map?select=flow_site_no,river_id");
    const mappedRows = (await mapped.json()) as Array<{ flow_site_no: string | null; river_id: string }>;
    const rivers = await sbFetch("/rest/v1/rivers?select=id,slug,river_name");
    const riverRows = (await rivers.json()) as Array<{ id: string; slug: string | null; river_name: string | null }>;
    const byId = new Map(riverRows.map((r) => [r.id, r]));
    return mappedRows
      .filter((m) => !!m.flow_site_no)
      .map((m) => ({
        site_no: String(m.flow_site_no),
        slug: byId.get(m.river_id)?.slug ?? null,
        river_name: byId.get(m.river_id)?.river_name ?? null,
      }));
  } catch {
    const rivers = await sbFetch("/rest/v1/rivers?select=slug,river_name,usgs_site_no&is_active=eq.true&usgs_site_no=not.is.null");
    const rows = (await rivers.json()) as Array<{ slug: string | null; river_name: string | null; usgs_site_no: string | null }>;
    return rows
      .filter((r) => !!r.usgs_site_no)
      .map((r) => ({ site_no: String(r.usgs_site_no), slug: r.slug, river_name: r.river_name }));
  }
}

async function fetchTempAvailability(siteNo: string): Promise<{ has_temp_iv: boolean; has_temp_dv: boolean }> {
  const ivUrl = `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${encodeURIComponent(siteNo)}&parameterCd=00010&siteStatus=all`;
  const dvUrl = `https://waterservices.usgs.gov/nwis/dv/?format=json&sites=${encodeURIComponent(siteNo)}&parameterCd=00010&siteStatus=all&period=P14D`;

  const [ivRes, dvRes] = await Promise.all([fetch(ivUrl), fetch(dvUrl)]);

  if (!ivRes.ok) throw new Error(`IV ${ivRes.status}`);
  if (!dvRes.ok) throw new Error(`DV ${dvRes.status}`);

  const ivJson = await ivRes.json();
  const dvJson = await dvRes.json();

  return {
    has_temp_iv: hasSeriesWithValues(ivJson),
    has_temp_dv: hasSeriesWithValues(dvJson),
  };
}

async function upsertSiteParameters(payload: Array<{ site_no: string; has_temp_iv: boolean; has_temp_dv: boolean; checked_at: string }>) {
  if (payload.length === 0) return;
  try {
    await sbFetch("/rest/v1/usgs_site_parameters?on_conflict=site_no", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.warn(
      `Skipping usgs_site_parameters upsert (likely migration not applied yet): ${
        e instanceof Error ? e.message : String(e)
      }`
    );
  }
}

async function main() {
  const rows = await fetchSiteList();
  const deduped = Array.from(new Map(rows.map((r) => [r.site_no, r])).values());

  const report: Array<{
    site_no: string;
    river: string;
    has_temp_iv: boolean;
    has_temp_dv: boolean;
    source: "IV" | "DV fallback" | "None";
    error?: string;
  }> = [];

  const upserts: Array<{ site_no: string; has_temp_iv: boolean; has_temp_dv: boolean; checked_at: string }> = [];

  for (const row of deduped) {
    try {
      const av = await fetchTempAvailability(row.site_no);
      upserts.push({
        site_no: row.site_no,
        has_temp_iv: av.has_temp_iv,
        has_temp_dv: av.has_temp_dv,
        checked_at: new Date().toISOString(),
      });
      report.push({
        site_no: row.site_no,
        river: row.river_name ?? row.slug ?? row.site_no,
        has_temp_iv: av.has_temp_iv,
        has_temp_dv: av.has_temp_dv,
        source: av.has_temp_iv ? "IV" : av.has_temp_dv ? "DV fallback" : "None",
      });
    } catch (e) {
      report.push({
        site_no: row.site_no,
        river: row.river_name ?? row.slug ?? row.site_no,
        has_temp_iv: false,
        has_temp_dv: false,
        source: "None",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  await upsertSiteParameters(upserts);

  const ivCount = report.filter((r) => r.has_temp_iv).length;
  const dvOnlyCount = report.filter((r) => !r.has_temp_iv && r.has_temp_dv).length;
  const noneCount = report.filter((r) => !r.has_temp_iv && !r.has_temp_dv).length;

  console.table(report);
  console.log(`\\nUSGS temp availability summary (sites=${report.length})`);
  console.log(`IV temp: ${ivCount}`);
  console.log(`DV fallback only: ${dvOnlyCount}`);
  console.log(`No temp (IV/DV): ${noneCount}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
