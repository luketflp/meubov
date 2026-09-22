"use client";

/**
 * "Financeiro do período": receita, custo, resultado and margem of the picked
 * window, where the cost went by category, and receita × custo month by month.
 */
import Link from "next/link";
import { ArrowRight, Coins } from "lucide-react";
import type { CostBreakdownSlice, MonthlyRevenueCost } from "@/lib/domain/economics";
import type { PeriodResult } from "@/lib/domain/finance";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/domain/labels";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { formatCompactCurrency } from "@/components/finance/format";
import { BarChart, type BarGroup } from "@/components/charts/bar-chart";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { cn } from "@/lib/utils";

/** Slice colors in breakdown order, as the old Despesas card painted them. */
const SLICE_COLORS = ["bg-brand", "bg-scheduled", "bg-attention", "bg-fmd", "bg-healthy", "bg-ink-soft"];

interface FinanceCardProps {
  result: PeriodResult;
  breakdown: CostBreakdownSlice[];
  months: MonthlyRevenueCost[];
}

export function FinanceCard({ result, breakdown, months }: FinanceCardProps) {
  const empty = result.totalRevenue === 0 && result.totalCost === 0;
  const positive = result.result >= 0;
  const groups: BarGroup[] = months.map((month) => ({
    label: month.month,
    bars: [
      { key: "Receita", value: month.revenue, colorClass: "text-brand" },
      { key: "Custo", value: month.cost, colorClass: "text-fmd" },
    ],
  }));

  return (
    <SectionCard
      title="Financeiro do período"
      subtitle="receita e custo por mês"
      action={
        <Link
          href="/finance"
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline md:min-h-0"
        >
          Ver financeiro
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      }
    >
      {empty ? (
        <EmptyState
          icon={Coins}
          title="Sem lançamentos no período"
          description="Ajuste o período para incluir meses com receita ou custo."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-8">
          <div>
            <dl className="space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-sm text-ink-soft">Receita</dt>
                <dd className="font-mono text-lg font-medium text-ink">
                  {formatCurrency(result.totalRevenue)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-sm text-ink-soft">Custo</dt>
                <dd className="font-mono text-lg font-medium text-ink">
                  {formatCurrency(result.totalCost)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2 border-t border-hairline pt-3">
                <dt className="text-sm font-medium text-ink">Resultado</dt>
                <dd
                  className={cn(
                    "font-mono text-2xl font-semibold",
                    positive ? "text-healthy" : "text-overdue"
                  )}
                >
                  {formatCurrency(result.result)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-xs text-ink-soft">Margem líquida</dt>
                <dd
                  className={cn(
                    "font-mono text-sm font-medium",
                    positive ? "text-healthy" : "text-overdue"
                  )}
                >
                  {formatNumber(result.netMarginPct, 1)}%
                </dd>
              </div>
            </dl>

            {breakdown.length > 0 ? (
              <div className="mt-4 border-t border-hairline pt-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-medium tracking-wide text-ink-soft uppercase">
                    Para onde foi o custo
                  </p>
                  <span className="font-mono text-xs text-ink-soft">
                    {formatCompactCurrency(result.totalCost)}
                  </span>
                </div>
                <div aria-hidden className="mt-2 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
                  {breakdown.map((slice, index) => (
                    <span
                      key={slice.category}
                      className={SLICE_COLORS[index % SLICE_COLORS.length]}
                      style={{ flexGrow: slice.amountBrl }}
                    />
                  ))}
                </div>
                <ul className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {breakdown.map((slice, index) => (
                    <li key={slice.category} className="flex items-center gap-1.5 text-xs text-ink-soft">
                      <span
                        aria-hidden
                        className={cn("size-2 shrink-0 rounded-full", SLICE_COLORS[index % SLICE_COLORS.length])}
                      />
                      {EXPENSE_CATEGORY_LABEL[slice.category]}
                      <span className="ml-auto font-mono text-ink">{formatNumber(slice.pct)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <BarChart groups={groups} height={240} legend formatValue={formatCompactCurrency} />
        </div>
      )}
    </SectionCard>
  );
}
