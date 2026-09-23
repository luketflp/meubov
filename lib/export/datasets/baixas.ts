/**
 * The Baixas as a table: the animals that left the herd other than by sale, in
 * the order given (the screen's `recentBaixas`), with the columns of its table.
 * A baixa carries no value of its own, so there is no money column.
 */
import type { Animal, CustomCategory } from "@/lib/types";
import { INACTIVE_REASON_LABEL, animalCategoryName } from "@/lib/domain/labels";
import { buildTable, type ExportTable } from "@/lib/export/table";

export interface BaixasExportNames {
  lotNames: ReadonlyMap<string, string>;
  customCategories: readonly CustomCategory[];
}

/** One row per baixa: data, brinco, categoria, raça, lote, motivo, observação. */
export function baixasExportTable(
  animals: readonly Animal[],
  names: BaixasExportNames,
  title = "Baixas"
): ExportTable {
  return buildTable(
    title,
    [
      { header: "Data", kind: "date", value: (a) => a.inactiveDate ?? null },
      { header: "Brinco", value: (a) => a.earTag },
      { header: "Categoria", value: (a) => animalCategoryName(a, names.customCategories) },
      { header: "Raça", value: (a) => a.breed },
      { header: "Lote", value: (a) => names.lotNames.get(a.lotId) ?? null },
      { header: "Motivo", value: (a) => (a.inactiveReason ? INACTIVE_REASON_LABEL[a.inactiveReason] : null) },
      { header: "Observação", value: (a) => a.inactiveNotes ?? null },
    ],
    animals
  );
}
