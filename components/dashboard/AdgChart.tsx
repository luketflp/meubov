"use client";

import { TrendingUp } from "lucide-react";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { LineChart } from "@/components/charts/line-chart";
import { TonePill } from "@/components/dashboard/tone";
import { formatNumber } from "@/lib/domain/format";
import type { MonthlyAdgPoint } from "@/lib/domain/adg";

interface AdgChartProps {
  series: MonthlyAdgPoint[];
  /** Last month's GMD minus the month before's, shown as a pill. */
  change?: number | null;
}

/** Monthly evolution of the herd's average ADG (kg/day) over the last 6 months. */
export function AdgChart({ series, change = null }: AdgChartProps) {
  const points = series.flatMap((p) =>
    p.averageAdg === null ? [] : [{ label: p.month, value: p.averageAdg }]
  );

  return (
    <SectionCard
      title="GMD do rebanho"
      subtitle="kg/dia · últimos 6 meses"
      action={
        change === null ? undefined : (
          <TonePill tone={change >= 0 ? "healthy" : "overdue"}>
            {change >= 0 ? "↑" : "↓"} {formatNumber(Math.abs(change), 2)} no mês
          </TonePill>
        )
      }
    >
      {points.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="Sem dados de GMD"
          description="Registre ao menos duas pesagens por animal para acompanhar o ganho médio diário."
        />
      ) : (
        <>
          <LineChart
            points={points}
            area
            highlightLast
            formatValue={(value) => formatNumber(value, 2)}
          />
          <p className="mt-2 text-xs text-ink-soft">
            Média mensal do ganho diário (kg/dia) dos animais ativos.
          </p>
        </>
      )}
    </SectionCard>
  );
}
