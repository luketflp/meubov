"use client";

/**
 * Pesagens avulsas route: the weights saved on one day outside the chute (ficha,
 * cadastro, peso ao nascer), opened from the Manejo history. `[data]` is the
 * ISO date of the day.
 */
import { useParams } from "next/navigation";
import { LooseWeighingsDetail } from "@/components/manejo/loose-weighings-detail";

export default function LooseWeighingsPage() {
  const params = useParams<{ data: string }>();
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-8">
      <LooseWeighingsDetail date={params.data} />
    </div>
  );
}
