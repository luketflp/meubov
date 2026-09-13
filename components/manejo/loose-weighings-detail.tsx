"use client";

/**
 * Pesagens avulsas: the weights saved on one day outside a manejo at the chute
 * — on the animal's ficha, at the cadastro or as a peso ao nascer. No session
 * stands behind them, so the page has nothing to delete (the history row's menu
 * does that) and no scope to switch: every line is a weight that was taken.
 * A weight dated on the animal's birth date is a peso ao nascer and says so in
 * place of the previous weighing.
 */
import { useMemo } from "react";
import { Info } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { formatDate } from "@/lib/domain/dates";
import { formatKg, formatNumber } from "@/lib/domain/format";
import {
  looseWeighingLines,
  weighingTotals,
  type WeighingLine,
} from "@/lib/domain/manejoDetail";
import {
  AnimalsCard,
  DetailHeader,
  NotFoundCard,
  ResumoCard,
  formatAdg,
  shortDate,
  useHerdLookup,
  useLinesView,
  type LineColumn,
  type ResumoColumn,
} from "@/components/manejo/detail-shell";
import { WeighingCardHerdLine, WeighingTrail } from "@/components/manejo/weighing-detail";

/** The badge that takes the previous weighing's place on a peso ao nascer. */
function AtBirthBadge() {
  return (
    <span className="inline-flex items-center rounded-md bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand">
      ao nascer
    </span>
  );
}

export function LooseWeighingsDetail({ date }: { date: string }) {
  const animals = useHerdStore((s) => s.animals);
  const sessions = useHerdStore((s) => s.manejoSessions);
  const lookup = useHerdLookup();
  const lines = useMemo(
    () => looseWeighingLines(date, animals, sessions),
    [date, animals, sessions]
  );
  const view = useLinesView(lines, false);

  if (lines.length === 0) {
    return (
      <NotFoundCard
        title="Registro não encontrado"
        description="Nenhuma pesagem avulsa neste dia."
      />
    );
  }

  const totals = weighingTotals(lines);
  const columns: ResumoColumn[] = [
    {
      caption: "Pesos",
      rows:
        totals.totalKg !== null && totals.avgKg !== null
          ? [
              { label: "Peso total", value: formatKg(totals.totalKg) },
              { label: "Peso médio", value: formatKg(totals.avgKg) },
            ]
          : [],
    },
    {
      caption: "Ao nascer",
      rows:
        totals.atBirth > 0 && totals.avgAtBirthKg !== null
          ? [
              { label: "Bezerros", value: formatNumber(totals.atBirth) },
              { label: "Peso médio ao nascer", value: formatKg(totals.avgAtBirthKg) },
            ]
          : [],
    },
  ];

  const lineColumns: LineColumn<WeighingLine>[] = [
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
        line.atBirth ? (
          <AtBirthBadge />
        ) : line.previous === null ? (
          "—"
        ) : (
          <>
            {formatKg(line.previous.weightKg)}{" "}
            <span className="text-xs text-ink-soft">em {shortDate(line.previous.date, date)}</span>
          </>
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
          <span className={line.gain.adgKgDay < 0 ? "text-overdue" : undefined}>
            {formatAdg(line.gain.adgKgDay)}
          </span>
        ),
      className: "font-mono text-ink",
    },
  ];

  return (
    <div className="space-y-6">
      <DetailHeader
        title="Pesagens avulsas"
        action="weighing"
        subtitle={`${formatDate(date)} · fora do brete`}
      />

      <div className="flex gap-2.5 rounded-lg border border-hairline bg-surface px-4 py-3 text-sm text-ink-soft">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          Pesos salvos neste dia fora de um manejo no brete: na ficha do animal, no cadastro ou
          como peso ao nascer. Para apagar, use o menu da linha no histórico.
        </p>
      </div>

      <ResumoCard
        title="Resumo do dia"
        lead={
          <>
            <span className="font-medium text-ink">
              {totals.weighed === 1
                ? "1 animal pesado"
                : `${formatNumber(totals.weighed)} animais pesados`}
            </span>
            {totals.atBirth > 0
              ? ` · ${
                  totals.atBirth === 1
                    ? "1 peso ao nascer"
                    : `${formatNumber(totals.atBirth)} pesos ao nascer`
                }`
              : ""}
          </>
        }
        columns={columns}
      />

      <AnimalsCard
        view={view}
        scoped={false}
        columns={lineColumns}
        card={(line) => {
          const animal = lookup.animal(line.earTag);
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
              {line.atBirth ? (
                <div className="mt-1.5">
                  <AtBirthBadge />
                </div>
              ) : (
                <WeighingTrail line={line} date={date} />
              )}
            </>
          );
        }}
      />
    </div>
  );
}
