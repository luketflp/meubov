import { SectionCard } from "@/components/ui/section-card";
import { BarChart, type BarGroup } from "@/components/charts/bar-chart";
import type { MonthlyRevenueCost } from "@/lib/data/market";
import { formatCompactCurrency } from "@/components/finance/format";

interface RevenueCostChartProps {
  months: MonthlyRevenueCost[];
}

/** Monthly revenue x cost bars for the last 12 months. */
export function RevenueCostChart({ months }: RevenueCostChartProps) {
  const groups: BarGroup[] = months.map((month) => ({
    label: month.month,
    bars: [
      { key: "Receita", value: month.revenue, colorClass: "text-brand" },
      { key: "Custo", value: month.cost, colorClass: "text-fmd" },
    ],
  }));

  return (
    <SectionCard title="Receita × Custo (12 meses)">
      <BarChart groups={groups} height={220} legend formatValue={formatCompactCurrency} />
    </SectionCard>
  );
}
