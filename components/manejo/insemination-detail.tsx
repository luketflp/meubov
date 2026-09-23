"use client";

/**
 * Inseminação record: an IATF morning already closed at the brete. The resumo
 * counts the doses each bull gave and what that semen cost, at each bull's
 * current average price per dose; below it, one line per cow with the bull she
 * took and what the ultrassom said since. The bull and the diagnosis are read
 * from the cobertura each pass recorded (`breedingId`), so a diagnosis made on
 * the Ultrassom tab shows here at once. The semen cost shows only to whoever
 * sees Financeiro.
 */
import { useMemo } from "react";
import type { ManejoSession } from "@/lib/types";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { formatDate } from "@/lib/domain/dates";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { breedingOutcome } from "@/lib/domain/reproduction";
import { sessionSemenCost } from "@/lib/domain/semen";
import { ResultPill } from "@/components/animal/reproduction-pills";
import { bullDisplay } from "@/components/semen/helpers";
import {
  inseminationLinesExportTable,
  type InseminationExportLine,
} from "@/lib/export/datasets/manejo";
import { inseminationTitle, passBreeding } from "@/components/manejo/insemination-chute-form";
import {
  AnimalsCard,
  DetailHeader,
  LinesExportMenu,
  ResumoCard,
  useDetailExportNames,
  useHerdLookup,
  useLinesView,
  type LineColumn,
  type ResumoRow,
} from "@/components/manejo/detail-shell";

/**
 * A cow of the inseminação: the bull whose dose she took and what the
 * ultrassom said of her cobertura, both null when she did not pass.
 */
type InseminationLine = InseminationExportLine;

/** The line's note, prefixed by "pulada" or "não passou" when the cow took no dose. */
function inseminationNote(line: InseminationLine): string {
  if (line.outcome === "done") return line.notes ?? "";
  const label = line.outcome === "skipped" ? "pulada" : "não passou";
  return line.notes ? `${label} · ${line.notes}` : label;
}

/** "1 pulada", "3 puladas": the count with the word that agrees with it. */
function plural(n: number, singular: string, pluralForm: string): string {
  return n === 1 ? `1 ${singular}` : `${formatNumber(n)} ${pluralForm}`;
}

export function InseminationDetail({ session }: { session: ManejoSession }) {
  const animals = useHerdStore((s) => s.animals);
  const lots = useHerdStore((s) => s.lots);
  const bulls = useHerdStore((s) => s.semenBulls);
  const seeMoney = useCan("finance", "view");
  const lookup = useHerdLookup();
  const exportNames = useDetailExportNames();

  const lines = useMemo<InseminationLine[]>(() => {
    const byTag = new Map(animals.map((animal) => [animal.earTag, animal]));
    return session.animals.map((entry) => {
      const cow = byTag.get(entry.earTag);
      const breeding = entry.outcome === "done" ? passBreeding(entry, cow) : undefined;
      return {
        earTag: entry.earTag,
        outcome: entry.outcome,
        notes: entry.notes,
        bull: breeding ? bullDisplay(breeding, bulls).label : null,
        result:
          breeding && cow?.reproduction ? breedingOutcome(cow.reproduction, breeding).result : null,
      };
    });
  }, [session, animals, bulls]);
  const cost = useMemo(() => sessionSemenCost(session, animals, bulls), [session, animals, bulls]);
  // Opens on the cows inseminated; the skipped and the pending are one switch away.
  const view = useLinesView(lines, true);

  const total = lines.length;
  const passed = lines.filter((line) => line.outcome === "done").length;
  const skipped = lines.filter((line) => line.outcome === "skipped").length;
  const pending = total - passed - skipped;

  const subtitle = `${formatDate(session.date)} · ${formatNumber(passed)} de ${plural(
    total,
    "vaca inseminada",
    "vacas inseminadas"
  )}`;

  const dosesRows: ResumoRow[] = cost.lines.map((line) => ({
    label: line.bull.name,
    value: formatNumber(line.doses),
  }));
  if (dosesRows.length > 0) dosesRows.push({ label: "Total", value: formatNumber(cost.doses) });

  // A bull with no purchase has no price per dose: its doses count, its money stays out.
  const costRows: ResumoRow[] = [];
  if (seeMoney && cost.totalBrl !== null) {
    for (const line of cost.lines) {
      if (line.costBrl === null || line.avgCostPerDose === null) continue;
      costRows.push({
        label: line.bull.name,
        value: formatCurrency(line.costBrl),
        suffix: `${formatCurrency(line.avgCostPerDose)}/dose`,
      });
    }
    costRows.push({ label: "Total", value: formatCurrency(cost.totalBrl) });
    if (cost.perCowBrl !== null) {
      costRows.push({ label: "Por vaca", value: formatCurrency(cost.perCowBrl) });
    }
  }

  const columns: LineColumn<InseminationLine>[] = [
    { header: "Brinco", cell: (line) => line.earTag, className: "font-mono font-medium text-ink" },
    {
      header: "Categoria",
      cell: (line) => lookup.categoryName(lookup.animal(line.earTag)),
      className: "text-ink",
    },
    { header: "Touro", cell: (line) => line.bull ?? "—", className: "text-ink" },
    {
      header: "Diagnóstico",
      cell: (line) => (line.result === null ? "—" : <ResultPill result={line.result} />),
      className: "text-ink",
    },
    { header: "Observação", cell: inseminationNote, className: "text-ink-soft" },
  ];

  return (
    <div className="space-y-6">
      <DetailHeader
        title={inseminationTitle(session, animals, lots)}
        action="insemination"
        subtitle={subtitle}
        session={session}
        extra={
          <LinesExportMenu
            title={inseminationTitle(session, animals, lots)}
            lines={lines}
            visible={view.visible}
            build={(rows) =>
              inseminationLinesExportTable(inseminationTitle(session, animals, lots), rows, exportNames)
            }
          />
        }
      />

      <ResumoCard
        title="Resumo da inseminação"
        lead={
          <>
            <span className="font-medium text-ink">
              {plural(passed, "vaca inseminada", "vacas inseminadas")}
            </span>
            {cost.lines.length > 0 ? ` com ${plural(cost.lines.length, "touro", "touros")}` : ""}.
            {skipped > 0 ? ` ${plural(skipped, "pulada", "puladas")}.` : ""}
            {pending > 0 ? ` ${plural(pending, "não passou", "não passaram")}.` : ""}
          </>
        }
        columns={[
          { caption: "Doses", rows: dosesRows },
          { caption: "Custo do sêmen", rows: costRows },
        ]}
      />

      <AnimalsCard
        view={view}
        scoped
        columns={columns}
        card={(line) => {
          const note = inseminationNote(line);
          return (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-medium text-ink">{line.earTag}</span>
                {line.result !== null ? <ResultPill result={line.result} /> : null}
              </div>
              <p className="mt-1 text-xs text-ink-soft">
                {lookup.categoryName(lookup.animal(line.earTag))}
                {line.bull ? ` · ${line.bull}` : ""}
              </p>
              {note ? <p className="mt-1 text-xs text-ink-soft">{note}</p> : null}
            </>
          );
        }}
      />
    </div>
  );
}
