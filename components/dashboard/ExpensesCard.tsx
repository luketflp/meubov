"use client";

import { Wallet } from "lucide-react";
import type { CostBreakdown } from "@/lib/data/market";
import { SectionCard } from "@/components/ui/section-card";
import { BarChart, type BarGroup } from "@/components/charts/bar-chart";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency } from "@/lib/domain/format";
import { formatCompactCurrency } from "@/components/finance/format";

interface ExpensesCardProps {
  /** Illustrative cost split in % (sums to 100) from market.ts. */
  breakdown: CostBreakdown[];
  /** Period total cost (R$) the percentages are applied to (period-filtered). */
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

/**
 * "Despesas por Categoria": turns the % cost breakdown into R$ bars by applying
 * each share to the period total cost, so the period filter flows through. The
 * total (= sum, which equals `totalCost`) is shown in the card's top-right.
 */
export function ExpensesCard({ breakdown, totalCost }: ExpensesCardProps) {
  const groups: BarGroup[] = breakdown.map((cost, index) => ({
    label: cost.category,
    bars: [
      {
        key: "Despesa",
        value: (cost.pct / 100) * totalCost,
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
      {totalCost <= 0 ? (
        <EmptyState
          icon={Wallet}
          title="Sem despesas no período"
          description="Ajuste o período para incluir meses com custo lançado."
        />
      ) : (
        <BarChart groups={groups} height={220} formatValue={formatCompactCurrency} />
      )}
    </SectionCard>
  );
}
