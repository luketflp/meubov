"use client";

/**
 * "Lots and paddocks" section: grid of cards with the occupancy summary of each lot,
 * derived from the lotsWithSummary selector (head count, weight, AU and stocking rate).
 */
import { Fence } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { lotsWithSummary, type LotWithSummary } from "@/lib/store/selectors";
import { KG_PER_AU } from "@/lib/domain/stocking";
import { kgToArroba } from "@/lib/domain/weights";
import { formatArroba, formatKg, formatNumber } from "@/lib/domain/format";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";

function LotCard({ summary }: { summary: LotWithSummary }) {
  const { lot, headCount, totalWeightKg, auPerHa, classification } = summary;
  const totalAu = totalWeightKg / KG_PER_AU;

  return (
    <article className="rounded-lg border border-hairline bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-heading text-base font-semibold text-ink">{lot.name}</h3>
          <p className="mt-0.5 truncate text-xs text-ink-soft">
            {lot.grass} · {formatNumber(lot.hectares)} ha
          </p>
        </div>
        <StatusPill status={classification} withDot />
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
        <div className="flex items-center justify-between gap-2">
          <dt className="text-ink-soft">Taxa de lotação</dt>
          <dd className="font-mono font-medium text-ink">{formatNumber(auPerHa, 2)} UA/ha</dd>
        </div>
      </dl>
    </article>
  );
}

export function LotsPaddocks() {
  const lots = useHerdStore((s) => s.lots);
  const animals = useHerdStore((s) => s.animals);
  const summaries = lotsWithSummary(lots, animals);

  return (
    <SectionCard title="Lotes e pastos">
      {summaries.length === 0 ? (
        <EmptyState
          icon={Fence}
          title="Nenhum lote cadastrado"
          description="Use o botão &quot;Novo pasto&quot; acima para cadastrar os lotes da fazenda e acompanhar a ocupação."
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
