"use client";

/**
 * Tratamentos do calendário: the applications marked feito on the Calendário
 * sanitário on one day, of one type and name, that no chute session wrote. The
 * resumo holds the dose, the longest carência and the cost; below it, one line
 * per animal. Nothing to delete here — the history row keeps that.
 */
import { useMemo } from "react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { formatDate } from "@/lib/domain/dates";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import {
  calendarTotals,
  calendarTreatmentGroup,
  outcomeNote,
} from "@/lib/domain/manejoDetail";
import {
  calendarApplicationsExportTable,
  type CalendarApplicationLine,
} from "@/lib/export/datasets/manejo";
import {
  AnimalsCard,
  DetailHeader,
  LinesExportMenu,
  NotFoundCard,
  ResumoCard,
  useDetailExportNames,
  useHerdLookup,
  useLinesView,
  type LineColumn,
  type ResumoColumn,
} from "@/components/manejo/detail-shell";

type CalendarLine = CalendarApplicationLine;

export function CalendarTreatmentsDetail({ treatmentId }: { treatmentId: string }) {
  const treatments = useHerdStore((s) => s.treatments);
  const sessions = useHerdStore((s) => s.manejoSessions);
  const group = useMemo(
    () => calendarTreatmentGroup(treatmentId, treatments, sessions),
    [treatmentId, treatments, sessions]
  );
  const lines = useMemo<CalendarLine[]>(
    () =>
      (group?.treatments ?? []).map((t) => ({
        earTag: t.animalEarTag,
        outcome: "done",
        notes: t.notes,
        dose: t.dose,
        costBrl: t.costBrl ?? null,
      })),
    [group]
  );
  const view = useLinesView(lines, false);
  const lookup = useHerdLookup();
  const exportNames = useDetailExportNames();

  if (!group) {
    return (
      <NotFoundCard
        title="Registro não encontrado"
        description="Estas aplicações não existem ou foram feitas num manejo no brete."
      />
    );
  }

  const totals = calendarTotals(group);
  const dose = group.treatments.find((t) => t.dose)?.dose;
  const responsible = group.treatments.find((t) => t.responsible)?.responsible;
  // The carência that counts is the longest one any animal of the group got.
  const longest = Math.max(0, ...group.treatments.map((t) => t.withdrawalDays));

  const application: ResumoColumn = { caption: "Aplicação", rows: [] };
  if (dose) application.rows.push({ label: "Dose", value: dose });
  if (responsible) application.rows.push({ label: "Responsável", value: responsible });
  application.rows.push(
    totals.withdrawalUntil !== null
      ? {
          label: "Carência",
          value: `${formatNumber(longest)} ${longest === 1 ? "dia" : "dias"}`,
          suffix: `até ${formatDate(totals.withdrawalUntil)}`,
        }
      : { label: "Carência", value: "sem carência" }
  );

  const costs: ResumoColumn = { caption: "Custos", rows: [] };
  if (totals.costTotalBrl !== null) {
    costs.rows.push({ label: "Custo total", value: formatCurrency(totals.costTotalBrl) });
    if (totals.costPerHeadBrl !== null) {
      costs.rows.push({ label: "R$/cabeça", value: formatCurrency(totals.costPerHeadBrl) });
    }
  }

  const columns: LineColumn<CalendarLine>[] = [
    {
      header: "Brinco",
      cell: (line) => line.earTag,
      className: "font-mono font-medium text-ink",
    },
    {
      header: "Categoria",
      cell: (line) => lookup.categoryName(lookup.animal(line.earTag)),
    },
    {
      header: "Lote",
      cell: (line) => lookup.lotName(lookup.animal(line.earTag)?.lotId),
      className: "text-ink-soft",
    },
    {
      header: "Dose",
      cell: (line) => line.dose ?? "—",
    },
    // A group with no cost at all would print a column of dashes.
    ...(totals.costTotalBrl === null
      ? []
      : [
          {
            header: "Custo",
            cell: (line: CalendarLine) =>
              line.costBrl === null ? "—" : formatCurrency(line.costBrl),
            align: "right" as const,
            className: "font-mono text-ink",
          },
        ]),
    {
      header: "Observação",
      cell: (line) => outcomeNote(line),
      className: "text-ink-soft",
    },
  ];

  return (
    <div className="space-y-6">
      <DetailHeader
        title={group.name}
        action={group.type}
        subtitle={`${formatDate(group.date)} · Calendário sanitário`}
        extra={
          <LinesExportMenu
            title={group.name}
            lines={lines}
            visible={view.visible}
            build={(rows) => calendarApplicationsExportTable(group.name, rows, exportNames)}
          />
        }
      />

      <ResumoCard
        title="Resumo das aplicações"
        lead={
          <span className="font-medium text-ink">
            {totals.heads === 1 ? "1 cabeça" : `${formatNumber(totals.heads)} cabeças`}
          </span>
        }
        columns={[application, costs]}
      />

      <AnimalsCard
        view={view}
        scoped={false}
        columns={columns}
        card={(line) => {
          const animal = lookup.animal(line.earTag);
          const note = outcomeNote(line);
          const meta = [lookup.categoryName(animal), lookup.lotName(animal?.lotId)];
          if (line.dose) meta.push(line.dose);
          return (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-sm font-medium text-ink">{line.earTag}</span>
                {line.costBrl !== null ? (
                  <span className="font-mono text-sm text-ink">{formatCurrency(line.costBrl)}</span>
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
