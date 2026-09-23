"use client";

/**
 * Sanitary manejo record: a vacinação, vermifugação, medicação or exame closed
 * at the chute. The resumo holds what was applied and what it cost; below it,
 * one line per animal with the weight taken in the same pass and its cost. A
 * session still running belongs to the chute screen.
 */
import { useMemo } from "react";
import type { ManejoSession, TreatmentType } from "@/lib/types";
import { formatDate } from "@/lib/domain/dates";
import { formatCurrency, formatKg, formatNumber } from "@/lib/domain/format";
import {
  outcomeNote,
  passedLabel,
  treatmentLines,
  treatmentTotals,
  type TreatmentLine,
} from "@/lib/domain/manejoDetail";
import { sessionKind } from "@/components/manejo/helpers";
import { treatmentLinesExportTable } from "@/lib/export/datasets/manejo";
import {
  AnimalsCard,
  DetailHeader,
  HeadsLead,
  LinesExportMenu,
  ResumoCard,
  useDetailExportNames,
  useHerdLookup,
  sortedLines,
  useLinesView,
  type LineColumn,
  type ResumoColumn,
} from "@/components/manejo/detail-shell";

const RESUMO_TITLE: Record<TreatmentType, string> = {
  vaccine: "Resumo da vacinação",
  deworming: "Resumo da vermifugação",
  medication: "Resumo da medicação",
  exam: "Resumo do exame",
};

export function TreatmentDetail({ session }: { session: ManejoSession }) {
  const plan = session.treatment;
  const lines = useMemo(() => treatmentLines(session), [session]);
  const totals = useMemo(() => treatmentTotals(session), [session]);
  const view = useLinesView(lines, true);
  const lookup = useHerdLookup();
  const exportNames = useDetailExportNames();

  // Weight and cost columns only when the manejo weighed or the plan was
  // priced; otherwise they would be a stack of dashes.
  const weighed = session.weighing;
  const priced = plan?.costBrl !== undefined;

  const subtitle = [formatDate(session.date), plan?.name, plan?.dose, plan?.responsible]
    .filter((part): part is string => Boolean(part))
    .join(" · ");

  const application: ResumoColumn = { caption: "Aplicação", rows: [] };
  if (plan) {
    application.rows.push({ label: "Produto", value: plan.name });
    if (plan.dose) application.rows.push({ label: "Dose", value: plan.dose });
    if (plan.responsible) application.rows.push({ label: "Responsável", value: plan.responsible });
    application.rows.push(
      totals.withdrawalUntil !== null
        ? {
            label: "Carência",
            value: `${formatNumber(plan.withdrawalDays)} ${plan.withdrawalDays === 1 ? "dia" : "dias"}`,
            suffix: `até ${formatDate(totals.withdrawalUntil)}`,
          }
        : { label: "Carência", value: "sem carência" }
    );
  }

  const costs: ResumoColumn = { caption: "Custos e reforço", rows: [] };
  if (totals.costTotalBrl !== null) {
    costs.rows.push({ label: "Custo total", value: formatCurrency(totals.costTotalBrl) });
  }
  if (totals.costPerHeadBrl !== null) {
    costs.rows.push({ label: "R$/cabeça", value: formatCurrency(totals.costPerHeadBrl) });
  }
  if (totals.boosterDate !== null) {
    costs.rows.push({
      label: "Reforço",
      value: formatDate(totals.boosterDate),
      suffix:
        totals.boosters === 0
          ? undefined
          : totals.boosters === 1
            ? "1 agendado"
            : `${formatNumber(totals.boosters)} agendados`,
    });
  }
  if (totals.weighed > 0 && totals.avgKg !== null) {
    costs.rows.push({ label: "Peso médio", value: formatKg(totals.avgKg) });
  }

  const columns: LineColumn<TreatmentLine>[] = [
    {
      header: "Brinco",
      sortValue: (line) => line.earTag,
      cell: (line) => line.earTag,
      className: "font-mono font-medium text-ink",
    },
    {
      header: "Categoria",
      sortValue: (line) => lookup.categoryName(lookup.animal(line.earTag)),
      cell: (line) => lookup.categoryName(lookup.animal(line.earTag)),
    },
    {
      header: "Lote",
      sortValue: (line) => lookup.lotName(lookup.animal(line.earTag)?.lotId),
      cell: (line) => lookup.lotName(lookup.animal(line.earTag)?.lotId),
      className: "text-ink-soft",
    },
    ...(weighed
      ? [
          {
            header: "Peso",
            sortValue: (line: TreatmentLine) => line.weightKg,
            cell: (line: TreatmentLine) => (line.weightKg === null ? "—" : formatKg(line.weightKg)),
            align: "right" as const,
            className: "font-mono text-ink",
          },
        ]
      : []),
    ...(priced
      ? [
          {
            header: "Custo",
            sortValue: (line: TreatmentLine) => line.costBrl,
            cell: (line: TreatmentLine) =>
              line.costBrl === null ? "—" : formatCurrency(line.costBrl),
            align: "right" as const,
            className: "font-mono text-ink",
          },
        ]
      : []),
    {
      header: "Observação",
      sortValue: (line) => outcomeNote(line),
      cell: (line) => outcomeNote(line),
      className: "text-ink-soft",
    },
  ];

  return (
    <div className="space-y-6">
      <DetailHeader
        title={session.name}
        action={sessionKind(session)}
        subtitle={subtitle}
        session={session}
        extra={
          <LinesExportMenu
            title={session.name}
            lines={lines}
            visible={sortedLines(view, columns)}
            build={(rows) => treatmentLinesExportTable(session.name, rows, exportNames)}
          />
        }
      />

      <ResumoCard
        title={RESUMO_TITLE[plan?.type ?? "medication"]}
        lead={
          <HeadsLead
            passed={totals.passed}
            total={totals.total}
            skipped={totals.skipped}
            participle={passedLabel(session)}
          />
        }
        columns={[application, costs]}
      />

      <AnimalsCard
        view={view}
        scoped
        columns={columns}
        card={(line) => {
          const animal = lookup.animal(line.earTag);
          const note = outcomeNote(line);
          // The phone keeps one figure on the right: the cost when the plan was
          // priced, the weight otherwise. With both, the weight joins the meta line.
          const corner =
            line.costBrl !== null
              ? formatCurrency(line.costBrl)
              : line.weightKg !== null
                ? formatKg(line.weightKg)
                : null;
          const meta = [lookup.categoryName(animal), lookup.lotName(animal?.lotId)];
          if (line.costBrl !== null && line.weightKg !== null) meta.push(formatKg(line.weightKg));
          return (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-sm font-medium text-ink">{line.earTag}</span>
                {corner !== null ? (
                  <span className="font-mono text-sm text-ink">{corner}</span>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-ink-soft">{meta.join(" · ")}</p>
              {note ? <p className="mt-1 text-xs text-ink-soft">{note}</p> : null}
            </>
          );
        }}
      />
    </div>
  );
}
