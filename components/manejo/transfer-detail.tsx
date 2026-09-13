"use client";

/**
 * Troca de lote record: a transfer already closed at the chute, read from the
 * history. The resumo says how many heads went to which lote and where they
 * came from; below it, one line per animal with the lote it left and, when the
 * brete weighed, the weight read on the way through.
 */
import { useMemo } from "react";
import type { ManejoSession } from "@/lib/types";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { currentPlacementForLot } from "@/lib/store/selectors";
import { formatDate } from "@/lib/domain/dates";
import { formatKg, formatNumber } from "@/lib/domain/format";
import {
  movementLines,
  outcomeNote,
  transferOrigins,
  type MovementLine,
} from "@/lib/domain/manejoDetail";
import { movementSubtitle } from "@/components/manejo/helpers";
import {
  AnimalsCard,
  DetailHeader,
  ResumoCard,
  useHerdLookup,
  useLinesView,
  type LineColumn,
  type ResumoColumn,
  type ResumoRow,
} from "@/components/manejo/detail-shell";

/** "1 cabeça", "24 cabeças". */
function headsLabel(n: number): string {
  return n === 1 ? "1 cabeça" : `${formatNumber(n)} cabeças`;
}

export function TransferDetail({ session }: { session: ManejoSession }) {
  const lookup = useHerdLookup();
  const placements = useHerdStore((s) => s.lotPlacements);
  const invernadas = useHerdStore((s) => s.invernadas);

  const lines = useMemo(() => movementLines(session), [session]);
  const origins = useMemo(() => transferOrigins(session), [session]);
  const view = useLinesView(lines, true);

  const destinationName = session.destinationLotId
    ? lookup.lotName(session.destinationLotId)
    : undefined;
  // Where the destination lote grazes today, so the farmer knows which gate to open.
  const invernadaCode = useMemo(() => {
    if (!session.destinationLotId) return undefined;
    const placement = currentPlacementForLot(session.destinationLotId, placements);
    if (placement === null) return undefined;
    return invernadas.find((inv) => inv.id === placement.invernadaId)?.code;
  }, [session.destinationLotId, placements, invernadas]);

  const passed = lines.filter((line) => line.outcome === "done").length;
  const skipped = lines.filter((line) => line.outcome === "skipped").length;

  // Two lotes deleted since the troca both read "Lote excluído": they share one row.
  const headsByOrigin = new Map<string, number>();
  for (const origin of origins) {
    const label = origin.lotId === null ? "Sem lote registrado" : lookup.lotName(origin.lotId);
    headsByOrigin.set(label, (headsByOrigin.get(label) ?? 0) + origin.heads);
  }
  const originRows: ResumoRow[] = [...headsByOrigin]
    .sort((a, b) => b[1] - a[1])
    .map(([label, heads]) => ({ label, value: headsLabel(heads) }));

  const weights = lines.flatMap((line) => (line.weightKg === null ? [] : [line.weightKg]));
  const totalKg = weights.reduce((total, kg) => total + kg, 0);

  const columns: ResumoColumn[] = [
    { caption: "De onde saíram", rows: originRows },
    {
      caption: "Pesagem no brete",
      rows:
        session.weighing && weights.length > 0
          ? [
              { label: "Pesadas", value: formatNumber(weights.length) },
              { label: "Peso médio", value: formatKg(totalKg / weights.length) },
              { label: "Peso total", value: formatKg(totalKg) },
            ]
          : [],
    },
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
      header: "Lote anterior",
      cell: (line) => lookup.lotName(line.previousLotId),
      className: "text-ink-soft",
    },
    ...(session.weighing
      ? [
          {
            header: "Peso",
            align: "right" as const,
            cell: (line: MovementLine) => (line.weightKg === null ? "—" : formatKg(line.weightKg)),
            className: "font-mono text-ink",
          },
        ]
      : []),
    { header: "Observação", cell: outcomeNote, className: "text-ink-soft" },
  ];

  return (
    <div className="space-y-6">
      <DetailHeader
        title={session.name}
        action="transfer"
        session={session}
        subtitle={`${formatDate(session.date)} · ${movementSubtitle(session, destinationName)}`}
      />

      <ResumoCard
        title="Resumo da troca de lote"
        lead={
          <>
            <span className="font-medium text-ink">{headsLabel(passed)}</span>
            {destinationName ? (
              <>
                {passed === 1 ? " foi para " : " foram para "}
                <span className="font-medium text-ink">{destinationName}</span>
                {invernadaCode ? ` · Inv. ${invernadaCode}` : ""}
              </>
            ) : passed === 1 ? (
              " trocou de lote"
            ) : (
              " trocaram de lote"
            )}
            {skipped > 0
              ? ` · ${skipped === 1 ? "1 pulada" : `${formatNumber(skipped)} puladas`}`
              : ""}
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
                {lookup.categoryName(animal)} · {animal?.breed ?? "—"}
              </p>
              <p className="mt-1 text-xs text-ink-soft">
                {line.previousLotId
                  ? `de ${lookup.lotName(line.previousLotId)}`
                  : "sem lote anterior registrado"}
              </p>
              {note ? <p className="mt-1 text-xs text-ink-soft">{note}</p> : null}
            </>
          );
        }}
      />
    </div>
  );
}
