import { fetchActiveStationGeojsonByRiverIds, fetchFishabilityData } from "@/lib/supabase";
import { fetchDisplayRiversGeojson, fetchRiverLinesGeojson } from "@/lib/supabase-server";
import RiverShell from "@/components/RiverShell";

export const dynamic = "force-dynamic";
export const revalidate = 900;

export default async function HomePage() {
  const useMock = !process.env.NEXT_PUBLIC_SUPABASE_URL;
  let rivers: Awaited<ReturnType<typeof fetchFishabilityData>> = [];
  let stationGeojson: GeoJSON.FeatureCollection<GeoJSON.Point, Record<string, unknown>> = {
    type: "FeatureCollection",
    features: [],
  };
  let riverLinesGeojson: GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>> = {
    type: "FeatureCollection",
    features: [],
  };
  let displayRiversGeojson: GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>> = {
    type: "FeatureCollection",
    features: [],
  };
  try {
    rivers = await fetchFishabilityData(useMock);
    if (!useMock && rivers.length > 0) {
      [stationGeojson, riverLinesGeojson, displayRiversGeojson] = await Promise.all([
        fetchActiveStationGeojsonByRiverIds(rivers.map((r) => r.river_id)),
        fetchRiverLinesGeojson(rivers),
        fetchDisplayRiversGeojson(),
      ]);
    }
  } catch (e) {
    console.error("[HomePage]", e);
  }
  return <RiverShell rivers={rivers} stationGeojson={stationGeojson} riverLinesGeojson={riverLinesGeojson} displayRiversGeojson={displayRiversGeojson} />;
}
