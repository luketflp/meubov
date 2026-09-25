import type { CashSummary } from "@/lib/domain/ledger";
import { formatCurrency } from "@/lib/domain/format";
import { cn } from "@/lib/utils";

const LABEL = "text-[11px] font-medium tracking-wide text-ink-soft uppercase";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Caixa do período": what came in and went out by payment date, and what is still open. */
export function CashStrip({ cash }: { cash: CashSummary }) {
  const cells = [
    { label: "Recebido", value: cash.received, sub: "vendas e outras receitas", ink: "text-ink" },
    {
      label: "A receber",
      value: cash.receivable,
      sub: plural(cash.receivableCount, "lançamento", "lançamentos"),
      ink: "text-scheduled",
    },
    { label: "Pago", value: cash.paid, sub: "despesas, tratamentos e compras", ink: "text-ink" },
    {
      label: "A pagar",
      value: cash.payable,
      sub:
        plural(cash.payableCount, "conta", "contas") +
        (cash.overdueCount > 0 ? ` · ${plural(cash.overdueCount, "vencida", "vencidas")}` : ""),
      ink: cash.overdueCount > 0 ? "text-overdue" : "text-ink",
    },
    {
      label: "Saldo realizado",
      value: cash.balance,
      sub: "recebido − pago",
      ink: cash.balance >= 0 ? "text-healthy" : "text-overdue",
      // On the phone the balance takes the whole last row.
      className: "col-span-2 bg-surface md:col-span-1 md:bg-panel",
    },
  ];

  return (
    <section
      aria-label="Caixa do período"
      className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-hairline bg-hairline md:grid-cols-5"
    >
      {cells.map((cell) => (
        <div key={cell.label} className={cn("min-w-0 bg-panel px-4 py-3.5", cell.className)}>
          <p className={LABEL}>{cell.label}</p>
          <p className={cn("mt-1 truncate font-mono text-lg font-medium", cell.ink)}>
            {formatCurrency(cell.value)}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-ink-soft">{cell.sub}</p>
        </div>
      ))}
    </section>
  );
}
