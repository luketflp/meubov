/**
 * The Rebanho as a table: the columns of the herd table, plus the invernada,
 * the date of the last weighing and the age in months, which a spreadsheet
 * sorts better than "7a 6m".
 */
import type { CustomCategory } from "@/lib/types";
import type { AnimalWithDerived } from "@/lib/store/selectors";
import { ageInMonths } from "@/lib/domain/dates";
import { SEX_LABEL, animalCategoryName } from "@/lib/domain/labels";
import { buildTable, type ExportTable } from "@/lib/export/table";

const STATUS_LABEL = { healthy: "Saudável", attention: "Atenção", overdue: "Atrasado" } as const;

export interface HerdExportNames {
  lotNames: ReadonlyMap<string, string>;
  /** Current invernada of each lot, keyed by lot id: "01 · Baixada". */
  invernadaNames: ReadonlyMap<string, string>;
  customCategories: readonly CustomCategory[];
}

export function herdExportTable(
  items: readonly AnimalWithDerived[],
  names: HerdExportNames,
  todayIso: string,
  title = "Rebanho"
): ExportTable {
  return buildTable(
    title,
    [
      { header: "Brinco", value: (i) => i.animal.earTag },
      { header: "Categoria", value: (i) => animalCategoryName(i.animal, names.customCategories) },
      { header: "Raça", value: (i) => i.animal.breed },
      { header: "Sexo", value: (i) => SEX_LABEL[i.animal.sex] },
      { header: "Nascimento", kind: "date", value: (i) => i.animal.birthDate || null },
      {
        header: "Idade (meses)",
        kind: "number",
        value: (i) => (i.animal.birthDate ? ageInMonths(i.animal.birthDate, todayIso) : null),
      },
      { header: "Peso atual (kg)", kind: "number", decimals: 1, value: (i) => i.currentWeightKg },
      { header: "Última pesagem", kind: "date", value: (i) => i.animal.weighings.at(-1)?.date ?? null },
      { header: "GMD (kg/dia)", kind: "number", decimals: 3, value: (i) => i.adg },
      { header: "Lote", value: (i) => names.lotNames.get(i.animal.lotId) ?? null },
      { header: "Invernada", value: (i) => names.invernadaNames.get(i.animal.lotId) ?? null },
      { header: "Status", value: (i) => STATUS_LABEL[i.status] },
      { header: "Motivo do status", value: (i) => i.reason },
    ],
    items
  );
}
