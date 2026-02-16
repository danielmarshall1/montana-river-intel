/**
 * Audit Supabase → rivers → river_daily_scores → Map pipeline.
 * Run: npx tsx scripts/verifySupabasePipeline.ts
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  console.log("=== PHASE 1: DATABASE VERIFICATION ===\n");

  const { data: rivers, error: rErr } = await supabase
    .from("rivers")
    .select("*")
    .limit(20);

  if (rErr) {
    console.error("❌ rivers query error:", rErr.message);
    return;
  }

  const riversCount = rivers?.length ?? 0;
  console.log("1. rivers row count:", riversCount);
  if (riversCount === 0) {
    console.log("   STOP: rivers table empty");
    return;
  }

  const hasLatLng = rivers?.some((r: any) => r.lat != null && r.lng != null);
  const hasLatLong = rivers?.some((r: any) => r.latitude != null && r.longitude != null);
  console.log("2. coordinates: lat/lng populated?", hasLatLng, "| latitude/longitude populated?", hasLatLong);

  const { data: scores, error: sErr } = await supabase
    .from("river_daily_scores")
    .select("*")
    .order("date", { ascending: false })
    .limit(20);

  if (sErr) {
    console.error("❌ river_daily_scores query error:", sErr.message);
    return;
  }

  const scoresCount = scores?.length ?? 0;
  console.log("3. scores row count:", scoresCount);
  if (scoresCount === 0) {
    console.log("   STOP: river_daily_scores empty");
    return;
  }

  console.log("\n=== Sample rivers ===");
  console.log(rivers?.slice(0, 5));
  console.log("\n=== Sample scores ===");
  console.log(scores?.slice(0, 5));
}

main();
