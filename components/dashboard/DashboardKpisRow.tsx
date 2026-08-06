"use client";

import {
  Activity,
  Beef,
  CircleDollarSign,
  Info,
  Sprout,
  TrendingUp,
} from "lucide-react";
import { KpiCard } from "@/components/ui/kpi-card";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { formatCompactCurrency } from "@/components/finance/format";

interface DashboardKpisRowProps {
  /** REAL — active head count of the herd. */
  headCount: number;
  /** REAL — mini-summary by category, e.g.: "13 vacas · 9 bois". */
  categorySummary: string;
  /** Fat steer arroba quote (R$/@), or null when the quote is unavailable. */
  arrobaPrice: number | null;
  /** Change of the arroba quote (%), or null when the source has no history. */
  arrobaMonthlyChangePct: number | null;
  /** Provenance line under the quote (e.g. "cotação de 31/07/2026 · … Scot Consultoria"), or null when mock. */
  arrobaQuoteSub: string | null;
  /** REAL — herd average daily gain (kg/day) derived from weighings, or null. */
  averageAdg: number | null;
  /** REAL — aggregate herd stocking rate (AU/ha) derived from herd + invernadas. */
  stockingRate: number;
  /** Herd market value (R$), or null when the quote is unavailable. */
  herdValue: number | null;
}

/**
 * KPI row of the panel (5 cards, responsive grid): the daily numbers of a beef
 * cattle operation — head count, arroba quote, GMD, stocking rate and herd
 * value. All derived from the herd except the quote (illustrative until a real
 * quote source is plugged), flagged in the note below the row.
 */
export function DashboardKpisRow({
  headCount,
  categorySummary,
  arrobaPrice,
  arrobaMonthlyChangePct,
  arrobaQuoteSub,
  averageAdg,
  stockingRate,
  herdValue,
}: DashboardKpisRowProps) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      <KpiCard
        label="Rebanho ativo"
        value={
          <>
            {formatNumber(headCount, 0)}
            <span className="text-sm text-ink-soft"> cab</span>
          </>
        }
        sub={categorySummary}
        icon={Beef}
      />
      <KpiCard
        label="Cotação da arroba"
        value={
          arrobaPrice === null ? (
            "—"
          ) : (
            <>
              {formatNumber(arrobaPrice, 2)}
              <span className="text-sm text-ink-soft"> R$/@</span>
            </>
          )
        }
        delta={
          arrobaMonthlyChangePct === null
            ? undefined
            : {
                text: `${formatNumber(Math.abs(arrobaMonthlyChangePct), 1)}% no mês`,
                positive: arrobaMonthlyChangePct >= 0,
              }
        }
        sub={arrobaQuoteSub ?? "cotação indisponível"}
        icon={TrendingUp}
      />
      <KpiCard
        label="GMD Global"
        value={
          averageAdg === null ? (
            "—"
          ) : (
            <>
              {formatNumber(averageAdg, 2)}
              <span className="text-sm text-ink-soft"> kg/dia</span>
            </>
          )
        }
        sub="média do rebanho"
        icon={Activity}
      />
      <KpiCard
        label="Lotação"
        value={
          <>
            {formatNumber(stockingRate, 2)}
            <span className="text-sm text-ink-soft"> UA/ha</span>
          </>
        }
        sub="rebanho ativo · invernadas"
        icon={Sprout}
      />
      <KpiCard
        label="Valor do rebanho"
        value={herdValue === null ? "—" : formatCompactCurrency(herdValue)}
        sub={herdValue === null ? "cotação indisponível" : formatCurrency(herdValue)}
        icon={CircleDollarSign}
      />
    </div>
  );
}

/** Discreet footnote on the provenance of the row's figures. */
export function DashboardKpisNote({ quoteLive }: { quoteLive: boolean }) {
  return (
    <p className="flex items-center gap-1.5 text-xs text-ink-soft">
      <Info className="size-3.5 shrink-0" aria-hidden />
      {quoteLive
        ? "Cotação da arroba: boi gordo à vista Campo Grande-MS, Scot Consultoria. Demais indicadores derivados dos dados reais do rebanho."
        : "Cotação da arroba indisponível no momento — valores dependentes da @ mostram “—”. Demais indicadores derivados dos dados reais do rebanho."}
    </p>
  );
}
