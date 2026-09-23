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
import { ExportMenu } from "@/components/export/ExportMenu";
import { lotsExportTable } from "@/lib/export/datasets/lots";
import { activeLots, lotsByInvernada } from "@/lib/store/selectors";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { todayISO } from "@/lib/domain/dates";

export default function LotsPage() {
  const canEditLots = useCan("lots", "edit");
  const lots = useHerdStore((state) => state.lots);
  const animals = useHerdStore((state) => state.animals);
  const treatments = useHerdStore((state) => state.treatments);
  const invernadas = useHerdStore((state) => state.invernadas);
  const lotPlacements = useHerdStore((state) => state.lotPlacements);
  const manejoSessions = useHerdStore((state) => state.manejoSessions);

  // Built on click, from the same selector the sections below draw with.
  const view = () =>
    lotsByInvernada({ lots, animals, treatments, invernadas, lotPlacements, manejoSessions }, todayISO());
  const lotCount = activeLots(lots).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8">
      <PageHeader
        title="Lotes"
        subtitle="Grupos de animais e a invernada onde cada um está"
        badges={canEditLots ? undefined : <ReadOnlyPill />}
        actions={
          <>
            <ExportMenu
              title="Lotes"
              current={{
                label: "Lotes por invernada",
                detail: `${lotCount} ${lotCount === 1 ? "lote" : "lotes"} · ${invernadas.length} ${invernadas.length === 1 ? "invernada" : "invernadas"}`,
                build: () => [lotsExportTable(view())],
              }}
              hint="Uma linha por lote na sua invernada, depois as invernadas livres e os lotes encerrados."
            />
            {canEditLots ? <AddLotDialog /> : null}
          </>
        }
      />
      <LotsPaddocks />
    </div>
  );
}
