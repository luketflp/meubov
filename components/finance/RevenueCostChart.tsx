import { Wallet } from "lucide-react";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { BarChart, type BarGroup } from "@/components/charts/bar-chart";
import type { MonthlyRevenueCost } from "@/lib/domain/economics";
import { formatCompactCurrency } from "@/components/finance/format";

interface RevenueCostChartProps {
  months: MonthlyRevenueCost[];
}

/** Monthly revenue x cost bars derived from the farm's records. */
export function RevenueCostChart({ months }: RevenueCostChartProps) {
  const hasData = months.some((month) => month.revenue > 0 || month.cost > 0);
  if (!hasData) {
    return (
      <SectionCard title="Receita × Custo (12 meses)">
        <EmptyState
          icon={Wallet}
          title="Sem lançamentos financeiros"
          description="Registre vendas com valor e lance despesas para acompanhar receita × custo."
        />
      </SectionCard>
    );
  }

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
