"use client";

/**
 * Pesagem record: a weighing manejo already closed at the chute. The resumo
 * holds the lot's weight and, when the animals had been weighed before, what
 * they gained since; below it, one line per animal with the weight read on the
 * scale beside its previous weighing, the gain and the ganho médio diário.
 * The gain always compares with the animal's last weighing dated before the
 * manejo, whatever wrote it.
 */
import { useMemo } from "react";
import type { ManejoSession } from "@/lib/types";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { formatDate } from "@/lib/domain/dates";
import { formatArroba, formatKg, formatNumber } from "@/lib/domain/format";
import {
  outcomeNote,
  passedLabel,
  sessionWeighingLines,
  weighingTotals,
  type WeighingLine,
} from "@/lib/domain/manejoDetail";
import {
  AnimalsCard,
  DetailHeader,
  HeadsLead,
  ResumoCard,
  formatAdg,
  shortDate,
  signedKg,
  useHerdLookup,
  useLinesView,
  type LineColumn,
  type ResumoRow,
} from "@/components/manejo/detail-shell";
import { cn } from "@/lib/utils";

/** Soft-red for a gain below zero: the animal lost weight since the last pesagem. */
function lossClass(n: number): string | undefined {
  return n < 0 ? "text-overdue" : undefined;
}

/** "Categoria · Lote" under the brinco of a phone card. */
export function WeighingCardHerdLine({
  categoryName,
  lotName,
}: {
  categoryName: string;
  lotName: string;
}) {
  return (
    <p className="mt-1 text-xs text-ink-soft">
      {categoryName} · {lotName}
    </p>
  );
}

/**
 * The phone card's comparison line: "anterior 472 kg em 18/05 · +46 kg ·
 * 0,479 kg/dia", or "primeira pesagem" when the animal had never been weighed.
 * Nothing for an animal that did not pass.
 */
export function WeighingTrail({ line, date }: { line: WeighingLine; date: string }) {
  if (line.weightKg === null) return null;
  if (line.previous === null) {
    return <p className="mt-1 text-xs text-ink-soft">primeira pesagem</p>;
  }
  const { gain } = line;
  return (
    <p className="mt-1 text-xs text-ink-soft">
      anterior {formatKg(line.previous.weightKg)} em {shortDate(line.previous.date, date)}
      {gain ? (
        <>
          {" · "}
          <span className={cn("font-mono", lossClass(gain.gainKg))}>{signedKg(gain.gainKg)}</span>
          {" · "}
          <span className={cn("font-mono", lossClass(gain.adgKgDay))}>
            {formatAdg(gain.adgKgDay)} kg/dia
          </span>
        </>
      ) : null}
    </p>
  );
}

export function WeighingDetail({ session }: { session: ManejoSession }) {
  const animals = useHerdStore((s) => s.animals);
  const lookup = useHerdLookup();
  const lines = useMemo(() => sessionWeighingLines(session, animals), [session, animals]);
  const totals = weighingTotals(lines);
  // Opens on the animals weighed; the skipped and the pending are one switch away.
  const view = useLinesView(lines, true);

  const heads = session.animals.length;
  const subtitle = `${formatDate(session.date)} · Manejo de ${
    heads === 1 ? "1 animal" : `${formatNumber(heads)} animais`
  }`;

  const lot: ResumoRow[] = [];
  const perHead: ResumoRow[] = [];
  if (totals.totalKg !== null && totals.avgKg !== null) {
    lot.push(
      { label: "Peso total", value: formatKg(totals.totalKg) },
      { label: "@ viva (÷30)", value: formatArroba(totals.totalKg / 30) }
    );
    perHead.push(
      { label: "Peso vivo", value: formatKg(totals.avgKg) },
      { label: "@ viva (÷30)", value: formatArroba(totals.avgKg / 30) }
    );
  }
  // Gain needs a weighing before the manejo: with none in the lot the rows
  // would only say "—", so they drop out.
  if (totals.totalGainKg !== null && totals.avgGainKg !== null && totals.avgAdgKgDay !== null) {
    lot.push({
      label: "Ganho total",
      value: signedKg(totals.totalGainKg),
      suffix:
        totals.withPrevious < totals.weighed
          ? `${formatNumber(totals.withPrevious)} com pesagem anterior`
          : undefined,
    });
    perHead.push(
      { label: "Ganho", value: signedKg(totals.avgGainKg) },
      { label: "GMD", value: `${formatAdg(totals.avgAdgKgDay)} kg/dia` }
    );
  }

  /** The table's note: the outcome and the animal's own, or that it had never been weighed. */
  const note = (line: WeighingLine): string => {
    const text = outcomeNote(line);
    if (text === "" && line.weightKg !== null && line.previous === null) return "primeira pesagem";
    return text;
  };

  const columns: LineColumn<WeighingLine>[] = [
    {
      header: "Brinco",
      cell: (line) => line.earTag,
      className: "font-mono font-medium text-ink",
    },
    {
      header: "Categoria",
      cell: (line) => lookup.categoryName(lookup.animal(line.earTag)),
      className: "text-ink",
    },
    {
      header: "Lote",
      cell: (line) => lookup.lotName(lookup.animal(line.earTag)?.lotId),
      className: "text-ink-soft",
    },
    {
      header: "Peso",
      align: "right",
      cell: (line) => (line.weightKg === null ? "—" : formatKg(line.weightKg)),
      className: "font-mono text-ink",
    },
    {
      header: "Pesagem anterior",
      align: "right",
      cell: (line) =>
        line.previous === null ? (
          "—"
        ) : (
          <>
            {formatKg(line.previous.weightKg)}{" "}
            <span className="text-xs text-ink-soft">
              em {shortDate(line.previous.date, session.date)}
            </span>
          </>
        ),
      className: "font-mono text-ink",
    },
    {
      header: "Ganho",
      align: "right",
      cell: (line) =>
        line.gain === null ? (
          "—"
        ) : (
          <span className={lossClass(line.gain.gainKg)}>{signedKg(line.gain.gainKg)}</span>
        ),
      className: "font-mono text-ink",
    },
    {
      header: "GMD kg/dia",
      align: "right",
      cell: (line) =>
        line.gain === null ? (
          "—"
        ) : (
          <span className={lossClass(line.gain.adgKgDay)}>{formatAdg(line.gain.adgKgDay)}</span>
        ),
      className: "font-mono text-ink",
    },
    {
      header: "Observação",
      cell: note,
      className: "text-ink-soft",
    },
  ];

  return (
    <div className="space-y-6">
      <DetailHeader title={session.name} action="weighing" subtitle={subtitle} session={session} />

      <ResumoCard
        title="Resumo da pesagem"
        lead={
          <HeadsLead
            passed={totals.passed}
            total={totals.total}
            skipped={totals.skipped}
            participle={passedLabel(session)}
          />
        }
        columns={[
          { caption: "Lote", rows: lot },
          { caption: "Média por cabeça", rows: perHead },
        ]}
      />

      <AnimalsCard
        view={view}
        scoped
        columns={columns}
        card={(line) => {
          const animal = lookup.animal(line.earTag);
          const text = outcomeNote(line);
          return (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-sm font-medium text-ink">{line.earTag}</span>
                <span className="font-mono text-sm text-ink">
                  {line.weightKg === null ? "—" : formatKg(line.weightKg)}
                </span>
              </div>
              <WeighingCardHerdLine
                categoryName={lookup.categoryName(animal)}
                lotName={lookup.lotName(animal?.lotId)}
              />
              <WeighingTrail line={line} date={session.date} />
              {text ? <p className="mt-1 text-xs text-ink-soft">{text}</p> : null}
            </>
          );
        }}
      />
    </div>
  );
}
