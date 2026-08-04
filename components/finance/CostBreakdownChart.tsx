import { Wallet } from "lucide-react";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { DonutChart, type DonutSlice } from "@/components/charts/donut-chart";
import type { CostBreakdownSlice } from "@/lib/domain/economics";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/domain/labels";
import { formatCompact } from "@/components/finance/format";

interface CostBreakdownChartProps {
  breakdown: CostBreakdownSlice[];
  totalCost: number;
}

/** Slice colors, in the order of the cost categories. */
const SLICE_COLORS = [
  "text-brand",
  "text-scheduled",
  "text-attention",
  "text-fmd",
  "text-healthy",
  "text-ink-soft",
] as const;

/** Donut with the real cost breakdown and the period total cost at the center. */
export function CostBreakdownChart({ breakdown, totalCost }: CostBreakdownChartProps) {
  if (breakdown.length === 0) {
    return (
      <SectionCard title="Composição de custos">
        <EmptyState
          icon={Wallet}
          title="Sem custos no período"
          description="Lance despesas (ou tratamentos com custo) para ver a composição."
        />
      </SectionCard>
    );
  }

  const slices: DonutSlice[] = breakdown.map((slice, index) => ({
    label: EXPENSE_CATEGORY_LABEL[slice.category],
    value: slice.pct,
    colorClass: SLICE_COLORS[index % SLICE_COLORS.length],
  }));

  return (
    <SectionCard title="Composição de custos">
      <DonutChart
        slices={slices}
        center={{ value: formatCompact(totalCost), label: "custo (R$)" }}
      />
    </SectionCard>
  );
}
