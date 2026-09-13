"use client";

/**
 * Lots screen: logical cattle groups, current invernada and placement history.
 * What used to share this
 * screen — compras, vendas e transferências — is now recorded in Manejo, where
 * the animals actually pass one by one.
 */
import { PageHeader } from "@/components/layout/PageHeader";
import { ReadOnlyPill } from "@/components/layout/ReadOnlyPill";
import { AddLotDialog } from "@/components/lots/add-lot-dialog";
import { LotsPaddocks } from "@/components/lots/lots-paddocks";
import { useCan } from "@/lib/store/usePermissions";

export default function LotsPage() {
  const canEditLots = useCan("lots", "edit");
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8">
      <PageHeader
        title="Lotes"
        subtitle="Grupos de animais e a invernada onde cada um está"
        badges={canEditLots ? undefined : <ReadOnlyPill />}
        actions={canEditLots ? <AddLotDialog /> : undefined}
      />
      <LotsPaddocks />
    </div>
  );
}
