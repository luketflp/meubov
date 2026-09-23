/**
 * The "Planilhas" of Relatórios: every list of the farm as export tables,
 * built from the same selectors and order the screens use, over the whole
 * farm. Money columns are dropped for a member without Financeiro view, and
 * the Despesas are left out for them. Pure.
 */
import type { HerdData } from "@/lib/types";
import { activeAnimals, lotsByInvernada, recentBirths, recentBreedings, withStatus } from "@/lib/store/selectors";
import { DEFAULT_SORT, sortHerd } from "@/components/herd/filters";
import { recentBaixas } from "@/components/baixas/baixas";
import { withoutMoney, type ExportTable } from "@/lib/export/table";
import { herdExportTable } from "@/lib/export/datasets/herd";
import { currentInvernadaNames, lotsExportTable, weighingsExportTable } from "@/lib/export/datasets/lots";
import { treatmentsExportTable } from "@/lib/export/datasets/calendar";
import { breedingsExportTable } from "@/lib/export/datasets/reproduction";
import { birthsExportTable } from "@/lib/export/datasets/births";
import { baixasExportTable } from "@/lib/export/datasets/baixas";
import { manejoExportTable } from "@/lib/export/datasets/manejo";
import { semenBullsByName, semenBullsExportTable, semenPurchasesExportTable } from "@/lib/export/datasets/semen";
import { expensesExportTable } from "@/lib/export/datasets/finance";

export type DatasetKey =
  | "animals"
  | "weighings"
  | "treatments"
  | "breedings"
  | "births"
  | "baixas"
  | "manejos"
  | "lots"
  | "semen"
  | "expenses";

/** One planilha of the list: its tables, and whether it also goes out as CSV. */
export interface ReportDataset {
  key: DatasetKey;
  name: string;
  tables: ExportTable[];
  /** CSV holds one table, so a planilha of several goes out as xlsx only. */
  csv: boolean;
  /** Shown with a "Financeiro" tag: only members who see the Financeiro get it. */
  finance?: boolean;
}

/** Every planilha of the farm, in the order of the Relatórios list. */
export function reportDatasets(data: HerdData, todayIso: string, seeMoney: boolean): ReportDataset[] {
  const lotNames = new Map(data.lots.map((lot) => [lot.id, lot.name]));
  const one = (key: DatasetKey, name: string, table: ExportTable): ReportDataset => ({
    key,
    name,
    tables: [table],
    csv: true,
  });

  const herd = sortHerd(
    withStatus(activeAnimals(data.animals), data.treatments, todayIso),
    DEFAULT_SORT,
    lotNames
  );
  const bulls = semenBullsByName(data.semenBulls);

  const datasets: ReportDataset[] = [
    one(
      "animals",
      "Animais",
      herdExportTable(
        herd,
        {
          lotNames,
          invernadaNames: currentInvernadaNames(data.invernadas, data.lotPlacements),
          customCategories: data.customCategories,
        },
        todayIso,
        "Animais"
      )
    ),
    one("weighings", "Pesagens", weighingsExportTable(data.animals, lotNames)),
    one("treatments", "Tratamentos", treatmentsExportTable(data.treatments, data.animals, data.lots, todayIso)),
    one(
      "breedings",
      "Coberturas e diagnósticos",
      breedingsExportTable(recentBreedings(data.animals, data.semenBulls), lotNames, "Coberturas")
    ),
    one("births", "Nascimentos", birthsExportTable(recentBirths(data.animals), lotNames)),
    one(
      "baixas",
      "Baixas",
      baixasExportTable(recentBaixas(data.animals, "todas"), {
        lotNames,
        customCategories: data.customCategories,
      })
    ),
    one("manejos", "Manejos", manejoExportTable(data.manejoSessions, data.lots)),
    one("lots", "Lotes e invernadas", lotsExportTable(lotsByInvernada(data, todayIso), "Lotes e invernadas")),
    {
      key: "semen",
      name: "Touros e sêmen",
      tables: [semenBullsExportTable(bulls, data.animals), semenPurchasesExportTable(bulls)],
      csv: false,
    },
  ];
  if (seeMoney) {
    datasets.push({ ...one("expenses", "Despesas", expensesExportTable(data.expenses)), finance: true });
  }

  return datasets.map((dataset) => ({
    ...dataset,
    tables: dataset.tables.map((table) => withoutMoney(table, seeMoney)),
  }));
}

/** Rows of a planilha, summed over its tables. */
export const datasetRows = (dataset: ReportDataset): number =>
  dataset.tables.reduce((sum, table) => sum + table.rows.length, 0);
