import { NextResponse } from "next/server";
import { fetchRiversWithLatest } from "@/lib/supabase";

// Rivers change at most every 15 minutes (USGS ingest cadence)
export const revalidate = 900;

export async function GET() {
  const rivers = await fetchRiversWithLatest();
  return NextResponse.json(rivers, {
    headers: {
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800",
    },
  });
}
