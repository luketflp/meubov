"use client";

/**
 * The actions of a lote on its ficha: the same dialogs the /lots card offers
 * (editar, encerrar, excluir, mover), guarded the same way. Deleting sends
 * the farmer back to the list, since the page has nothing left to show.
 * Every one of them writes, so whoever may only read Lotes e Mapa gets none.
 */
import { useRouter } from "next/navigation";
import type { LotSummary } from "@/lib/store/selectors";
import { canDeleteLot } from "@/lib/store/selectors";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { ArchiveLotDialog } from "@/components/lots/archive-lot-dialog";
import { DeleteLotButton } from "@/components/lots/delete-lot-button";
import { EditLotDialog } from "@/components/lots/edit-lot-dialog";
import { MoveLotDialog } from "@/components/lots/move-lot-dialog";

export function LotActions({ summary }: { summary: LotSummary }) {
  const canEditLots = useCan("lots", "edit");
  const router = useRouter();
  const animals = useHerdStore((state) => state.animals);
  const manejoSessions = useHerdStore((state) => state.manejoSessions);
  if (!canEditLots) return null;
  const { lot, heads, currentPlacement, currentInvernada } = summary;
  const deletable = canDeleteLot(lot.id, animals, manejoSessions);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <EditLotDialog lot={lot} trigger="button" />
      {currentPlacement && heads === 0 ? (
        <ArchiveLotDialog lot={lot} currentPlacement={currentPlacement} />
      ) : null}
      {deletable ? <DeleteLotButton lot={lot} onDeleted={() => router.replace("/lots")} /> : null}
      <MoveLotDialog lot={lot} currentInvernada={currentInvernada} />
    </div>
  );
}
