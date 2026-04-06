"use client";

import { getSupabaseClient } from "./supabaseClient";

export async function fetchRiverGeojsonBrowser(slugOrId: string): Promise<GeoJSON.GeoJSON | null> {
  if (!slugOrId) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc("get_river_geojson_by_slug", {
    p_slug: slugOrId,
  });

  if (error) {
    console.error("[fetchRiverGeojsonBrowser] rpc error:", error);
    return null;
  }
  return data ?? null;
}
