import { fetchActiveStationGeojsonByRiverIds, fetchFishabilityData } from "@/lib/supabase";
import OnxShell from "@/components/OnxShell";

export const dynamic = "force-dynamic";
export const revalidate = 600;

export default async function HomePage() {
  const useMock = !process.env.NEXT_PUBLIC_SUPABASE_URL;
  let rivers: Awaited<ReturnType<typeof fetchFishabilityData>> = [];
  let stationGeojson: GeoJSON.FeatureCollection<GeoJSON.Point, Record<string, unknown>> = {
    type: "FeatureCollection",
    features: [],
  };
  try {
    rivers = await fetchFishabilityData(useMock);
    if (!useMock && rivers.length > 0) {
      stationGeojson = await fetchActiveStationGeojsonByRiverIds(rivers.map((r) => r.river_id));
    }
  } catch (e) {
    console.error("[HomePage]", e);
  }
  return <OnxShell rivers={rivers} stationGeojson={stationGeojson} />;
}
