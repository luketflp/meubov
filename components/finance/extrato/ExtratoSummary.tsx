/**
 * The strip over the Extrato's rows: Receitas, Despesas (COE), Vendas and
 * Compras de gado, and the Resultado, all over the filtered rows.
 */
import type { LedgerKind, LedgerRow, LedgerSummary } from "@/lib/domain/ledger";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { cn } from "@/lib/utils";

const heads = (rows: LedgerRow[], kind: LedgerKind): number =>
  rows.reduce((sum, row) => (row.kind === kind ? sum + (row.headCount ?? 0) : sum), 0);

const count = (n: number, one: string, many: string): string =>
  `${formatNumber(n)} ${n === 1 ? one : many}`;

export function ExtratoSummary({ rows, summary }: { rows: LedgerRow[]; summary: LedgerSummary }) {
  const cells = [
    { label: "Receitas", value: summary.revenue, sub: "vendas e outras receitas", tone: "text-ink" },
    { label: "Despesas (COE)", value: summary.coe, sub: "despesas e tratamentos", tone: "text-ink" },
    {
      label: "Vendas de gado",
      value: summary.sales,
      sub: `${count(heads(rows, "sale"), "cabeça", "cabeças")} · entram nas receitas`,
      tone: "text-ink",
    },
    {
      label: "Compras de gado",
      value: summary.purchases,
      sub: `${count(heads(rows, "purchase"), "bezerro", "bezerros")} · capital, fora do COE`,
      tone: "text-ink",
    },
    {
      label: "Resultado",
      value: summary.result,
      sub: "receitas − despesas",
      tone: summary.result >= 0 ? "text-healthy" : "text-overdue",
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-hairline bg-hairline md:grid-cols-5">
      {cells.map((cell, index) => (
        <div
          key={cell.label}
          className={cn("bg-panel px-4 py-3", index === cells.length - 1 && "col-span-2 md:col-span-1")}
        >
          <dt className="text-[11px] font-medium tracking-wide text-ink-soft uppercase">{cell.label}</dt>
          <dd className={cn("mt-1 font-mono text-base tabular-nums md:text-lg", cell.tone)}>
            {formatCurrency(cell.value)}
          </dd>
          <dd className="mt-0.5 text-[11px] text-ink-soft">{cell.sub}</dd>
        </div>
      ))}
    </dl>
  );
}
