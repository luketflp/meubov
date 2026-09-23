/**
 * The semen bulls as tables: the Touros tab with stock and pregnancy rate, the
 * purchases of doses, and the inseminações of one bull for its page.
 */
import type { Animal, SemenBull, SemenPurchase } from "@/lib/types";
import { bullPregnancy, bullStock, type BullInsemination } from "@/lib/domain/semen";
import { DIAGNOSIS_RESULT_LABEL } from "@/lib/domain/labels";
import { buildTable, type ExportTable } from "@/lib/export/table";

/** The bulls by name, as the Touros tab reads them. */
export function semenBullsByName(bulls: readonly SemenBull[]): SemenBull[] {
  return [...bulls].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/**
 * Touros, one row per bull in the order given: identity, doses bought, used and
 * left, cost per dose, last purchase and the pregnancy rate of its diagnosed
 * coberturas.
 */
export function semenBullsExportTable(
  bulls: readonly SemenBull[],
  animals: Animal[],
  title = "Touros"
): ExportTable {
  const items = bulls.map((bull) => ({
    bull,
    stock: bullStock(bull, animals),
    pregnancy: bullPregnancy(bull.id, animals),
  }));
  return buildTable(
    title,
    [
      { header: "Touro", value: (i) => i.bull.name },
      { header: "Código", value: (i) => i.bull.code ?? null },
      { header: "Raça", value: (i) => i.bull.breed ?? null },
      { header: "Central", value: (i) => i.bull.central ?? null },
      { header: "Doses compradas", kind: "number", value: (i) => i.stock.bought },
      { header: "Doses usadas", kind: "number", value: (i) => i.stock.used },
      { header: "Em estoque", kind: "number", value: (i) => i.stock.left },
      { header: "Custo médio por dose (R$)", kind: "money", value: (i) => i.stock.avgCostPerDose },
      { header: "Última compra", kind: "date", value: (i) => i.stock.lastPurchase },
      { header: "Diagnosticadas", kind: "number", value: (i) => i.pregnancy.diagnosed },
      { header: "Prenhes", kind: "number", value: (i) => i.pregnancy.pregnant },
      {
        header: "Prenhez (%)",
        kind: "number",
        decimals: 1,
        value: (i) => (i.pregnancy.rate === null ? null : i.pregnancy.rate * 100),
      },
    ],
    items
  );
}

/** Every purchase of the bulls given, newest first, then by bull name. */
export function semenPurchasesExportTable(bulls: readonly SemenBull[], title = "Compras"): ExportTable {
  const items = bulls
    .flatMap((bull) => bull.purchases.map((purchase) => ({ bull, purchase })))
    .sort(
      (a, b) =>
        (a.purchase.date < b.purchase.date ? 1 : a.purchase.date > b.purchase.date ? -1 : 0) ||
        a.bull.name.localeCompare(b.bull.name, "pt-BR")
    );
  return buildTable<{ bull: SemenBull; purchase: SemenPurchase }>(
    title,
    [
      { header: "Data", kind: "date", value: (i) => i.purchase.date },
      { header: "Touro", value: (i) => i.bull.name },
      { header: "Doses", kind: "number", value: (i) => i.purchase.doses },
      { header: "Total (R$)", kind: "money", value: (i) => i.purchase.totalBrl ?? null },
      {
        header: "Por dose (R$)",
        kind: "money",
        value: (i) =>
          i.purchase.totalBrl === undefined || i.purchase.doses === 0
            ? null
            : i.purchase.totalBrl / i.purchase.doses,
      },
      { header: "Vendedor", value: (i) => i.purchase.seller ?? null },
    ],
    items
  );
}

/** The inseminações of one bull as its page lists them, with the dam's lote today. */
export function bullInseminationsExportTable(
  rows: readonly BullInsemination[],
  lotNames: ReadonlyMap<string, string>,
  title = "Inseminações"
): ExportTable {
  return buildTable(
    title,
    [
      { header: "Data", kind: "date", value: (r) => r.breeding.date },
      { header: "Matriz", value: (r) => r.dam.earTag },
      { header: "Lote", value: (r) => lotNames.get(r.dam.lotId) ?? null },
      { header: "Diagnóstico", value: (r) => DIAGNOSIS_RESULT_LABEL[r.result] },
    ],
    rows
  );
}
