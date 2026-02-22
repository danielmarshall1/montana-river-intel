import "dotenv/config";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
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

async function rpc(name: string, body: Record<string, unknown>) {
  const res = await sbFetch(`/rest/v1/rpc/${name}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res.text();
}

async function main() {
  const autoApply = process.env.AUTO_APPLY !== "0";
  const runIngest = process.env.RUN_INGEST === "1";

  const suggested = await rpc("refresh_river_usgs_temp_suggestions", {
    p_river_id: null,
    p_auto_apply: autoApply,
  });
  console.log(`refresh_river_usgs_temp_suggestions -> ${suggested}`);

  await rpc("sync_legacy_river_usgs_map_from_roles", {});
  console.log("sync_legacy_river_usgs_map_from_roles -> ok");

  if (runIngest) {
    const ingestResp = await fetch(`${SUPABASE_URL}/functions/v1/usgs-ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        "x-mri-cadence": "manual",
      },
      body: JSON.stringify({}),
    });
    const ingestText = await ingestResp.text();
    console.log(`usgs-ingest (${ingestResp.status}) -> ${ingestText}`);
  }

  const coverageRes = await sbFetch(
    "/rest/v1/v_river_temp_coverage?select=river_name,mapped_temp_site_no,used_temp_site_no,temp_source_kind,last_temp_observed_at,temp_coverage_status,temp_reason&order=river_name.asc"
  );
  const coverage = (await coverageRes.json()) as Array<Record<string, unknown>>;
  console.table(coverage);

  const missing = coverage.filter((row) => row.temp_coverage_status !== "available");
  console.log(
    `\nTemp coverage summary: total=${coverage.length} available=${coverage.length - missing.length} missing_or_unavailable=${missing.length}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

