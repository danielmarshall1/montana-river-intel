import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

export const revalidate = 86400; // tactics content changes rarely

export async function GET(
  _req: Request,
  { params }: { params: { river_id: string } }
) {
  const supabase = createSupabaseServer();
  if (!supabase) return NextResponse.json(null, { status: 503 });

  const { data, error } = await supabase
    .from("river_tactics")
    .select("*")
    .eq("river_id", params.river_id)
    .maybeSingle();

  if (error) return NextResponse.json(null, { status: 500 });

  return NextResponse.json(data ?? null, {
    headers: {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=172800",
    },
  });
}
