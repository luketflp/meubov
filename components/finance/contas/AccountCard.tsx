"use client";

/**
 * One conta on the Contas bancárias page: its name, identificação, the saldo
 * (or what is owed on a cartão) and how its conciliação stands. The
 * card picks the conta whose movimentação shows below.
 */
import Link from "next/link";
import { CalendarDays, CircleCheck, CreditCard, Landmark, Wallet } from "lucide-react";
import type { BankAccount } from "@/lib/types";
import { formatDate } from "@/lib/domain/dates";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { cn } from "@/lib/utils";

const ICON = { checking: Landmark, cash: Wallet, card: CreditCard } as const;
const DEFAULT_LABEL = { checking: "conta corrente", cash: "dinheiro", card: "crédito" } as const;

const PILL = "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap";

interface AccountCardProps {
  account: BankAccount;
  /** Saldo today; a cartão's is negative, what is owed on it. */
  value: number;
  /** Cartão: the due day of the fatura still open. */
  due?: string;
  selected: boolean;
  onSelect(): void;
}

export function AccountCard({ account, value, due, selected, onSelect }: AccountCardProps) {
  const Icon = ICON[account.kind];
  const card = account.kind === "card";
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-lg border bg-panel px-4 py-3.5",
        selected ? "border-brand shadow-[0_0_0_1px_var(--color-brand)]" : "border-hairline"
      )}
    >
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className="flex min-h-11 flex-col gap-3 text-left"
      >
        <span className="flex items-center gap-2.5">
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg",
              selected ? "bg-brand-soft text-brand" : "bg-surface text-ink-soft"
            )}
          >
            <Icon className="size-4" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-ink">{account.name}</span>
            <span className="block truncate text-xs text-ink-soft">
              {account.label ?? DEFAULT_LABEL[account.kind]}
            </span>
          </span>
        </span>
        <span>
          <span className="block text-[11px] font-medium tracking-wide text-ink-soft uppercase">
            {card ? "A pagar no cartão" : "Saldo"}
          </span>
          <span className="mt-0.5 block font-mono text-xl font-medium whitespace-nowrap text-ink md:text-[22px]">
            {/* + 0 turns -0 into 0 */}
            {formatCurrency((card ? -value : value) + 0)}
          </span>
        </span>
      </button>
      <div className="flex min-h-[22px] flex-wrap items-center gap-2 text-xs text-ink-soft">
        {card ? (
          <>
            <span>fora do saldo</span>
            {due ? (
              <span className={cn(PILL, "bg-scheduled-soft text-scheduled")}>
                <CalendarDays className="size-3" aria-hidden />
                vence {formatDate(due).slice(0, 5)}
              </span>
            ) : null}
          </>
        ) : account.kind === "cash" ? (
          <span>sem extrato</span>
        ) : account.pendingLines > 0 ? (
          <>
            {account.reconciledUntil ? <span>conciliado até {formatDate(account.reconciledUntil).slice(0, 5)}</span> : null}
            {account.pendingImportId ? (
              // The link takes the phone's 44 px; the pill keeps its look inside it.
              <Link
                href={`/finance/contas/${account.id}/conciliar/${account.pendingImportId}`}
                className="group inline-flex min-h-11 items-center md:min-h-6"
              >
                <span className={cn(PILL, "bg-attention-soft text-attention group-hover:underline")}>
                  {formatNumber(account.pendingLines)} a conciliar
                </span>
              </Link>
            ) : (
              <span className={cn(PILL, "bg-attention-soft text-attention")}>
                {formatNumber(account.pendingLines)} a conciliar
              </span>
            )}
          </>
        ) : account.reconciledUntil ? (
          account.lastImportId ? (
            // The last import stays one tap away, so its Desfazer does too.
            <Link
              href={`/finance/contas/${account.id}/conciliar/${account.lastImportId}`}
              className="inline-flex min-h-11 items-center gap-1.5 text-healthy hover:underline md:min-h-0"
            >
              <CircleCheck className="size-3.5" aria-hidden />
              conciliado até {formatDate(account.reconciledUntil).slice(0, 5)}
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-healthy">
              <CircleCheck className="size-3.5" aria-hidden />
              conciliado até {formatDate(account.reconciledUntil).slice(0, 5)}
            </span>
          )
        ) : (
          <span>nenhum extrato importado</span>
        )}
      </div>
    </div>
  );
}
