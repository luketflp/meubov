"use client";

import { Wallet } from "lucide-react";
import type { CostBreakdownSlice } from "@/lib/domain/economics";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/domain/labels";
import { SectionCard } from "@/components/ui/section-card";
import { BarChart, type BarGroup } from "@/components/charts/bar-chart";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency } from "@/lib/domain/format";
import { formatCompactCurrency } from "@/components/finance/format";

interface ExpensesCardProps {
  /** Real cost slices of the selected period (expenses + treatment costs). */
  breakdown: CostBreakdownSlice[];
  /** Period total cost (R$) shown in the card's top-right. */
  totalCost: number;
}

/** Bar color per category, in breakdown order. */
const BAR_COLORS = [
  "text-brand",
  "text-scheduled",
  "text-attention",
  "text-fmd",
  "text-healthy",
  "text-ink-soft",
] as const;

/** "Despesas por Categoria": real R$ per cost category in the period. */
export function ExpensesCard({ breakdown, totalCost }: ExpensesCardProps) {
  const groups: BarGroup[] = breakdown.map((slice, index) => ({
    label: EXPENSE_CATEGORY_LABEL[slice.category],
    bars: [
      {
        key: "Despesa",
        value: slice.amountBrl,
        colorClass: BAR_COLORS[index % BAR_COLORS.length],
      },
    ],
  }));

  return (
    <SectionCard
      title="Despesas por Categoria"
      action={
        <span className="flex flex-col items-end leading-tight">
          <span className="text-[11px] text-ink-soft">Valor Total</span>
          <span className="font-mono text-sm font-medium text-ink">
            {formatCurrency(totalCost)}
          </span>
        </span>
      }
    >
      {breakdown.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Sem despesas no período"
          description="Lance despesas (ou ajuste o período) para ver a composição."
        />
      ) : (
        <BarChart groups={groups} height={220} formatValue={formatCompactCurrency} />
      )}
    </SectionCard>
  );
}
