"use client";

/**
 * The /lots index, read by pasture: one section per invernada that holds a lote
 * today — with its capim, hectares and grazing pressure — the lotes as cards
 * inside it, then the free invernadas and the lotes already encerrados.
 */
import Link from "next/link";
import { Beef, ChevronRight, Fence, Scale, Sprout } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import {
  lotsByInvernada,
  type ClosedLotRow,
  type FreeInvernada,
  type InvernadaSection,
} from "@/lib/store/selectors";
import { formatDate, todayISO } from "@/lib/domain/dates";
import { formatNumber } from "@/lib/domain/format";
import { LotCard } from "@/components/lots/lot-card";
import { LotCardMenu } from "@/components/lots/lot-card-menu";
import { STOCKING_LABEL, StockingBar } from "@/components/lots/stocking-bar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { SectionCard } from "@/components/ui/section-card";

const invernadaTitle = (code: string, name?: string): string =>
  `Invernada ${code}${name ? ` · ${name}` : ""}`;

function InvernadaGroup({ section }: { section: InvernadaSection }) {
  const { invernada } = section;

  return (
    <section className="rounded-lg border border-hairline bg-panel">
      <header className="flex flex-col gap-3 border-b border-hairline px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-brand-soft">
            <Fence className="size-4 text-brand" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="truncate font-heading text-base font-semibold text-ink">
              {invernadaTitle(invernada.code, invernada.name)}
            </h2>
            <p className="truncate text-xs text-ink-soft">
              {invernada.grass} · {formatNumber(invernada.hectares, 1)} ha
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:shrink-0 sm:flex-row sm:items-center sm:gap-5">
          <p className="font-mono text-sm whitespace-nowrap text-ink">
            {section.headCount} {section.headCount === 1 ? "cabeça" : "cabeças"}
            <span className="text-ink-soft"> · {formatNumber(section.totalAu, 1)} UA</span>
          </p>
          <StockingBar auPerHa={section.auPerHa} classification={section.classification} />
        </div>
      </header>
      {/* Flex, not grid: a section with one lote gets a card that reads as a
          card, not a third of an empty row. */}
      <div className="flex flex-wrap gap-3 p-4">
        {section.lots.map((row) => (
          <LotCard key={row.lot.id} row={row} invernada={invernada} />
        ))}
      </div>
    </section>
  );
}

function FreeInvernadaChip({ item }: { item: FreeInvernada }) {
  const { invernada, freeForDays } = item;

  return (
    <div className="flex min-h-8 flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border border-hairline bg-surface px-2.5 py-1 text-xs text-ink-soft">
      <span className="font-mono font-medium text-ink">{invernada.code}</span>
      {invernada.name ? <span className="text-ink">{invernada.name}</span> : null}
      <span aria-hidden className="text-hairline">
        |
      </span>
      <span>
        {formatNumber(invernada.hectares, 1)} ha · {invernada.grass}
      </span>
      <span>· {freeForDays === null ? "nunca ocupada" : `livre há ${freeForDays} d`}</span>
    </div>
  );
}

function ClosedLotCard({ row }: { row: ClosedLotRow }) {
  const { lot, closedOn, lastInvernada } = row;

  return (
    <article className="relative min-w-0 flex-1 basis-72 sm:max-w-[32rem]">
      <Link
        href={`/lots/${lot.id}`}
        aria-label={`Abrir lote ${lot.name}`}
        className="flex min-h-11 flex-col gap-1.5 rounded-lg border border-hairline bg-surface p-3.5 transition-colors hover:border-brand/45"
      >
        <div className="flex items-start gap-2 pr-10">
          <span className="min-w-0 truncate font-heading text-[15px] font-semibold text-ink-soft">
            {lot.name}
          </span>
          <ChevronRight className="mt-0.5 size-4 shrink-0 text-ink-soft" aria-hidden />
          <Badge variant="secondary" className="shrink-0">
            Encerrado
          </Badge>
        </div>
        <p className="text-xs text-ink-soft">
          {closedOn ? `Encerrado em ${formatDate(closedOn)}` : "Nunca ocupou uma invernada"}
        </p>
        {lastInvernada ? (
          <p className="text-xs text-ink-soft">
            Última invernada: {lastInvernada.code}
            {lastInvernada.name ? ` · ${lastInvernada.name}` : ""}
          </p>
        ) : null}
      </Link>
      <div className="absolute top-2 right-2">
        <LotCardMenu row={row} invernada={lastInvernada} />
      </div>
    </article>
  );
}

export function LotsPaddocks() {
  const lots = useHerdStore((state) => state.lots);
  const animals = useHerdStore((state) => state.animals);
  const treatments = useHerdStore((state) => state.treatments);
  const invernadas = useHerdStore((state) => state.invernadas);
  const removedInvernadas = useHerdStore((state) => state.removedInvernadas);
  const lotPlacements = useHerdStore((state) => state.lotPlacements);
  const manejoSessions = useHerdStore((state) => state.manejoSessions);

  const { sections, free, closed, totals } = lotsByInvernada(
    { lots, animals, treatments, invernadas, removedInvernadas, lotPlacements, manejoSessions },
    todayISO()
  );
  const freeHectares = free.reduce((sum, item) => sum + item.invernada.hectares, 0);
  const hasLots = sections.length > 0 || closed.length > 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Lotes ativos"
          value={totals.activeLots}
          sub={`em ${totals.occupiedInvernadas} ${totals.occupiedInvernadas === 1 ? "invernada" : "invernadas"}`}
          icon={Fence}
        />
        <KpiCard
          label="Cabeças"
          value={totals.heads}
          sub={`${totals.weighedHeads} com pesagem`}
          icon={Beef}
        />
        <KpiCard
          label="UA totais"
          value={formatNumber(totals.totalAu, 1)}
          sub="1 UA = 450 kg"
          icon={Scale}
        />
        <KpiCard
          label="Lotação média"
          value={
            <span className="flex items-baseline gap-1.5">
              {formatNumber(totals.herdAuPerHa, 2)}
              <span className="font-sans text-[13px] font-normal text-ink-soft">UA/ha</span>
            </span>
          }
          sub={STOCKING_LABEL[totals.herdClassification]}
          icon={Sprout}
        />
      </div>

      {!hasLots ? (
        <SectionCard title="Lotes">
          <EmptyState
            icon={Fence}
            title="Nenhum lote cadastrado"
            description="Use o botão &quot;Novo lote&quot; acima para cadastrar um grupo de animais e informar sua invernada atual."
          />
        </SectionCard>
      ) : null}

      {sections.map((section) => (
        <InvernadaGroup key={section.invernada.id} section={section} />
      ))}

      {free.length > 0 ? (
        <SectionCard
          title="Invernadas livres"
          action={
            <span className="text-xs text-ink-soft">
              {formatNumber(freeHectares, 1)} ha sem lote
            </span>
          }
        >
          <div className="flex flex-wrap gap-2">
            {free.map((item) => (
              <FreeInvernadaChip key={item.invernada.id} item={item} />
            ))}
          </div>
        </SectionCard>
      ) : null}

      {closed.length > 0 ? (
        <SectionCard
          title="Lotes encerrados"
          action={
            <span className="text-xs text-ink-soft">
              {closed.length} {closed.length === 1 ? "lote" : "lotes"}
            </span>
          }
        >
          <div className="flex flex-wrap gap-3">
            {closed.map((row) => (
              <ClosedLotCard key={row.lot.id} row={row} />
            ))}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
