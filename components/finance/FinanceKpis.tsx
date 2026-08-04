import { Beef, Tractor, TrendingUp, Wallet } from "lucide-react";
import { KpiCard } from "@/components/ui/kpi-card";
import type { PeriodResult } from "@/lib/domain/finance";
import { formatArroba, formatCurrency, formatNumber } from "@/lib/domain/format";

interface FinanceKpisProps {
  /** Live arroba price, or null when the quote is unavailable. */
  arrobaPrice: number | null;
  /** Change (%) vs the previous point, or null when the source has no history. */
  monthlyChangePct: number | null;
  /** Herd market value, or null when the quote is unavailable. */
  totalHerdValue: number | null;
  totalArrobas: number;
  result: PeriodResult;
  /** Real production cost per arroba, or null without enough data. */
  costPerArroba: number | null;
  /** Gross margin per arroba, or null when price or cost is unknown. */
  grossMarginArroba: number | null;
}

const DASH = "—";

/** Grid with the farm's 4 financial KPIs ("—" = data unavailable). */
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
        value={arrobaPrice === null ? DASH : formatCurrency(arrobaPrice)}
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
        value={totalHerdValue === null ? DASH : formatCurrency(totalHerdValue)}
        sub={
          arrobaPrice === null
            ? `${formatArroba(totalArrobas)} · cotação indisponível`
            : `${formatArroba(totalArrobas)} × ${formatCurrency(arrobaPrice)}`
        }
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
        value={costPerArroba === null ? DASH : formatCurrency(costPerArroba)}
        sub={
          grossMarginArroba === null
            ? "sem dados suficientes"
            : `margem bruta ${formatCurrency(grossMarginArroba)}/@`
        }
        icon={Tractor}
      />
    </div>
  );
}
