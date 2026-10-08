/**
 * Extrato de conta bancária on A4: the resumo of the contas (when more than
 * one), then each conta's lines with the saldo after each one, closed by its
 * saldo anterior, entradas, saídas and saldo final.
 */
import { BANK_ACCOUNT_KIND_LABEL, bankAccountLabel } from "@/lib/domain/bankAccounts";
import { addDays } from "@/lib/domain/dates";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import type { Period } from "@/lib/domain/period";
import type { ExportContext } from "@/lib/export/table";
import { statementDate, type StatementSection } from "@/lib/reports/bankStatement";
import {
  A4Sheet,
  PrintBalance,
  PrintFooter,
  PrintHeader,
  PrintNote,
  PrintSection,
  PrintTable,
  type PrintFarm,
} from "@/components/print/PrintSheet";
import { periodLabel } from "@/components/reports/GroupsSheet";
import { bankSummaryTable } from "@/components/reports/tables";
import { cn } from "@/lib/utils";

/** "+1.234,56", "−1.234,56". */
const signed = (n: number): string => `${n < 0 ? "−" : "+"}${formatNumber(Math.abs(n), 2)}`;
const plain = (n: number): string => `${n < 0 ? "−" : ""}${formatNumber(Math.abs(n), 2)}`;

/** [header, right-aligned, width in px]. */
const COLUMNS: [string, boolean, number | undefined][] = [
  ["Pagto", false, 50],
  ["Emissão", false, 54],
  ["Vencto", false, 50],
  ["Documento", false, 76],
  ["Pago para / recebido de", false, 104],
  ["Histórico · conta do plano", false, undefined],
  ["Valor", true, 78],
  ["Saldo", true, 84],
];

function StatementTable({ section, period }: { section: StatementSection; period: Period }) {
  return (
    <table className="w-full table-fixed border-collapse text-[11px] leading-4">
      <thead className="table-header-group">
        <tr>
          {COLUMNS.map(([header, right, width]) => (
            <th
              key={header}
              style={width ? { width } : undefined}
              className={cn(
                "border-b-[1.5px] border-ink px-1.5 py-1.5 align-bottom text-[10px] font-semibold tracking-wide text-ink-soft uppercase",
                right ? "text-right" : "text-left"
              )}
            >
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {section.lines.map((line) => (
          <tr key={line.id} className="break-inside-avoid align-top">
            <td className="border-b border-hairline px-1.5 py-1 font-mono">{statementDate(line.paidAt, period)}</td>
            <td className="border-b border-hairline px-1.5 py-1 font-mono text-ink-soft">
              {statementDate(line.issuedAt, period)}
            </td>
            <td className="border-b border-hairline px-1.5 py-1 font-mono text-ink-soft">
              {line.dueDate ? statementDate(line.dueDate, period) : "—"}
            </td>
            <td className="border-b border-hairline px-1.5 py-1 text-[10.5px] break-words">{line.document ?? "—"}</td>
            <td className="border-b border-hairline px-1.5 py-1 break-words">{line.counterparty ?? "—"}</td>
            <td className="border-b border-hairline px-1.5 py-1 break-words">
              {line.history}
              <span className="block text-[10px] text-ink-soft">{line.planAccount}</span>
            </td>
            <td className="border-b border-hairline px-1.5 py-1 text-right font-mono whitespace-nowrap">
              {signed(line.amountBrl)}
            </td>
            <td className="border-b border-hairline px-1.5 py-1 text-right font-mono whitespace-nowrap">
              {plain(line.balance)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function BankStatementSheet({
  sections,
  period,
  scope,
  farm,
  context,
}: {
  sections: StatementSection[];
  period: Period;
  /** "todas as contas" or the conta's name. */
  scope: string;
  farm: PrintFarm;
  context: ExportContext;
}) {
  const summary = bankSummaryTable(sections);
  const dayBefore = statementDate(addDays(period.start, -1), period);

  return (
    <A4Sheet>
      <PrintHeader farm={farm} title="Extrato de conta bancária" subtitle={`${periodLabel(period)} · ${scope}`} />
      {sections.length > 1 ? (
        <PrintSection title="Resumo" note={`${sections.length} contas`}>
          <PrintTable table={summary.table} totals={summary.totals} />
        </PrintSection>
      ) : null}
      {sections.length === 0 ? <PrintNote>Nenhuma conta bancária cadastrada.</PrintNote> : null}
      {sections.map((section) => (
        <PrintSection
          key={section.bank.id}
          title={bankAccountLabel(section.bank)}
          note={
            section.bank.kind === "card"
              ? `${BANK_ACCOUNT_KIND_LABEL.card} · saldo negativo é o que falta pagar`
              : BANK_ACCOUNT_KIND_LABEL[section.bank.kind]
          }
        >
          {section.lines.length > 0 ? (
            <StatementTable section={section} period={period} />
          ) : (
            <PrintNote>Nenhuma movimentação no período.</PrintNote>
          )}
          <div className="mt-1.5">
            <PrintBalance
              lines={[
                [`Saldo anterior (${dayBefore})`, formatCurrency(section.opening)],
                ["Entradas", `+${formatNumber(section.ins, 2)}`],
                ["Saídas", `−${formatNumber(section.outs, 2)}`],
                [`Saldo final (${statementDate(period.end, period)})`, formatCurrency(section.closing)],
              ]}
            />
          </div>
        </PrintSection>
      ))}
      <PrintNote>
        Só o que foi pago ou recebido, pela data do pagamento; os lançamentos pendentes ficam em Lançamentos. O saldo
        anterior é o saldo inicial da conta mais tudo o que passou por ela até o dia anterior ao período. Vendas e
        compras de gado vêm dos manejos.
      </PrintNote>
      <PrintFooter context={context} />
    </A4Sheet>
  );
}
