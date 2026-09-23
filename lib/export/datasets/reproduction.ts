/**
 * The Reprodução lists as tables: the coberturas with their diagnosis and the
 * calving they forecast, and the Ultrassom list with the lote of each cow.
 */
import type { BreedingRow } from "@/lib/store/selectors";
import type { UltrasoundGroup, UltrasoundRow } from "@/lib/domain/ultrasound";
import { BREEDING_TYPE_LABEL, DIAGNOSIS_RESULT_LABEL } from "@/lib/domain/labels";
import { buildTable, type ExportTable } from "@/lib/export/table";

/**
 * Coberturas, one row per breeding in the order given (the screen's order):
 * the dam's lote today, the bull by name when it is a registered semen bull,
 * the diagnosis with its date and observação, and the calving forecast.
 */
export function breedingsExportTable(
  rows: readonly BreedingRow[],
  lotNames: ReadonlyMap<string, string>,
  title = "Coberturas"
): ExportTable {
  return buildTable(
    title,
    [
      { header: "Data", kind: "date", value: (r) => r.breeding.date },
      { header: "Matriz", value: (r) => r.dam.earTag },
      { header: "Lote", value: (r) => lotNames.get(r.dam.lotId) ?? null },
      { header: "Tipo", value: (r) => BREEDING_TYPE_LABEL[r.breeding.type] },
      { header: "Touro", value: (r) => r.semenBull?.name ?? r.breeding.bullEarTag },
      { header: "Diagnóstico", value: (r) => DIAGNOSIS_RESULT_LABEL[r.outcome.result] },
      { header: "Data do diagnóstico", kind: "date", value: (r) => r.outcome.diagnosis?.date ?? null },
      { header: "Previsão de parto", kind: "date", value: (r) => r.outcome.expectedCalvingDate },
      { header: "Observação", value: (r) => r.outcome.diagnosis?.notes ?? null },
    ],
    rows
  );
}

/** The Ultrassom list flattened, lote by lote in the order given, each cow under her lote. */
export function ultrasoundExportTable(groups: readonly UltrasoundGroup[], title = "Ultrassom"): ExportTable {
  const items = groups.flatMap((group) => group.rows.map((row) => ({ lot: group.name, row })));
  return buildTable<{ lot: string | null; row: UltrasoundRow }>(
    title,
    [
      { header: "Lote", value: (i) => i.lot ?? "Sem lote" },
      { header: "Matriz", value: (i) => i.row.dam.earTag },
      { header: "Cobertura", kind: "date", value: (i) => i.row.breeding.date },
      { header: "Touro", value: (i) => i.row.bull?.name ?? i.row.breeding.bullEarTag },
      { header: "Tipo", value: (i) => BREEDING_TYPE_LABEL[i.row.breeding.type] },
      { header: "Dias", kind: "number", value: (i) => i.row.days },
      { header: "Diagnóstico", value: (i) => DIAGNOSIS_RESULT_LABEL[i.row.result] },
      { header: "Observação", value: (i) => i.row.notes ?? null },
    ],
    items
  );
}
