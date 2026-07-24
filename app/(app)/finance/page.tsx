"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { MarketNotice } from "@/components/finance/MarketNotice";
import { FinanceKpis } from "@/components/finance/FinanceKpis";
import { RevenueCostChart } from "@/components/finance/RevenueCostChart";
import { QuoteChart } from "@/components/finance/QuoteChart";
import { CostBreakdownChart } from "@/components/finance/CostBreakdownChart";
import { LivestockIndicators } from "@/components/finance/LivestockIndicators";
import { CategorySalesTable } from "@/components/finance/CategorySalesTable";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { activeAnimals } from "@/lib/store/selectors";
import { mockMarket } from "@/lib/data/market";
import { useArrobaQuote } from "@/lib/data/useArrobaQuote";
import { kgToArroba, totalWeightKg } from "@/lib/domain/weights";
import {
  capitalTurnover,
  grossMarginPerArroba,
  productivityArrobasPerHa,
  steerToCalfRatio,
  periodResult,
  offtakeRatePct,
  herdValue,
} from "@/lib/domain/finance";

export default function FinancePage() {
  const animals = useHerdStore((state) => state.animals);
  const lots = useHerdStore((state) => state.lots);

  const market = mockMarket;
  // Live arroba quote (Scot Consultoria) with mock fallback; drives every @-based figure.
  const quote = useArrobaQuote();
  const active = activeAnimals(animals);
  const totalArrobas = kgToArroba(totalWeightKg(active));
  const totalHerdValue = herdValue(totalArrobas, quote.price);
  const result = periodResult(
    market.monthlyRevenueCost.map((month) => month.revenue),
    market.monthlyRevenueCost.map((month) => month.cost)
  );
  const grossMarginArroba = grossMarginPerArroba(
    quote.price,
    market.productionCostPerArroba
  );
  const totalHectares = lots.reduce((sum, lot) => sum + lot.hectares, 0);
  const exchangeRatio = steerToCalfRatio(
    quote.price,
    market.averageArrobasPerSteer,
    market.averageCalfPrice
  );
  const offtakeRate = offtakeRatePct(market.headSoldPerYear, active.length);
  const productivity = productivityArrobasPerHa(market.arrobasProducedPerYear, totalHectares);
  const turnover = capitalTurnover(result.totalRevenue, totalHerdValue);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 md:px-8">
      <PageHeader title="Financeiro" subtitle="Indicadores da pecuária de corte" />

      <MarketNotice quoteLive={quote.live} quoteSourceLabel={quote.sourceLabel} />

      <FinanceKpis
        arrobaPrice={quote.price}
        monthlyChangePct={quote.changePct}
        totalHerdValue={totalHerdValue}
        totalArrobas={totalArrobas}
        result={result}
        costPerArroba={market.productionCostPerArroba}
        grossMarginArroba={grossMarginArroba}
      />

      <RevenueCostChart months={market.monthlyRevenueCost} />

      <div className="grid gap-4 lg:grid-cols-2">
        <QuoteChart series={quote.series} illustrative={!quote.seriesLive} />
        <CostBreakdownChart
          breakdown={market.costBreakdown}
          totalCost={result.totalCost}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <LivestockIndicators
          exchangeRatio={exchangeRatio}
          offtakeRate={offtakeRate}
          productivity={productivity}
          dailyCost={market.dailyCostPerHead}
          turnover={turnover}
        />
        <CategorySalesTable animals={active} arrobaPrice={quote.price} />
      </div>
    </div>
  );
}
