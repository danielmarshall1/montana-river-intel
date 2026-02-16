import { notFound } from "next/navigation";
import Link from "next/link";
import { fetchFishabilityData } from "@/lib/supabase";
import { fetchPAIReportsByRiver } from "@/lib/pai";
import { RiverDetailView } from "@/components/RiverDetailView";
import { Header } from "@/components/Header";

export const revalidate = 600;

interface PageProps {
  params: Promise<{ river_id: string }>;
}

export default async function RiverDetailPage({ params }: PageProps) {
  const { river_id } = await params;
  const useMock = !process.env.NEXT_PUBLIC_SUPABASE_URL;
  const rivers = await fetchFishabilityData(useMock);
  const river = rivers.find((r) => r.river_id === river_id);
  if (!river) notFound();

  const paiReports = await fetchPAIReportsByRiver(river.river_name, 3);

  return (
    <div className="min-h-screen flex flex-col">
      <Header subtitle={<Link href="/" className="text-slate-400 hover:text-white text-sm font-medium no-underline">← Map</Link>} />
      <RiverDetailView river={river} paiReports={paiReports} />
    </div>
  );
}
