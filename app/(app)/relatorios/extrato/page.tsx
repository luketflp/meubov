"use client";

/**
 * Extrato de conta bancária (/relatorios/extrato): each conta's saldo
 * anterior, what went in and out of it line by line, and its saldo final, for
 * the contador and the conferência with the bank. Needs Financeiro view.
 */
import { useMemo, useState } from "react";
import { bankAccountLabel, cents } from "@/lib/domain/bankAccounts";
import { todayISO } from "@/lib/domain/dates";
import { formatCurrency } from "@/lib/domain/format";
import type { Period } from "@/lib/domain/period";
import { bankStatement } from "@/lib/reports/bankStatement";
import { RequireAccess } from "@/components/layout/RequireAccess";
import { PeriodPicker } from "@/components/dashboard/PeriodPicker";
import { usePrintFarm, useExportContext } from "@/components/export/useExportContext";
import { BankStatementSheet } from "@/components/reports/BankStatementSheet";
import { periodLabel } from "@/components/reports/GroupsSheet";
import { ParamField, ReportScreen } from "@/components/reports/ReportScreen";
import { lastMonth } from "@/components/reports/params";
import { bankStatementTable, bankSummaryTable, withTotalsRow } from "@/components/reports/tables";
import { useDownload } from "@/components/reports/useDownload";
import { usePlanInputs } from "@/components/reports/useReportData";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function BankStatementPage() {
  return (
    <RequireAccess area="finance" level="view">
      <BankStatementScreen />
    </RequireAccess>
  );
}

const ALL = "all";

function BankStatementScreen() {
  const inputs = usePlanInputs();
  const farm = usePrintFarm();
  const exportContext = useExportContext();
  const { download, busy } = useDownload();
  const today = todayISO();

  const [period, setPeriod] = useState<Period>(() => lastMonth(today));
  const [bankId, setBankId] = useState(ALL);

  const sections = useMemo(() => bankStatement(inputs, bankId, period, today), [inputs, bankId, period, today]);
  const picked = inputs.bankAccounts.find((bank) => bank.id === bankId);
  const scope = picked ? bankAccountLabel(picked) : "todas as contas";
  const filters = [`Período: ${periodLabel(period)}`, `Conta: ${scope}`];
  const inBanks = cents(sections.filter((s) => s.bank.kind !== "card").reduce((sum, s) => sum + s.closing, 0));

  const downloadSheet = () => {
    const tables = sections.length > 1 ? [withTotalsRow(bankSummaryTable(sections))] : [];
    tables.push(bankStatementTable(sections));
    void download("extrato", "Extrato de conta bancária", tables, "xlsx", filters);
  };

  return (
    <ReportScreen
      title="Extrato de conta bancária"
      subtitle={
        picked
          ? `${periodLabel(period)} · ${scope}`
          : `${periodLabel(period)} · ${sections.length === 1 ? "1 conta" : `${sections.length} contas`} · ${formatCurrency(inBanks)} em contas no fim do período`
      }
      onDownload={downloadSheet}
      downloading={busy !== null}
      ready={sections.length > 0}
      params={
        <>
          <div className="grid gap-1.5">
            <p className="text-sm font-medium text-ink">Período</p>
            <PeriodPicker value={period} onChange={setPeriod} fill />
          </div>
          <ParamField
            label="Conta"
            htmlFor="extrato-conta"
            hint="Uma conta só, ou todas: cada uma vira uma seção, com o resumo no topo."
          >
            <Select value={bankId} onValueChange={setBankId}>
              <SelectTrigger id="extrato-conta" className="min-h-11 w-full md:min-h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas as contas</SelectItem>
                {inputs.bankAccounts.map((bank) => (
                  <SelectItem key={bank.id} value={bank.id}>
                    {bankAccountLabel(bank)}
                    {bank.archivedAt !== undefined ? " (arquivada)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </ParamField>
          <p className="text-xs text-ink-soft">
            Só o que foi pago ou recebido, pela data do pagamento. Os pendentes ficam em Lançamentos.
          </p>
        </>
      }
    >
      <BankStatementSheet sections={sections} period={period} scope={scope} farm={farm} context={exportContext(filters)} />
    </ReportScreen>
  );
}
