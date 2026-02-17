import { notFound } from "next/navigation";
import Link from "next/link";
import { fetchFishabilityData, fetchRiverDetailByIdOrSlug } from "@/lib/supabase";
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
  const river = useMock ? null : await fetchRiverDetailByIdOrSlug(river_id);
  const fallbackRivers = river ? [] : await fetchFishabilityData(useMock);
  const fallbackRiver = fallbackRivers.find((r) => r.river_id === river_id);
  const selectedRiver = river ?? fallbackRiver;
  if (!selectedRiver) notFound();

  const paiReports = await fetchPAIReportsByRiver(selectedRiver.river_name, 3);

  return (
    <div className="min-h-screen flex flex-col">
      <Header subtitle={<Link href="/" className="text-slate-400 hover:text-white text-sm font-medium no-underline">← Map</Link>} />
      <RiverDetailView river={selectedRiver} paiReports={paiReports} />
    </div>
  );
}
