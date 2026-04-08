import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

// Cache for 1 hour — access sites don't change often
export const revalidate = 3600;

export async function GET() {
  const sb = createSupabaseServer();
  if (!sb) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const { data, error } = await sb
    .from("fishing_access_sites")
    .select("id,name,lat,lng,river_id,river_confidence")
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];

  const geojson: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: rows.map((row) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [row.lng, row.lat],
      },
      properties: {
        id: row.id,
        name: row.name,
        river_id: row.river_id ?? null,
        river_confidence: row.river_confidence ?? null,
      },
    })),
  };

  return NextResponse.json(geojson, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
    },
  });
}
