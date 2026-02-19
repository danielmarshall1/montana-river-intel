import { fetchFishabilityData } from "@/lib/supabase";
import OnxShell from "@/components/OnxShell";

export const dynamic = "force-dynamic";
export const revalidate = 600;

export default async function HomePage() {
  const useMock = !process.env.NEXT_PUBLIC_SUPABASE_URL;
  const rivers = await fetchFishabilityData(useMock);
  return <OnxShell rivers={rivers} />;
}
