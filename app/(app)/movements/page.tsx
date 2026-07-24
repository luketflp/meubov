"use client";

/**
 * Movements and Lots screen: paddock occupancy and history of
 * purchases, sales and transfers of the herd.
 */
import { PageHeader } from "@/components/layout/PageHeader";
import { AddLotDialog } from "@/components/movements/add-lot-dialog";
import { LotsPaddocks } from "@/components/movements/lots-paddocks";
import { MovementHistory } from "@/components/movements/movement-history";
import { RegisterMovementDialog } from "@/components/movements/register-movement-dialog";

export default function MovementsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8">
      <PageHeader
        title="Movimentação e Lotes"
        subtitle="Ocupação dos pastos e histórico de compras, vendas e transferências"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <AddLotDialog />
            <RegisterMovementDialog />
          </div>
        }
      />
      <LotsPaddocks />
      <MovementHistory />
    </div>
  );
}
