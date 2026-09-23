"use client";

/**
 * Compra record: an entrada already closed at the chute, read from the history.
 * The resumo holds what was paid — in total, per head and, when every animal
 * received was weighed, per arroba viva; below it, one line per animal with the
 * weight it arrived with.
 */
import { useMemo } from "react";
import type { ManejoSession } from "@/lib/types";
import { formatDate } from "@/lib/domain/dates";
import { formatCurrency, formatKg, formatNumber } from "@/lib/domain/format";
import { SEX_LABEL } from "@/lib/domain/labels";
import {
  entryTotals,
  movementLines,
  outcomeNote,
  type MovementLine,
} from "@/lib/domain/manejoDetail";
import { movementSubtitle } from "@/components/manejo/helpers";
import { entryLinesExportTable } from "@/lib/export/datasets/manejo";
import {
  AnimalsCard,
  DetailHeader,
  LinesExportMenu,
  ResumoCard,
  useDetailExportNames,
  useHerdLookup,
  useLinesView,
  type LineColumn,
  type ResumoColumn,
  type ResumoRow,
} from "@/components/manejo/detail-shell";

export function EntryDetail({ session }: { session: ManejoSession }) {
  const lookup = useHerdLookup();
  const lines = useMemo(() => movementLines(session), [session]);
  const totals = useMemo(() => entryTotals(session), [session]);
  const view = useLinesView(lines, true);
  const exportNames = useDetailExportNames();

  const destinationName = session.destinationLotId
    ? lookup.lotName(session.destinationLotId)
    : undefined;

  const purchase: ResumoRow[] = [];
  if (session.counterparty) purchase.push({ label: "Vendedor", value: session.counterparty });
  if (totals.totalBrl !== null) {
    purchase.push({ label: "Valor total", value: formatCurrency(totals.totalBrl) });
  }
  if (totals.perHeadBrl !== null) {
    purchase.push({ label: "R$/cabeça", value: formatCurrency(totals.perHeadBrl) });
  }

  const arrival: ResumoRow[] = [];
  if (totals.weighed > 0) {
    arrival.push({ label: "Pesadas", value: formatNumber(totals.weighed) });
    if (totals.avgKg !== null) arrival.push({ label: "Peso médio", value: formatKg(totals.avgKg) });
    // Only priced per arroba when every animal received was weighed: a partial
    // weighing would spread the whole value over part of the kilos.
    if (totals.perArrobaBrl !== null) {
      arrival.push({ label: "R$/@ viva", value: formatCurrency(totals.perArrobaBrl) });
    }
  }

  const columns: ResumoColumn[] = [
    { caption: "Compra", rows: purchase },
    { caption: "Peso de entrada", rows: arrival },
  ];

  const lineColumns: LineColumn<MovementLine>[] = [
    { header: "Brinco", cell: (line) => line.earTag, className: "font-mono font-medium text-ink" },
    {
      header: "Categoria",
      cell: (line) => lookup.categoryName(lookup.animal(line.earTag)),
      className: "text-ink",
    },
    {
      header: "Raça",
      cell: (line) => lookup.animal(line.earTag)?.breed ?? "—",
      className: "text-ink",
    },
    {
      header: "Sexo",
      cell: (line) => sexLabel(lookup.animal(line.earTag)?.sex),
      className: "text-ink",
    },
    {
      header: "Peso de entrada",
      align: "right",
      cell: (line) => (line.weightKg === null ? "—" : formatKg(line.weightKg)),
      className: "font-mono text-ink",
    },
    { header: "Observação", cell: outcomeNote, className: "text-ink-soft" },
  ];

  return (
    <div className="space-y-6">
      <DetailHeader
        title={session.name}
        action="entry"
        session={session}
        extra={
          <LinesExportMenu
            title={session.name}
            lines={lines}
            visible={view.visible}
            build={(rows) => entryLinesExportTable(session.name, rows, exportNames)}
          />
        }
        subtitle={`${formatDate(session.date)} · ${movementSubtitle(session, destinationName)}`}
      />

      <ResumoCard
        title="Resumo da compra"
        lead={
          <>
            <span className="font-medium text-ink">
              {totals.heads === 1 ? "1 cabeça" : `${formatNumber(totals.heads)} cabeças`}
            </span>
            {session.counterparty ? ` de ${session.counterparty}` : ""}
            {destinationName ? (
              <>
                , no lote <span className="font-medium text-ink">{destinationName}</span>
              </>
            ) : null}
          </>
        }
        columns={columns}
      />

      <AnimalsCard
        view={view}
        scoped
        columns={lineColumns}
        card={(line) => {
          const animal = lookup.animal(line.earTag);
          const note = outcomeNote(line);
          return (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-sm font-medium text-ink">{line.earTag}</span>
                {line.weightKg !== null ? (
                  <span className="font-mono text-sm text-ink">{formatKg(line.weightKg)}</span>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-ink-soft">
                {lookup.categoryName(animal)} · {animal?.breed ?? "—"} · {sexLabel(animal?.sex)}
              </p>
              {note ? <p className="mt-1 text-xs text-ink-soft">{note}</p> : null}
            </>
          );
        }}
      />
    </div>
  );
}

/** "Macho", "Fêmea"; "—" for an animal no longer in the store. */
function sexLabel(sex: keyof typeof SEX_LABEL | undefined): string {
  return sex ? SEX_LABEL[sex] : "—";
}
