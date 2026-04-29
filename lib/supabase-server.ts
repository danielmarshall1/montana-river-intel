import { createClient } from "@supabase/supabase-js";
import type { FishabilityRow } from "./types";

export function createSupabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: "no-store",
        }),
    },
  });
}

type RiverGeometryJoinRow = {
  id?: string | null;
  slug?: string | null;
  river_name?: string | null;
  river_geometries?:
    | {
        geom?: GeoJSON.Geometry | null;
      }
    | Array<{
        geom?: GeoJSON.Geometry | null;
      }>
    | null;
};

function featureFromJoinRow(
  row: RiverGeometryJoinRow
): GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>> | null {
  const joined = Array.isArray(row.river_geometries)
    ? row.river_geometries[0] ?? null
    : row.river_geometries ?? null;
  const geometry = joined?.geom ?? null;
  const riverId = row.id ? String(row.id) : null;
  if (!geometry || !riverId) return null;

  return {
    type: "Feature",
    geometry,
    properties: {
      river_id: riverId,
      slug: row.slug ?? null,
      river_name: row.river_name ?? row.slug ?? riverId,
      name: row.river_name ?? row.slug ?? riverId,
    },
  };
}

export async function fetchDisplayRiversGeojson(): Promise<GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>>> {
  const client = createSupabaseServer();
  if (!client) return { type: "FeatureCollection", features: [] };

  const { data, error } = await client.rpc("get_display_rivers_geojson");

  if (error || !data) return { type: "FeatureCollection", features: [] };
  return data as GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>>;
}

export async function fetchRiverLinesGeojson(
  rivers: Pick<FishabilityRow, "river_id" | "slug" | "river_name">[]
): Promise<GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>>> {
  const client = createSupabaseServer();
  if (!client || rivers.length === 0) {
    return { type: "FeatureCollection", features: [] };
  }

  const byId = new Map(
    rivers
      .map((river) => {
        const id = String(river.river_id ?? "").trim();
        if (!id) return null;
        return [id, river] as const;
      })
      .filter((entry): entry is readonly [string, Pick<FishabilityRow, "river_id" | "slug" | "river_name">] => Boolean(entry))
  );

  if (byId.size === 0) {
    return { type: "FeatureCollection", features: [] };
  }

  const { data, error } = await client
    .from("rivers")
    .select("id,slug,river_name,river_geometries!inner(geom)")
    .in("id", Array.from(byId.keys()));

  const features = new Map<string, GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>>>();
  if (!error && data) {
    for (const row of data as RiverGeometryJoinRow[]) {
      const feature = featureFromJoinRow(row);
      if (!feature) continue;
      features.set(String(feature.properties?.river_id ?? ""), feature);
    }
  }

  const missing = rivers.filter((river) => !features.has(String(river.river_id ?? "")));
  for (const river of missing) {
    const key = river.slug ?? river.river_id;
    if (!key) continue;
    const { data: geojson, error: rpcError } = await client.rpc("get_river_geojson_by_slug", {
      p_slug: key,
    });
    if (rpcError || !geojson) continue;

    const normalized = geojson as GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>>;
    if (!normalized.geometry) continue;
    const riverId = String(river.river_id ?? "").trim();
    if (!riverId) continue;
    features.set(riverId, {
      type: "Feature",
      geometry: normalized.geometry,
      properties: {
        ...(normalized.properties ?? {}),
        river_id: riverId,
        slug: river.slug ?? normalized.properties?.slug ?? null,
        river_name: river.river_name ?? normalized.properties?.river_name ?? normalized.properties?.name ?? null,
        name: river.river_name ?? normalized.properties?.river_name ?? normalized.properties?.name ?? null,
      },
    });
  }

  return {
    type: "FeatureCollection",
    features: rivers
      .map((river) => features.get(String(river.river_id ?? "")))
      .filter(
        (
          feature
        ): feature is GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>> => Boolean(feature)
      ),
  };
}
