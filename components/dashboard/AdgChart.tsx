"use client";

import { TrendingUp } from "lucide-react";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { LineChart } from "@/components/charts/line-chart";
import { formatNumber } from "@/lib/domain/format";
import type { MonthlyAdgPoint } from "@/lib/domain/adg";

interface AdgChartProps {
  series: MonthlyAdgPoint[];
}

/** Monthly evolution of the herd's average ADG (kg/day) over the last 6 months. */
export function AdgChart({ series }: AdgChartProps) {
  const points = series.flatMap((p) =>
    p.averageAdg === null ? [] : [{ label: p.month, value: p.averageAdg }]
  );

  return (
    <SectionCard title="GMD do rebanho">
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
