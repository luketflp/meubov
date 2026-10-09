/**
 * The Financeiro as tables: every despesa, the rows of a nó of Lançamentos,
 * the Placar's indicators beside the prior window and their references, and
 * the Por lote table.
 */
import type { Category, Expense, PlanGroup } from "@/lib/types";
import type { LedgerStatus } from "@/lib/domain/ledger";
import type { Indicators } from "@/lib/domain/economics";
import type { LotEconomics } from "@/lib/domain/lotEconomics";
import { benchmark, type BenchmarkKey } from "@/lib/domain/benchmarks";
import { ENTRY_KIND_LABEL, entryGroup } from "@/lib/domain/entries";
import { formatNumber } from "@/lib/domain/format";
import { groupLabel } from "@/lib/domain/groups";
import { pluralCategory } from "@/lib/domain/labels";
import type { PaneRow } from "@/lib/domain/planTree";
import { buildTable, type ExportTable } from "@/lib/export/table";

/** The despesas newest first, the order of the Despesas list. */
export function expensesNewestFirst(expenses: readonly Expense[]): Expense[] {
  return [...expenses].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/**
 * Every despesa, newest first; receitas and the kinds outside the resultado
 * are left out. `planGroups` names the grupos.
 */
export function expensesExportTable(
  expenses: readonly Expense[],
  title: string,
  planGroups: readonly PlanGroup[]
): ExportTable {
  const label = (e: Expense): string => {
    const group = entryGroup(e);
    // Only a rendimento has no grupo: it reads as the ledger reads it.
    return group === null ? ENTRY_KIND_LABEL.yield : groupLabel(group, planGroups);
  };
  return buildTable(
    title,
    [
      { header: "Data", kind: "date", value: (e) => e.date },
      { header: "Categoria", value: label },
      { header: "Descrição", value: (e) => e.notes ?? null },
      { header: "Valor (R$)", kind: "money", value: (e) => e.amountBrl },
    ],
    expensesNewestFirst(expenses.filter((e) => e.kind === "expense"))
  );
}

/** "Bezerros", the card's label of a categoria. */
export function pluralCategoryLabel(category: Category): string {
  const plural = pluralCategory(category, 2);
  return plural.charAt(0).toUpperCase() + plural.slice(1);
}

const LEDGER_STATUS_LABEL: Record<LedgerStatus, string> = {
  paid: "Pago",
  received: "Recebido",
  payable: "A pagar",
  receivable: "A receber",
  overdue: "Vencido",
};

/** The rows of a nó of Lançamentos as shown (filtered, newest first): value signed, saldo after each line when the nó keeps one. */
export function paneExportTable(rows: readonly PaneRow[], title: string): ExportTable {
  return buildTable(
    title,
    [
      { header: "Data", kind: "date", value: (r) => r.date },
      { header: "Histórico", value: (r) => r.history },
      { header: "Detalhe", value: (r) => r.detail },
      { header: "Contra partida", value: (r) => r.contra },
      { header: "Grupo", value: (r) => r.contraGroup },
      { header: "Vencimento", kind: "date", value: (r) => r.ledger?.dueDate ?? null },
      { header: "Lote", value: (r) => (r.ledger ? (r.ledger.lotName ?? "Fazenda") : null) },
      { header: "Valor (R$)", kind: "money", value: (r) => r.amountBrl },
      { header: "Saldo (R$)", kind: "money", value: (r) => r.balance },
      { header: "Status", value: (r) => (r.ledger ? LEDGER_STATUS_LABEL[r.ledger.status] : null) },
    ],
    rows
  );
}

interface IndicatorLine {
  label: string;
  value: (ind: Indicators) => number | null;
  /** The band this indicator is read against, when it has one. */
  key?: BenchmarkKey;
  /** Decimal places of the reference text. */
  decimals: number;
}

const INDICATOR_LINES: readonly IndicatorLine[] = [
  { label: "Resultado do período (R$)", value: (i) => i.result, decimals: 2 },
  { label: "Resultado por hectare (R$/ha)", value: (i) => i.resultPerHa, decimals: 2 },
  { label: "Margem (%)", value: (i) => i.marginPct, decimals: 1 },
  { label: "Custo ÷ receita (%)", value: (i) => i.costToRevenuePct, key: "costToRevenue", decimals: 0 },
  { label: "Custo da @ produzida (R$/@)", value: (i) => i.costPerArroba, key: "costPerArroba", decimals: 2 },
  { label: "Preço médio realizado (R$/@)", value: (i) => i.realizedPerArroba, decimals: 2 },
  { label: "Margem por @ (R$/@)", value: (i) => i.marginPerArroba, decimals: 2 },
  { label: "@ produzidas", value: (i) => i.produced.produced, decimals: 1 },
  { label: "@/ha/ano", value: (i) => i.arrobasPerHa, key: "arrobasPerHa", decimals: 1 },
  { label: "Desembolso por cabeça (R$/cab/mês)", value: (i) => i.outlayPerHeadMonth, key: "outlay", decimals: 2 },
  { label: "GMD (kg/dia)", value: (i) => i.adg.kgPerDay, key: "gmd", decimals: 3 },
  { label: "Taxa de desfrute (%)", value: (i) => i.offtakePct, key: "offtake", decimals: 1 },
  { label: "Lotação (UA/ha)", value: (i) => i.stocking, key: "stocking", decimals: 2 },
  { label: "Relação de troca (bezerros por boi)", value: (i) => i.exchange.calvesPerSteer, decimals: 1 },
  { label: "Valor do rebanho (R$)", value: (i) => i.herdValue, decimals: 2 },
];

/** "média 208,00 · top 165,00 · Inttegra 24/25", or "" for an indicator without a band. */
function referenceText(line: IndicatorLine, ind: Indicators): string {
  if (!line.key) return "";
  const b = benchmark(line.key, ind.system);
  const mean = `${b.meanLabel ?? "média"} ${formatNumber(b.mean, line.decimals)}`;
  const top = b.top === null ? "" : ` · ${b.topLabel ?? "top"} ${formatNumber(b.top, line.decimals)}`;
  return `${mean}${top} · ${b.source}`;
}

/** The Placar: each indicator, the same window a year earlier, and its reference. */
export function indicatorsExportTable(
  ind: Indicators,
  prior: Indicators | null,
  title = "Indicadores"
): ExportTable {
  return buildTable(
    title,
    [
      { header: "Indicador", value: (l) => l.label },
      { header: "Valor", kind: "number", decimals: 2, value: (l) => l.value(ind) },
      { header: "Ano anterior", kind: "number", decimals: 2, value: (l) => (prior ? l.value(prior) : null) },
      { header: "Referência", value: (l) => referenceText(l, ind) },
    ],
    INDICATOR_LINES
  );
}

/** The Por lote table: each active lote, then the whole farm. */
export function lotsEconomicsExportTable(
  lots: readonly LotEconomics[],
  farm: LotEconomics,
  title = "Por lote"
): ExportTable {
  return buildTable(
    title,
    [
      { header: "Lote", value: (l) => l.name },
      { header: "Cabeças", kind: "number", value: (l) => l.heads },
      { header: "Custo direto (R$)", kind: "money", value: (l) => l.directBrl },
      { header: "Rateio (R$)", kind: "money", value: (l) => l.sharedBrl },
      { header: "Custo total (R$)", kind: "money", value: (l) => l.totalBrl },
      { header: "R$/cab/dia", kind: "money", value: (l) => l.perHeadDay },
      { header: "GMD (kg/dia)", kind: "number", decimals: 3, value: (l) => l.adg },
      { header: "@ produzidas", kind: "number", decimals: 1, value: (l) => l.produced },
      { header: "Custo/@ (R$)", kind: "money", value: (l) => l.costPerArroba },
      { header: "Margem/@ (R$)", kind: "money", value: (l) => l.marginPerArroba },
    ],
    [...lots, { ...farm, name: "Fazenda" }]
  );
}
