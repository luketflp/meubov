import { Wallet } from "lucide-react";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { BarChart, type BarGroup } from "@/components/charts/bar-chart";
import type { MonthlyRevenueCost } from "@/lib/domain/economics";
import { formatCompactCurrency } from "@/components/finance/format";
import { cn } from "@/lib/utils";

interface RevenueCostChartProps {
  /** The window's months, oldest first. */
  months: MonthlyRevenueCost[];
}

function LegendDot({ colorClass, text }: { colorClass: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-ink-soft">
      <span aria-hidden className={cn("size-2 rounded-full", colorClass)} />
      {text}
    </span>
  );
}

/** Monthly revenue × cost bars of the window, with the totals and the result above them. */
export function RevenueCostChart({ months }: RevenueCostChartProps) {
  const revenue = months.reduce((sum, month) => sum + month.revenue, 0);
  const cost = months.reduce((sum, month) => sum + month.cost, 0);
  const result = revenue - cost;

  if (revenue === 0 && cost === 0) {
    return (
      <SectionCard title="Receita × Custo" subtitle="por mês, do que a fazenda lançou">
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
    <SectionCard title="Receita × Custo" subtitle="por mês, do que a fazenda lançou">
      <div className="mb-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1">
        <LegendDot colorClass="bg-brand" text={`Receita ${formatCompactCurrency(revenue)}`} />
        <LegendDot colorClass="bg-fmd" text={`Custo (COE) ${formatCompactCurrency(cost)}`} />
        <span
          className={cn(
            "ml-auto font-mono text-xs font-medium",
            result >= 0 ? "text-healthy" : "text-overdue"
          )}
        >
          resultado {formatCompactCurrency(result)}
        </span>
      </div>
      <BarChart groups={groups} height={220} formatValue={formatCompactCurrency} />
    </SectionCard>
  );
}
