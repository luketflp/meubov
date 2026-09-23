/**
 * The Nascimentos as a table: the columns of the births table, in the order
 * given (the screen's sort), with the dam's lote named as the screen names it.
 */
import type { Birth } from "@/lib/store/selectors";
import { SEX_LABEL } from "@/lib/domain/labels";
import { buildTable, type ExportTable } from "@/lib/export/table";

/** One row per calving: data, bezerro, sexo, mãe, lote da mãe, raça, peso ao nascer. */
export function birthsExportTable(
  births: readonly Birth[],
  lotNames: ReadonlyMap<string, string>,
  title = "Nascimentos"
): ExportTable {
  return buildTable(
    title,
    [
      { header: "Data", kind: "date", value: (b) => b.date },
      { header: "Bezerro", value: (b) => b.calf?.earTag ?? b.calfEarTag },
      { header: "Sexo", value: (b) => (b.calf ? SEX_LABEL[b.calf.sex] : null) },
      { header: "Mãe", value: (b) => b.dam.earTag },
      { header: "Lote da mãe", value: (b) => lotNames.get(b.dam.lotId) ?? null },
      { header: "Raça", value: (b) => b.calf?.breed ?? null },
      { header: "Peso ao nascer (kg)", kind: "number", decimals: 1, value: (b) => b.birthWeightKg },
    ],
    births
  );
}
