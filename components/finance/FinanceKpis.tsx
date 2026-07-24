import { Beef, Tractor, TrendingUp, Wallet } from "lucide-react";
import { KpiCard } from "@/components/ui/kpi-card";
import type { PeriodResult } from "@/lib/domain/finance";
import { formatArroba, formatCurrency, formatNumber } from "@/lib/domain/format";

interface FinanceKpisProps {
  arrobaPrice: number;
  /** Change (%) vs the previous point, or null when the source has no history. */
  monthlyChangePct: number | null;
  totalHerdValue: number;
  totalArrobas: number;
  result: PeriodResult;
  costPerArroba: number;
  grossMarginArroba: number;
}

/** Grid with the farm's 4 financial KPIs. */
export function FinanceKpis({
  arrobaPrice,
  monthlyChangePct,
  totalHerdValue,
  totalArrobas,
  result,
  costPerArroba,
  grossMarginArroba,
}: FinanceKpisProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Preço da @ do boi gordo"
        value={formatCurrency(arrobaPrice)}
        delta={
          monthlyChangePct === null
            ? undefined
            : {
                text: `${formatNumber(monthlyChangePct, 1)}% no mês`,
                positive: monthlyChangePct >= 0,
              }
        }
        icon={TrendingUp}
      />
      <KpiCard
        label="Valor do rebanho"
        value={formatCurrency(totalHerdValue)}
        sub={`${formatArroba(totalArrobas)} × ${formatCurrency(arrobaPrice)}`}
        icon={Beef}
      />
      <KpiCard
        label="Resultado do período"
        value={formatCurrency(result.result)}
        delta={{
          text: `${formatNumber(result.netMarginPct, 1)}% margem líquida`,
          positive: result.result >= 0,
        }}
        sub="últimos 12 meses"
        icon={Wallet}
      />
      <KpiCard
        label="Custo de produção/@"
        value={formatCurrency(costPerArroba)}
        sub={`margem bruta ${formatCurrency(grossMarginArroba)}/@`}
        icon={Tractor}
      />
    </div>
  );
}
