"use client";

/**
 * Logical cattle groups with their current physical invernada.
 */
import { useState } from "react";
import { Fence, Trash2 } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { isLotDeletable, lotsWithSummary, type LotWithSummary } from "@/lib/store/selectors";
import { KG_PER_AU } from "@/lib/domain/stocking";
import { kgToArroba } from "@/lib/domain/weights";
import { formatArroba, formatKg, formatNumber } from "@/lib/domain/format";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EditLotDialog } from "@/components/lots/edit-lot-dialog";
import { MoveLotDialog } from "@/components/lots/move-lot-dialog";
import { ArchiveLotDialog } from "@/components/lots/archive-lot-dialog";

function LotCard({ summary }: { summary: LotWithSummary }) {
  const { lot, headCount, totalWeightKg, currentPlacement, currentInvernada } = summary;
  const removeLot = useHerdStore((state) => state.removeLot);
  const deletable = useHerdStore((state) =>
    isLotDeletable(lot.id, state.animals, state.manejoSessions, state.lotPlacements)
  );
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const totalAu = totalWeightKg / KG_PER_AU;

  async function onRemove() {
    if (
      !window.confirm(
        `Excluir o cadastro do lote ${lot.name}? Use esta opção apenas para um lote criado por engano. Esta ação não pode ser desfeita.`
      )
    ) {
      return;
    }
    setRemoving(true);
    setRemoveError(null);
    try {
      if (!(await removeLot(lot.id))) {
        setRemoveError("Este lote já tem animais ou histórico e não pode ser excluído.");
      }
    } finally {
      setRemoving(false);
    }
  }

  return (
    <article className="rounded-lg border border-hairline bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-heading text-base font-semibold text-ink">{lot.name}</h3>
          <p className="mt-0.5 truncate text-xs text-ink-soft">
            {currentInvernada
              ? `Invernada ${currentInvernada.code}${currentInvernada.name ? ` · ${currentInvernada.name}` : ""}`
              : currentPlacement
                ? "Invernada não encontrada"
                : "Lote encerrado"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {lot.needsReview ? <Badge variant="outline">Revisar cadastro</Badge> : null}
          {!currentPlacement ? <Badge variant="secondary">Encerrado</Badge> : null}
          <EditLotDialog lot={lot} />
        </div>
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="font-mono text-2xl font-semibold text-ink">{headCount}</span>
        <span className="text-xs text-ink-soft">{headCount === 1 ? "cabeça" : "cabeças"}</span>
      </div>

      <dl className="mt-3 space-y-1.5 border-t border-hairline pt-3 text-xs">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-ink-soft">Peso total</dt>
          <dd className="font-mono text-ink">
            {formatKg(totalWeightKg)} · {formatArroba(kgToArroba(totalWeightKg))}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-ink-soft">UA totais</dt>
          <dd className="font-mono text-ink">{formatNumber(totalAu, 1)} UA</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-hairline pt-3">
        {currentPlacement && headCount === 0 ? (
          <ArchiveLotDialog lot={lot} currentPlacement={currentPlacement} />
        ) : null}
        {deletable ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={removing}
            onClick={onRemove}
            className="min-h-9 text-ink-soft hover:text-overdue"
          >
            <Trash2 aria-hidden />
            {removing ? "Excluindo…" : "Excluir cadastro"}
          </Button>
        ) : null}
        <MoveLotDialog lot={lot} currentInvernada={currentInvernada} />
      </div>
      {removeError ? <p className="mt-2 text-right text-xs text-overdue">{removeError}</p> : null}
    </article>
  );
}

export function LotsPaddocks() {
  const lots = useHerdStore((s) => s.lots);
  const animals = useHerdStore((s) => s.animals);
  const invernadas = useHerdStore((s) => s.invernadas);
  const lotPlacements = useHerdStore((s) => s.lotPlacements);
  const summaries = lotsWithSummary(lots, animals, invernadas, lotPlacements);

  return (
    <SectionCard title="Lotes">
      {summaries.length === 0 ? (
        <EmptyState
          icon={Fence}
          title="Nenhum lote cadastrado"
          description="Use o botão &quot;Novo lote&quot; acima para cadastrar um grupo de animais e informar sua invernada atual."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {summaries.map((summary) => (
            <LotCard key={summary.lot.id} summary={summary} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}
