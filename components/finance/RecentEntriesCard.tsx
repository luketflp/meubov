import Link from "next/link";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, ReceiptText } from "lucide-react";
import type { LedgerRow, LedgerStatus } from "@/lib/domain/ledger";
import { periodSearch, type Period } from "@/lib/domain/period";
import { formatDate } from "@/lib/domain/dates";
import { formatCurrency } from "@/lib/domain/format";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { cn } from "@/lib/utils";

const RECENT = 5;

/** StatusPill's colors with the ledger's words (StatusPill's own labels are fixed). */
const STATUS: Record<LedgerStatus, { label: string; pill: string; dot: string }> = {
  paid: { label: "pago", pill: "bg-healthy-soft text-healthy", dot: "bg-healthy" },
  received: { label: "recebido", pill: "bg-healthy-soft text-healthy", dot: "bg-healthy" },
  payable: { label: "a pagar", pill: "bg-attention-soft text-attention", dot: "bg-attention" },
  receivable: { label: "a receber", pill: "bg-scheduled-soft text-scheduled", dot: "bg-scheduled" },
  overdue: { label: "vencida", pill: "bg-overdue-soft text-overdue", dot: "bg-overdue" },
};

/** The five newest Extrato rows of the window. */
export function RecentEntriesCard({ rows, period }: { rows: LedgerRow[]; period: Period }) {
  const recent = rows.slice(0, RECENT);

  return (
    <SectionCard
      title="Últimos lançamentos"
      subtitle={`${rows.length} no período · despesas, receitas, vendas e compras`}
      action={
        <Link
          href={`/finance/extrato?${periodSearch(period)}`}
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline md:min-h-0"
        >
          Ver extrato
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      }
    >
      {recent.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="Nenhum lançamento no período"
          description="Lance despesas e receitas, ou registre vendas e compras nos manejos."
        />
      ) : (
        <ul>
          {recent.map((row, index) => {
            const income = row.kind === "revenue" || row.kind === "sale";
            const status = STATUS[row.status];
            const title = row.account ? `${row.groupLabel} › ${row.account}` : row.groupLabel;
            const detail = [row.counterparty ?? row.notes, row.lotName].filter(Boolean).join(" · ");
            return (
              <li
                key={row.id}
                className={cn(
                  "flex min-h-11 items-center gap-3 py-2",
                  index > 0 && "border-t border-hairline"
                )}
              >
                <span className="w-10 shrink-0 font-mono text-xs text-ink-soft">
                  {formatDate(row.date).slice(0, 5)}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-lg",
                    income ? "bg-healthy-soft text-healthy" : "bg-surface text-ink-soft"
                  )}
                >
                  {income ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {title}
                    {row.locked ? (
                      <span className="text-[11px] font-normal text-ink-soft"> · automático</span>
                    ) : null}
                  </p>
                  {detail ? <p className="mt-px truncate text-xs text-ink-soft">{detail}</p> : null}
                </div>
                {/* Phone: the pill sits under the value; wider: beside it. */}
                <div className="flex shrink-0 flex-col-reverse items-end gap-0.5 sm:flex-row sm:items-center sm:gap-3">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
                      status.pill
                    )}
                  >
                    <span aria-hidden className={cn("size-1.5 rounded-full", status.dot)} />
                    {status.label}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-sm font-medium whitespace-nowrap",
                      income ? "text-healthy" : "text-ink"
                    )}
                  >
                    {income ? "+" : "−"}
                    {formatCurrency(row.amountBrl)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
