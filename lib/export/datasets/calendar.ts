/**
 * The Calendário sanitário as a table: one row per treatment, by date, with
 * the animal's lote today and the status as of the given day.
 */
import type { Animal, Lot, Treatment, TreatmentStatus } from "@/lib/types";
import { todayISO } from "@/lib/domain/dates";
import { TREATMENT_TYPE_LABEL } from "@/lib/domain/labels";
import { deriveTreatmentStatus } from "@/lib/domain/status";
import { buildTable, type ExportTable } from "@/lib/export/table";

const TREATMENT_STATUS_LABEL: Record<TreatmentStatus, string> = {
  scheduled: "Agendado",
  overdue: "Atrasado",
  done: "Feito",
};

const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

/**
 * Treatments ordered by date, then brinco: data, brinco, lote, tipo, produto,
 * dose, status, carência (dias), responsável, custo and observação. Relatórios
 * passes every treatment; the calendar passes the month on screen plus the
 * overdue ones.
 */
export function treatmentsExportTable(
  treatments: readonly Treatment[],
  animals: readonly Animal[],
  lots: readonly Lot[],
  todayIso: string = todayISO(),
  title = "Tratamentos"
): ExportTable {
  const lotByTag = new Map(animals.map((animal) => [animal.earTag, animal.lotId]));
  const lotNames = new Map(lots.map((lot) => [lot.id, lot.name]));
  const lotOf = (earTag: string): string | null => {
    const lotId = lotByTag.get(earTag);
    return lotId === undefined ? null : (lotNames.get(lotId) ?? null);
  };
  const ordered = [...treatments].sort(
    (a, b) =>
      (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
      collator.compare(a.animalEarTag, b.animalEarTag)
  );
  return buildTable(
    title,
    [
      { header: "Data", kind: "date", value: (t) => t.date },
      { header: "Brinco", value: (t) => t.animalEarTag },
      { header: "Lote", value: (t) => lotOf(t.animalEarTag) },
      { header: "Tipo", value: (t) => TREATMENT_TYPE_LABEL[t.type] },
      { header: "Produto", value: (t) => t.name },
      { header: "Dose", value: (t) => t.dose ?? null },
      { header: "Status", value: (t) => TREATMENT_STATUS_LABEL[deriveTreatmentStatus(t, todayIso)] },
      { header: "Carência (dias)", kind: "number", value: (t) => t.withdrawalDays },
      { header: "Responsável", value: (t) => t.responsible ?? null },
      { header: "Custo (R$)", kind: "money", value: (t) => t.costBrl ?? null },
      { header: "Observação", value: (t) => t.notes ?? null },
    ],
    ordered
  );
}

/**
 * What the agenda shows: the month's treatments and the overdue ones of any
 * month, each once.
 */
export function calendarTreatments(ofMonth: readonly Treatment[], overdue: readonly Treatment[]): Treatment[] {
  const seen = new Set(ofMonth.map((t) => t.id));
  return [...overdue.filter((t) => !seen.has(t.id)), ...ofMonth];
}
