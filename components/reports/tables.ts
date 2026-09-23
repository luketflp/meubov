/**
 * The tables of the four documents, built once and used twice: the print
 * sheet draws them with PrintTable (totals as a bold last row) and "Baixar
 * planilha" writes them to xlsx (totals appended as a plain last row). Pure.
 */
import { formatDate } from "@/lib/domain/dates";
import { TREATMENT_TYPE_LABEL } from "@/lib/domain/labels";
import { pluralCategoryLabel } from "@/lib/export/datasets/finance";
import { buildTable, type Cell, type ExportTable } from "@/lib/export/table";
import type { BankReport } from "@/lib/reports/bank";
import type { DeclarationFlow, HerdDeclaration } from "@/lib/reports/declaration";
import type { Romaneio, RomaneioRow } from "@/lib/reports/romaneio";
import type { TechnicalReport } from "@/lib/reports/technical";

/** A table and its optional totals line, one cell per column. */
export interface TotaledTable {
  table: ExportTable;
  totals?: Cell[];
}

/** The table with its totals line appended as a last row, for a spreadsheet. */
export function withTotalsRow({ table, totals }: TotaledTable): ExportTable {
  return totals ? { ...table, rows: [...table.rows, totals] } : table;
}

/** "1 cabeça", "24 cabeças". */
export const headsLabel = (n: number): string => (n === 1 ? "1 cabeça" : `${n} cabeças`);

const sum = (values: number[]): number => values.reduce((total, v) => total + v, 0);

/** pregnant / diagnosed in %, null before the first diagnosis. */
const ratePct = (pregnant: number, diagnosed: number): number | null =>
  diagnosed === 0 ? null : (pregnant / diagnosed) * 100;

interface SexRow {
  label: string;
  males: number;
  females: number;
}

function bySexTable(title: string, firstHeader: string, rows: SexRow[]): TotaledTable {
  const table = buildTable<SexRow>(
    title,
    [
      { header: firstHeader, value: (r) => r.label },
      { header: "Machos", kind: "number", value: (r) => r.males },
      { header: "Fêmeas", kind: "number", value: (r) => r.females },
      { header: "Total", kind: "number", value: (r) => r.males + r.females },
    ],
    rows
  );
  const males = sum(rows.map((r) => r.males));
  const females = sum(rows.map((r) => r.females));
  return { table, totals: ["Total", males, females, males + females] };
}

/**
 * The movimentação between two dates as label/cabeças lines, ending on the
 * saldo. The ajuste line shows only when the flow does not add up without it.
 */
export function flowTable(
  flow: DeclarationFlow,
  startIso: string,
  endIso: string,
  title: string
): TotaledTable {
  const lines: [string, number][] = [
    [`Saldo em ${formatDate(startIso)}`, flow.start],
    ["+ Nascimentos", flow.births],
    ["+ Compras", flow.purchases],
    ["− Vendas", flow.sales],
    ["− Mortes", flow.deaths],
    ["− Outras baixas", flow.others],
  ];
  if (flow.adjustment !== 0) lines.push(["± Ajuste (cadastros sem entrada)", flow.adjustment]);
  const table = buildTable<[string, number]>(
    title,
    [
      { header: "Movimento", value: ([label]) => label },
      { header: "Cabeças", kind: "number", value: ([, heads]) => heads },
    ],
    lines
  );
  return { table, totals: [`= Saldo em ${formatDate(endIso)}`, flow.end] };
}

/** The declaração's three tables: by age band, by category and the movimentação. */
export function declarationTables(declaration: HerdDeclaration): {
  bands: TotaledTable;
  categories: TotaledTable;
  flow: TotaledTable;
} {
  return {
    bands: bySexTable("Faixa etária", "Faixa etária", declaration.bands),
    categories: bySexTable(
      "Por categoria",
      "Categoria",
      declaration.byCategory.map((row) => ({ ...row, label: pluralCategoryLabel(row.category) }))
    ),
    flow: flowTable(declaration.flow, declaration.since, declaration.baseDate, "Movimentação"),
  };
}

/** The romaneio's lines with the batch totals. */
export function romaneioTable(romaneio: Romaneio): TotaledTable {
  const table = buildTable<RomaneioRow>(
    "Romaneio",
    [
      { header: "Nº", kind: "number", value: (r) => r.n },
      { header: "Brinco", value: (r) => r.earTag },
      { header: "Categoria", value: (r) => r.category || null },
      { header: "Raça", value: (r) => r.breed || null },
      { header: "Idade (meses)", kind: "number", value: (r) => r.ageMonths },
      { header: "Peso vivo (kg)", kind: "number", value: (r) => r.weightKg },
      { header: "@ carcaça", kind: "number", decimals: 2, value: (r) => r.arrobas },
      { header: "Valor (R$)", kind: "money", value: (r) => r.valueBrl },
    ],
    romaneio.rows
  );
  const { totals } = romaneio;
  return {
    table,
    totals: [
      "",
      headsLabel(totals.heads),
      "",
      "",
      "",
      totals.weightKg > 0 ? totals.weightKg : null,
      totals.arrobas > 0 ? totals.arrobas : null,
      totals.valueBrl,
    ],
  };
}

/** The relatório para banco's inventory by category, valued. */
export function bankInventoryTable(report: BankReport): TotaledTable {
  const table = buildTable<BankReport["rows"][number]>(
    "Inventário valorizado",
    [
      { header: "Categoria", value: (r) => pluralCategoryLabel(r.category) },
      { header: "Cabeças", kind: "number", value: (r) => r.heads },
      { header: "Pesadas", kind: "number", value: (r) => r.weighed },
      { header: "Peso médio (kg)", kind: "number", value: (r) => r.avgKg },
      { header: "@ carcaça", kind: "number", decimals: 1, value: (r) => r.arrobas },
      { header: "Sem pesagem", kind: "number", value: (r) => (r.unweighed > 0 ? r.unweighed : null) },
      { header: "R$/cabeça", kind: "money", value: (r) => (r.unweighed > 0 ? r.headPrice : null) },
      { header: "Valor (R$)", kind: "money", value: (r) => r.valueBrl },
    ],
    report.rows
  );
  const { totals } = report;
  return {
    table,
    totals: [
      "Total",
      totals.heads,
      totals.weighed,
      totals.weighed > 0 ? totals.liveKg / totals.weighed : null,
      totals.arrobas,
      sum(report.rows.map((r) => r.unweighed)),
      null,
      totals.valueBrl,
    ],
  };
}

/** The relatório para banco's lots: heads, mean weight and GMD. */
export function bankLotsTable(report: BankReport): TotaledTable {
  const table = buildTable<BankReport["lots"][number]>(
    "Peso médio por lote",
    [
      { header: "Lote", value: (r) => r.lotName },
      { header: "Cab.", kind: "number", value: (r) => r.heads },
      { header: "Peso médio (kg)", kind: "number", value: (r) => r.avgKg },
      { header: "GMD (kg/dia)", kind: "number", decimals: 2, value: (r) => r.adg },
    ],
    report.lots
  );
  return { table };
}

/** Prenhez by bull, with the period's total and rate. */
export function technicalBullsTable(report: TechnicalReport): TotaledTable {
  const table = buildTable<TechnicalReport["byBull"][number]>(
    "Prenhez por touro",
    [
      { header: "Touro", value: (r) => r.name },
      { header: "Tipo", value: (r) => r.type },
      { header: "Cobertas", kind: "number", value: (r) => r.covered },
      { header: "Diagnosticadas", kind: "number", value: (r) => r.diagnosed },
      { header: "Prenhes", kind: "number", value: (r) => r.pregnant },
      { header: "Taxa (%)", kind: "number", value: (r) => r.ratePct },
    ],
    report.byBull
  );
  const covered = sum(report.byBull.map((r) => r.covered));
  const diagnosed = sum(report.byBull.map((r) => r.diagnosed));
  const pregnant = sum(report.byBull.map((r) => r.pregnant));
  return { table, totals: ["Total", "", covered, diagnosed, pregnant, ratePct(pregnant, diagnosed)] };
}

/** GMD by lote over the period, with the mean GMD of every animal weighed. */
export function technicalLotsTable(report: TechnicalReport): TotaledTable {
  const table = buildTable<TechnicalReport["lots"][number]>(
    "Desempenho por lote",
    [
      { header: "Lote", value: (r) => r.lotName },
      { header: "Pesados", kind: "number", value: (r) => r.weighed },
      { header: "Peso inicial (kg)", kind: "number", value: (r) => r.startKg },
      { header: "Peso final (kg)", kind: "number", value: (r) => r.endKg },
      { header: "Dias", kind: "number", value: (r) => r.days },
      { header: "GMD (kg/dia)", kind: "number", decimals: 2, value: (r) => r.adg },
    ],
    report.lots
  );
  const weighed = sum(report.lots.map((r) => r.weighed));
  const adg = weighed === 0 ? null : sum(report.lots.map((r) => r.adg * r.weighed)) / weighed;
  return { table, totals: ["Rebanho", weighed, null, null, null, adg] };
}

/** Sanidade by type: manejos, aplicações and animals in carência today. */
export function technicalSanitaryTable(report: TechnicalReport): TotaledTable {
  const table = buildTable<TechnicalReport["sanitary"][number]>(
    "Sanidade",
    [
      { header: "Tipo", value: (r) => TREATMENT_TYPE_LABEL[r.type] },
      { header: "Manejos", kind: "number", value: (r) => r.sessions },
      { header: "Aplicações", kind: "number", value: (r) => r.applications },
      { header: "Em carência hoje", kind: "number", value: (r) => r.inWithdrawal },
    ],
    report.sanitary
  );
  return { table };
}

/** The season and calving figures as indicator/value lines, for the spreadsheet. */
export function technicalSummaryTable(report: TechnicalReport): ExportTable {
  const { season, calvings } = report;
  const lines: [string, number | null][] = [
    ["Matrizes expostas", season.exposed],
    ["Diagnosticadas", season.diagnosed],
    ["Prenhes", season.pregnant],
    ["Vazias", season.open],
    ["Aguardando diagnóstico", season.awaiting],
    ["Taxa de prenhez (%)", season.ratePct],
    ["Partos previstos", calvings.expected],
    ["Nascidos", calvings.born],
    ["Partos nos próximos 30 dias", calvings.next30],
    ["Partos atrasados", calvings.overdue],
  ];
  return buildTable<[string, number | null]>(
    "Reprodução",
    [
      { header: "Indicador", value: ([label]) => label },
      { header: "Valor", kind: "number", decimals: 0, value: ([, value]) => value },
    ],
    lines
  );
}
