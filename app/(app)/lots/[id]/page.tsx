"use client";

/**
 * Ficha do lote (/lots/[id]): where the group stands, the resumo of its
 * numbers and the animals in it. Opened from the lot's name on /lots.
 */
import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, SearchX } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { formatDate, todayISO } from "@/lib/domain/dates";
import { animalsByBreed, lotSummary, withStatus } from "@/lib/store/selectors";
import { DEFAULT_SORT, sortHerd } from "@/components/herd/filters";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReadOnlyPill } from "@/components/layout/ReadOnlyPill";
import { LotActions } from "@/components/lots/lot-actions";
import { LotAnimalsCard } from "@/components/lots/lot-animals";
import { LotSummaryCard } from "@/components/lots/lot-summary";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ExportMenu } from "@/components/export/ExportMenu";
import { herdExportTable } from "@/lib/export/datasets/herd";
import { currentInvernadaNames } from "@/lib/export/datasets/lots";

function BackLink() {
  return (
    <Link
      href="/lots"
      className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink md:min-h-0"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Lotes
    </Link>
  );
}

const invernadaLabel = (code: string, name?: string) => `${code}${name ? ` · ${name}` : ""}`;

export default function LotRecordPage() {
  const params = useParams<{ id: string }>();

  const lots = useHerdStore((s) => s.lots);
  const animals = useHerdStore((s) => s.animals);
  const treatments = useHerdStore((s) => s.treatments);
  const invernadas = useHerdStore((s) => s.invernadas);
  const removedInvernadas = useHerdStore((s) => s.removedInvernadas);
  const lotPlacements = useHerdStore((s) => s.lotPlacements);
  const customCategories = useHerdStore((s) => s.customCategories);
  const canEditLots = useCan("lots", "edit");

  const today = todayISO();
  const summary = useMemo(
    () =>
      lotSummary(
        params.id,
        { lots, animals, treatments, invernadas, removedInvernadas, lotPlacements },
        today
      ),
    [params.id, lots, animals, treatments, invernadas, removedInvernadas, lotPlacements, today]
  );
  const rows = useMemo(
    () =>
      summary
        ? sortHerd(withStatus(summary.animals, treatments, today), DEFAULT_SORT, new Map())
        : [],
    [summary, treatments, today]
  );

  if (!summary) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 md:px-8">
        <BackLink />
        <div className="rounded-lg border border-hairline bg-panel pb-8">
          <EmptyState
            icon={SearchX}
            title="Lote não encontrado"
            description="Este lote não existe ou foi excluído. Volte à lista e tente novamente."
          />
          <div className="flex justify-center">
            <Link
              href="/lots"
              className="inline-flex min-h-11 items-center rounded-lg bg-brand px-4 text-sm font-medium text-panel transition-colors hover:bg-brand/90"
            >
              Voltar aos lotes
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { lot, currentPlacement, currentInvernada } = summary;
  const lastInvernada = summary.placements[0]?.invernada ?? null;
  const subtitle = currentPlacement
    ? currentInvernada
      ? `Invernada ${invernadaLabel(currentInvernada.code, currentInvernada.name)} · desde ${formatDate(currentPlacement.startedOn)}`
      : "Invernada não encontrada"
    : `Lote encerrado${
        lastInvernada
          ? ` · última invernada ${invernadaLabel(lastInvernada.code, lastInvernada.name)}`
          : ""
      }`;

  // The file follows the Animais card: raça by raça, each by ear tag.
  const exportTitle = `Lote ${lot.name}`;
  const exportMenu = (
    <ExportMenu
      title={exportTitle}
      current={{
        label: "Animais do lote",
        detail: rows.length === 1 ? "1 animal" : `${rows.length} animais`,
        build: () => [
          herdExportTable(
            animalsByBreed(rows).flatMap((group) => group.items),
            {
              lotNames: new Map(lots.map((item) => [item.id, item.name])),
              invernadaNames: currentInvernadaNames(invernadas, lotPlacements),
              customCategories,
            },
            todayISO(),
            exportTitle
          ),
        ],
      }}
      hint="Todos os animais do lote, com as colunas do Rebanho: raça a raça, por brinco."
    />
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackLink />
        <LotActions summary={summary} />
      </div>

      <PageHeader
        title={lot.name}
        subtitle={subtitle}
        badges={
          lot.needsReview || !currentPlacement || !canEditLots ? (
            <>
              {lot.needsReview ? <Badge variant="outline">Revisar cadastro</Badge> : null}
              {!currentPlacement ? <Badge variant="secondary">Encerrado</Badge> : null}
              {canEditLots ? null : <ReadOnlyPill />}
            </>
          ) : undefined
        }
        actions={exportMenu}
      />

      <LotSummaryCard summary={summary} />

      <LotAnimalsCard key={lot.id} items={rows} />
    </div>
  );
}
