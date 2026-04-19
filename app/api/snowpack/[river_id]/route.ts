import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// Basin → river_id mapping is resolved at the DB level via snowpack_readings.river_id.
// This route just fetches the most recent reading for the given river.
export async function GET(
  _req: Request,
  { params }: { params: { river_id: string } }
) {
  const supabase = createSupabaseServer();
  if (!supabase) {
    return NextResponse.json(null, { status: 503 });
  }

  const { data, error } = await supabase
    .from("snowpack_readings")
    .select("basin_name,snowpack_pct_median,reading_date")
    .eq("river_id", params.river_id)
    .order("reading_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json(null, { status: 500 });
  }

  return NextResponse.json(data ?? null, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
