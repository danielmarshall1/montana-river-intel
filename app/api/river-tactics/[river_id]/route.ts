import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

// Force dynamic — tactics rows are inserted on demand; ISR would cache null
// responses for rivers where tactics didn't exist at first request time.
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { river_id: string } }
) {
  const supabase = createSupabaseServer();
  if (!supabase) {
    console.error("[river-tactics] supabase client is null — check env vars");
    return NextResponse.json(null, { status: 503 });
  }

  const { data, error } = await supabase
    .from("river_tactics")
    .select("*")
    .eq("river_id", params.river_id)
    .maybeSingle();

  console.log(`[river-tactics] river_id=${params.river_id} found=${Boolean(data)} error=${error?.message ?? null}`);

  if (error) return NextResponse.json(null, { status: 500 });

  return NextResponse.json(data ?? null, {
    headers: {
      // CDN/browser cache: 1 hour fresh, serve stale up to 24h while revalidating
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
