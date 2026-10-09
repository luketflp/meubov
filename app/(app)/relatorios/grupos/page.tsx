"use client";

/**
 * Receitas e despesas por grupo (/relatorios/grupos): the window's receitas and
 * despesas by grupo with the saldo, by competência or caixa, for the contador
 * and the sócios. Needs Financeiro view.
 */
import { useMemo, useState } from "react";
import { todayISO } from "@/lib/domain/dates";
import { formatCurrency } from "@/lib/domain/format";
import type { Period } from "@/lib/domain/period";
import { REGIME_LABEL, groupsReport, type Regime } from "@/lib/reports/groups";
import { RequireAccess } from "@/components/layout/RequireAccess";
import { PeriodPicker } from "@/components/dashboard/PeriodPicker";
import { usePrintFarm, useExportContext } from "@/components/export/useExportContext";
import { GroupsSheet, periodLabel, type GroupsOptions } from "@/components/reports/GroupsSheet";
import { ParamToggle, ReportScreen } from "@/components/reports/ReportScreen";
import { lastMonth } from "@/components/reports/params";
import { groupsCapitalTable, groupsExpenseTable, groupsRevenueTable, withTotalsRow } from "@/components/reports/tables";
import { useDownload } from "@/components/reports/useDownload";
import { usePlanInputs } from "@/components/reports/useReportData";
import { cn } from "@/lib/utils";

export default function GroupsReportPage() {
  return (
    <RequireAccess area="finance" level="view">
      <GroupsReportScreen />
    </RequireAccess>
  );
}

const REGIMES: { regime: Regime; label: string; hint: string }[] = [
  { regime: "accrual", label: "Competência", hint: "Pela data do lançamento, pago ou não." },
  { regime: "cash", label: "Caixa", hint: "Só o que foi pago ou recebido, pela data do pagamento." },
];

function GroupsReportScreen() {
  const inputs = usePlanInputs();
  const farm = usePrintFarm();
  const exportContext = useExportContext();
  const { download, busy } = useDownload();
  const today = todayISO();

  const [period, setPeriod] = useState<Period>(() => lastMonth(today));
  const [regime, setRegime] = useState<Regime>("accrual");
  const [options, setOptions] = useState<GroupsOptions>({ accounts: false, capital: false });

  const report = useMemo(() => groupsReport(inputs, period, regime, today), [inputs, period, regime, today]);
  const filters = [`Período: ${periodLabel(period)}`, `Regime: ${REGIME_LABEL[regime]}`];

  const downloadSheet = () => {
    const tables = [
      withTotalsRow(groupsRevenueTable(report, options.accounts)),
      withTotalsRow(groupsExpenseTable(report, options.accounts)),
    ];
    if (options.capital) tables.push(withTotalsRow(groupsCapitalTable(report)));
    void download("grupos", "Receitas e despesas por grupo", tables, "xlsx", filters);
  };

  const setOption = (key: keyof GroupsOptions) => (checked: boolean) =>
    setOptions((current) => ({ ...current, [key]: checked }));

  return (
    <ReportScreen
      title="Receitas e despesas por grupo"
      subtitle={`${periodLabel(period)} · ${REGIME_LABEL[regime]} · saldo ${formatCurrency(report.balance)}`}
      onDownload={downloadSheet}
      downloading={busy !== null}
      params={
        <>
          <div className="grid gap-1.5">
            <p className="text-sm font-medium text-ink">Período</p>
            <PeriodPicker value={period} onChange={setPeriod} fill />
          </div>
          <div className="grid gap-1.5">
            <p id="grupos-regime" className="text-sm font-medium text-ink">
              Regime
            </p>
            <div
              role="radiogroup"
              aria-labelledby="grupos-regime"
              className="flex items-center gap-0.5 rounded-lg border border-hairline bg-surface p-0.5"
            >
              {REGIMES.map((choice) => (
                <button
                  key={choice.regime}
                  type="button"
                  role="radio"
                  aria-checked={regime === choice.regime}
                  onClick={() => setRegime(choice.regime)}
                  className={cn(
                    "flex min-h-11 flex-1 items-center justify-center rounded-md px-3 text-[13px] transition-colors md:min-h-8",
                    regime === choice.regime
                      ? "bg-panel font-medium text-ink shadow-[0_0_0_1px_var(--color-hairline)]"
                      : "text-ink-soft hover:text-ink"
                  )}
                >
                  {choice.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-ink-soft">{REGIMES.find((choice) => choice.regime === regime)?.hint}</p>
          </div>
          <div className="flex flex-col gap-0.5 border-t border-hairline pt-3">
            <p className="mb-1 text-sm font-medium text-ink">Incluir</p>
            <ParamToggle
              id="grupos-contas"
              label="Contas de cada grupo"
              checked={options.accounts}
              onChange={setOption("accounts")}
            />
            <ParamToggle
              id="grupos-capital"
              label="Fora do resultado"
              checked={options.capital}
              onChange={setOption("capital")}
            />
            <p className="text-xs text-ink-soft">Investimentos, financiamentos, sócios e rendimentos; não entram no saldo.</p>
          </div>
        </>
      }
    >
      <GroupsSheet
        report={report}
        period={period}
        regime={regime}
        options={options}
        farm={farm}
        context={exportContext(filters)}
      />
    </ReportScreen>
  );
}
