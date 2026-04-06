import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const THRESHOLD_M = Number(process.env.USGS_SITE_MATCH_THRESHOLD_M ?? "2000");
const TOP_N = Number(process.env.USGS_SITE_MATCH_TOP_N ?? "3");
const ONLY_ACTIVE = (process.env.USGS_SITE_MATCH_ONLY_ACTIVE ?? "true").toLowerCase() !== "false";
const PAGE_SIZE = Number(process.env.USGS_SITE_MATCH_PAGE_SIZE ?? "200");
const AUTO_PROMOTE = (process.env.USGS_SITE_AUTO_PROMOTE ?? "false").toLowerCase() === "true";
const AUTO_ROLE = process.env.USGS_SITE_AUTO_ROLE ?? null; // flow | temp | null(both)
const AUTO_MIN_CONF = Number(process.env.USGS_SITE_AUTO_MIN_CONF ?? "0.55");
const AUTO_OVERWRITE_MANUAL = (process.env.USGS_SITE_AUTO_OVERWRITE_MANUAL ?? "false").toLowerCase() === "true";

async function main() {
  let insertedTotal = 0;
  let processedTotal = 0;
  let offset = 0;
  let usedPaged = false;

  for (;;) {
    const { data, error } = await sb.rpc("refresh_usgs_site_river_candidates_paged", {
      p_threshold_m: THRESHOLD_M,
      p_top_n: TOP_N,
      p_only_active_sites: ONLY_ACTIVE,
      p_site_limit: PAGE_SIZE,
      p_site_offset: offset,
      p_clear_first_page: offset === 0,
    });

    if (error) {
      if (offset === 0) {
        throw new Error(
          `refresh_usgs_site_river_candidates_paged unavailable/failed on first page: ${error.message}. ` +
            `Apply migration 20260222121000_usgs_candidate_refresh_paged.sql first.`
        );
      }
      throw new Error(`refresh_usgs_site_river_candidates_paged failed at offset=${offset}: ${error.message}`);
    }

    usedPaged = true;
    const row = Array.isArray(data) ? data[0] : data;
    const processed = Number(row?.processed_sites ?? 0);
    const inserted = Number(row?.inserted_rows ?? 0);
    processedTotal += processed;
    insertedTotal += inserted;

    if (processed < PAGE_SIZE) {
      break;
    }
    offset += PAGE_SIZE;
  }

  if (!usedPaged) {
    throw new Error("No paged refresh work executed. Aborting to avoid timeout-prone full refresh fallback.");
  }

  console.log(`Candidate refresh complete: processed=${processedTotal}, rows_inserted=${insertedTotal}, threshold_m=${THRESHOLD_M}, top_n=${TOP_N}, paged=${usedPaged}`);

  if (!AUTO_PROMOTE) {
    return;
  }

  const roleValue = AUTO_ROLE && ["flow", "temp"].includes(AUTO_ROLE) ? AUTO_ROLE : null;
  const { data: promoteData, error: promoteErr } = await sb.rpc("auto_promote_usgs_site_roles", {
    p_role: roleValue,
    p_min_confidence: AUTO_MIN_CONF,
    p_overwrite_manual: AUTO_OVERWRITE_MANUAL,
    p_promoted_by: "script:auto",
  });

  if (promoteErr) {
    throw new Error(`auto_promote_usgs_site_roles failed: ${promoteErr.message}`);
  }

  console.log("Auto-promotion result:", promoteData);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
