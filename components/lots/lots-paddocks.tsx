"use client";

/**
 * Logical cattle groups with their current physical invernada.
 */
import Link from "next/link";
import { ChevronRight, Fence } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { canDeleteLot, lotsWithSummary, type LotWithSummary } from "@/lib/store/selectors";
import { KG_PER_AU } from "@/lib/domain/stocking";
import { kgToArroba } from "@/lib/domain/weights";
import { formatArroba, formatKg, formatNumber } from "@/lib/domain/format";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { DeleteLotButton } from "@/components/lots/delete-lot-button";
import { EditLotDialog } from "@/components/lots/edit-lot-dialog";
import { MoveLotDialog } from "@/components/lots/move-lot-dialog";
import { ArchiveLotDialog } from "@/components/lots/archive-lot-dialog";

function LotCard({ summary }: { summary: LotWithSummary }) {
  const { lot, headCount, totalWeightKg, currentPlacement, currentInvernada } = summary;
  const deletable = useHerdStore((state) =>
    canDeleteLot(lot.id, state.animals, state.manejoSessions)
  );
  const totalAu = totalWeightKg / KG_PER_AU;

  return (
    <article className="rounded-lg border border-hairline bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/lots/${lot.id}`}
            aria-label={`Abrir lote ${lot.name}`}
            className="inline-flex items-center gap-1 font-heading text-base font-semibold text-ink underline-offset-2 hover:underline"
          >
            {lot.name}
            <ChevronRight className="size-4 text-ink-soft" aria-hidden />
          </Link>
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
        {deletable ? <DeleteLotButton lot={lot} /> : null}
        <MoveLotDialog lot={lot} currentInvernada={currentInvernada} />
      </div>
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
