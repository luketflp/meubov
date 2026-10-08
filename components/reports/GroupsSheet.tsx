/**
 * Receitas e despesas por grupo on A4: the figures, the receitas by conta, the
 * despesas by grupo (or grupo and conta), the saldo, and optionally what moved
 * outside the resultado, with a note on what the regime takes.
 */
import { formatDate } from "@/lib/domain/dates";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import type { Period } from "@/lib/domain/period";
import type { ExportContext } from "@/lib/export/table";
import { REGIME_LABEL, type GroupsReport, type Regime } from "@/lib/reports/groups";
import {
  A4Sheet,
  PrintBalance,
  PrintFigures,
  PrintFooter,
  PrintHeader,
  PrintNote,
  PrintSection,
  PrintTable,
  type PrintFarm,
} from "@/components/print/PrintSheet";
import { groupsCapitalTable, groupsExpenseTable, groupsRevenueTable } from "@/components/reports/tables";

/** The optional parts of the report. */
export interface GroupsOptions {
  /** Opens each grupo into its contas. */
  accounts: boolean;
  /** Investimentos, financiamentos, sócios and rendimentos. */
  capital: boolean;
}

/** "01/09/2026 a 30/09/2026". */
export const periodLabel = (period: Period): string => `${formatDate(period.start)} a ${formatDate(period.end)}`;

const REGIME_NOTE: Record<Regime, string> = {
  accrual: "Regime de competência: pela data do lançamento, pago ou não.",
  cash: "Regime de caixa: só o que foi pago ou recebido no período, pela data do pagamento.",
};

export function GroupsSheet({
  report,
  period,
  regime,
  options,
  farm,
  context,
}: {
  report: GroupsReport;
  period: Period;
  regime: Regime;
  options: GroupsOptions;
  farm: PrintFarm;
  context: ExportContext;
}) {
  const revenues = groupsRevenueTable(report);
  const expenses = groupsExpenseTable(report, options.accounts);
  const capital = groupsCapitalTable(report);
  const ratio = report.revenueTotal > 0 ? (report.expenseTotal / report.revenueTotal) * 100 : null;

  return (
    <A4Sheet>
      <PrintHeader
        farm={farm}
        title="Receitas e despesas por grupo"
        subtitle={`${periodLabel(period)} · regime de ${REGIME_LABEL[regime]}`}
      />
      <PrintFigures
        figures={[
          { label: "Receitas", value: formatCurrency(report.revenueTotal) },
          { label: "Despesas", value: formatCurrency(report.expenseTotal) },
          { label: "Saldo", value: formatCurrency(report.balance) },
          { label: "Despesas / receita", value: ratio === null ? "—" : `${formatNumber(ratio, 2)} %` },
        ]}
      />
      <PrintSection title="Receitas" note="por conta">
        {report.revenues.length > 0 ? (
          <PrintTable table={revenues.table} totals={revenues.totals} />
        ) : (
          <PrintNote>Nenhuma receita no período.</PrintNote>
        )}
      </PrintSection>
      <PrintSection
        title="Despesas"
        note={options.accounts ? "por grupo e conta, em ordem alfabética" : "por grupo, em ordem alfabética"}
      >
        {report.expenses.length > 0 ? (
          <PrintTable table={expenses.table} totals={expenses.totals} subRows={expenses.subRows} />
        ) : (
          <PrintNote>Nenhuma despesa no período.</PrintNote>
        )}
      </PrintSection>
      <PrintBalance
        lines={[
          ["Receitas", formatCurrency(report.revenueTotal)],
          ["Despesas", formatCurrency(-report.expenseTotal)],
          ["Saldo do período", formatCurrency(report.balance)],
        ]}
      />
      {options.capital ? (
        <PrintSection title="Fora do resultado" note="investimentos, financiamentos, sócios e rendimentos · fora do saldo">
          {report.capital.length > 0 ? (
            <PrintTable table={capital.table} totals={capital.totals} subRows={capital.subRows} />
          ) : (
            <PrintNote>Nada fora do resultado no período.</PrintNote>
          )}
        </PrintSection>
      ) : null}
      <PrintNote>
        {REGIME_NOTE[regime]} Vendas e compras de gado entram pela data do manejo; tratamentos com custo, pela data da
        aplicação, em Sanidade.
      </PrintNote>
      <PrintFooter context={context} />
    </A4Sheet>
  );
}
