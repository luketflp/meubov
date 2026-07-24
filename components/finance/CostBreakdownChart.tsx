import { SectionCard } from "@/components/ui/section-card";
import { DonutChart, type DonutSlice } from "@/components/charts/donut-chart";
import type { CostBreakdown } from "@/lib/data/market";
import { formatCompact } from "@/components/finance/format";

interface CostBreakdownChartProps {
  breakdown: CostBreakdown[];
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

/** Donut with the percentage cost breakdown and the period total cost at the center. */
export function CostBreakdownChart({ breakdown, totalCost }: CostBreakdownChartProps) {
  const slices: DonutSlice[] = breakdown.map((cost, index) => ({
    label: cost.category,
    value: cost.pct,
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
