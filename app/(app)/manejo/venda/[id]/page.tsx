"use client";

/**
 * Venda record route: the read-only romaneio of a closed sale, opened from the
 * Manejo history. The running venda stays on /manejo/[id], the chute screen.
 */
import { useParams } from "next/navigation";
import { SaleDetail } from "@/components/manejo/sale-detail";

export default function SaleDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-8">
      <SaleDetail sessionId={params.id} />
    </div>
  );
}
