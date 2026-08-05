"use client";

/**
 * Lots screen: occupancy of every lot of the farm (head count, weight, AU and
 * stocking rate) and the registration of new lots. What used to share this
 * screen — compras, vendas e transferências — is now recorded in Manejo, where
 * the animals actually pass one by one.
 */
import { PageHeader } from "@/components/layout/PageHeader";
import { AddLotDialog } from "@/components/lots/add-lot-dialog";
import { LotsPaddocks } from "@/components/lots/lots-paddocks";

export default function LotsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8">
      <PageHeader
        title="Lotes"
        subtitle="Ocupação de cada lote e taxa de lotação do rebanho"
        actions={<AddLotDialog />}
      />
      <LotsPaddocks />
    </div>
  );
}
