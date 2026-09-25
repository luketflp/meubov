"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Wallet } from "lucide-react";
import type { Account, Expense, ExpenseCategory, Treatment } from "@/lib/types";
import type { CostBreakdownSlice } from "@/lib/domain/economics";
import { accountName } from "@/lib/domain/accounts";
import { inPeriod, periodSearch, type Period } from "@/lib/domain/period";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/domain/labels";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { cn } from "@/lib/utils";

/** Slice colors by rank, largest first, as the Painel's FinanceCard paints them. */
const SLICE_COLORS = [
  "bg-brand",
  "bg-scheduled",
  "bg-attention",
  "bg-fmd",
  "bg-healthy",
  "bg-ink-soft",
  "bg-ink-soft/40",
];

interface CostBreakdownCardProps {
  breakdown: CostBreakdownSlice[];
  expenses: Expense[];
  treatments: Treatment[];
  accounts: Account[];
  period: Period;
}

/** The group's despesas in the window by conta ("Sem conta" when none), plus treatments under Sanidade. */
function accountTotals(
  category: ExpenseCategory,
  expenses: Expense[],
  treatments: Treatment[],
  accounts: Account[],
  period: Period
): { label: string; amount: number }[] {
  const totals = new Map<string, number>();
  for (const expense of expenses) {
    if (expense.kind === "revenue" || expense.category !== category) continue;
    if (!inPeriod(expense.date, period)) continue;
    const label = accountName(expense.accountId, accounts) ?? "Sem conta";
    totals.set(label, (totals.get(label) ?? 0) + expense.amountBrl);
  }
  if (category === "health") {
    const treated = treatments.reduce(
      (sum, t) =>
        t.status === "done" && t.costBrl !== undefined && inPeriod(t.date, period)
          ? sum + t.costBrl
          : sum,
      0
    );
    if (treated > 0) totals.set("Tratamentos (manejos)", treated);
  }
  return [...totals]
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/** COE by grupo; a grupo opens to its contas, the largest open by default. */
export function CostBreakdownCard({
  breakdown,
  expenses,
  treatments,
  accounts,
  period,
}: CostBreakdownCardProps) {
  // null = the default (largest open); "none" = the user closed every grupo.
  const [picked, setPicked] = useState<ExpenseCategory | "none" | null>(null);
  // A picked grupo with no cost in this window falls back to the largest.
  const openSlice =
    picked === "none"
      ? null
      : (breakdown.find((slice) => slice.category === picked) ?? breakdown[0] ?? null);
  const open = openSlice?.category ?? null;
  const total = breakdown.reduce((sum, slice) => sum + slice.amountBrl, 0);
  const largest = Math.max(1, ...breakdown.map((slice) => slice.amountBrl));
  const byAccount = openSlice
    ? accountTotals(openSlice.category, expenses, treatments, accounts, period)
    : [];

  const extratoHref = `/finance/extrato?${periodSearch(period)}${open ? `&grupo=${open}` : ""}`;

  return (
    <SectionCard
      title="Composição de custos"
      subtitle={`COE ${formatCurrency(total)} · toque num grupo para abrir as contas`}
      action={
        <Link
          href={extratoHref}
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline md:min-h-0"
        >
          Ver extrato
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      }
    >
      {breakdown.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Sem custos no período"
          description="Lance despesas (ou tratamentos com custo) para ver a composição."
        />
      ) : (
        <>
          <ul className="flex flex-col gap-1">
            {breakdown.map((slice, index) => {
              const color = SLICE_COLORS[index % SLICE_COLORS.length];
              const isOpen = slice.category === open;
              return (
                <li key={slice.category}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setPicked(isOpen ? "none" : slice.category)}
                    className={cn(
                      "block min-h-11 w-full rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-surface md:min-h-0",
                      isOpen && "bg-surface"
                    )}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="inline-flex items-center gap-2 text-[13px] text-ink">
                        <span aria-hidden className={cn("size-2 rounded-full", color)} />
                        {EXPENSE_CATEGORY_LABEL[slice.category]}
                      </span>
                      <span className="font-mono text-[13px] whitespace-nowrap text-ink">
                        {formatCurrency(slice.amountBrl)}
                        <span className="text-ink-soft"> · {formatNumber(slice.pct, 1)}%</span>
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className="mt-1 block h-1.5 overflow-hidden rounded-full border border-hairline bg-canvas"
                    >
                      <span
                        className={cn("block h-full rounded-full", color)}
                        style={{ width: `${(slice.amountBrl / largest) * 100}%` }}
                      />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {openSlice ? (
            <div className="mt-3 border-t border-hairline pt-2.5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-ink">
                  {EXPENSE_CATEGORY_LABEL[openSlice.category]} por conta
                </span>
                <span className="text-xs text-ink-soft">
                  {byAccount.length} {byAccount.length === 1 ? "conta" : "contas"}
                </span>
              </div>
              <ul className="flex flex-col gap-1.5">
                {byAccount.map((row) => (
                  <li key={row.label} className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="truncate pl-4 text-ink">{row.label}</span>
                    <span className="font-mono whitespace-nowrap text-ink">
                      {formatCurrency(row.amount)}
                      <span className="text-ink-soft">
                        {" "}
                        · {formatNumber(openSlice.amountBrl > 0 ? (row.amount / openSlice.amountBrl) * 100 : 0)}%
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </SectionCard>
  );
}
