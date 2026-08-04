"use client";

import { useMemo } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { MarketNotice } from "@/components/finance/MarketNotice";
import { FinanceKpis } from "@/components/finance/FinanceKpis";
import { RevenueCostChart } from "@/components/finance/RevenueCostChart";
import { QuoteChart } from "@/components/finance/QuoteChart";
import { CostBreakdownChart } from "@/components/finance/CostBreakdownChart";
import { LivestockIndicators } from "@/components/finance/LivestockIndicators";
import { CategorySalesTable } from "@/components/finance/CategorySalesTable";
import { ExpensesList } from "@/components/finance/ExpensesList";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { activeAnimals } from "@/lib/store/selectors";
import { useArrobaQuote } from "@/lib/data/useArrobaQuote";
import { todayISO } from "@/lib/domain/dates";
import { kgToArroba, totalWeightKg } from "@/lib/domain/weights";
import { herdValue, periodResult } from "@/lib/domain/finance";
import {
  annualRevenue,
  arrobasProducedPerYear,
  averageArrobasPerSteer,
  averageCalfPrice,
  capitalTurnoverRatio,
  costBreakdown,
  dailyCostPerHead,
  headSoldLast12m,
  monthlyRevenueCost,
  offtakeRate,
  productionCostPerArroba,
  productivityPerHa,
  steerToCalfExchange,
  totalCostLast12m,
} from "@/lib/domain/economics";

export default function FinancePage() {
  const animals = useHerdStore((state) => state.animals);
  const lots = useHerdStore((state) => state.lots);
  const movements = useHerdStore((state) => state.movements);
  const treatments = useHerdStore((state) => state.treatments);
  const expenses = useHerdStore((state) => state.expenses);

  // Live arroba quote (Scot + IPEADATA); null price = every @-figure shows "—".
  const quote = useArrobaQuote();
  const active = activeAnimals(animals);
  const totalArrobas = kgToArroba(totalWeightKg(active));
  const totalHerdValue =
    quote.price === null ? null : herdValue(totalArrobas, quote.price);

  // Real revenue × cost of the last 12 months, from the farm's records.
  const series = useMemo(
    () => monthlyRevenueCost(movements, treatments, expenses, 12, todayISO()),
    [movements, treatments, expenses]
  );
  const result = periodResult(
    series.map((month) => month.revenue),
    series.map((month) => month.cost)
  );
  const breakdown = useMemo(
    () => costBreakdown(expenses, treatments, 12, todayISO()),
    [expenses, treatments]
  );

  // Indicators — each null when the records can't support it yet.
  const totalCost12m = totalCostLast12m(expenses, treatments, todayISO());
  const revenue12m = annualRevenue(movements, todayISO());
  const headSold = headSoldLast12m(movements, todayISO());
  const steerArrobas = averageArrobasPerSteer(animals);
  const arrobasYear = arrobasProducedPerYear(movements, animals, todayISO());
  const costPerArroba = productionCostPerArroba(totalCost12m, arrobasYear);
  const grossMarginArroba =
    quote.price === null || costPerArroba === null
      ? null
      : quote.price - costPerArroba;
  const totalHectares = lots.reduce((sum, lot) => sum + lot.hectares, 0);
  const exchangeRatio = steerToCalfExchange(
    quote.price,
    steerArrobas,
    averageCalfPrice(movements, todayISO())
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 md:px-8">
      <PageHeader title="Financeiro" subtitle="Indicadores da pecuária de corte" />

      <MarketNotice
        quoteLive={quote.live}
        quoteSourceLabel={quote.sourceLabel}
        seriesSourceLabel={quote.seriesSourceLabel}
      />

      <FinanceKpis
        arrobaPrice={quote.price}
        monthlyChangePct={quote.changePct}
        totalHerdValue={totalHerdValue}
        totalArrobas={totalArrobas}
        result={result}
        costPerArroba={costPerArroba}
        grossMarginArroba={grossMarginArroba}
      />

      <RevenueCostChart months={series} />

      <div className="grid gap-4 lg:grid-cols-2">
        <QuoteChart series={quote.series} sourceLabel={quote.seriesSourceLabel} />
        <CostBreakdownChart breakdown={breakdown} totalCost={result.totalCost} />
      </div>

      <ExpensesList />

      <div className="grid gap-4 lg:grid-cols-2">
        <LivestockIndicators
          exchangeRatio={exchangeRatio}
          offtakeRate={offtakeRate(headSold, active.length)}
          productivity={productivityPerHa(arrobasYear, totalHectares)}
          dailyCost={dailyCostPerHead(totalCost12m, active.length)}
          turnover={capitalTurnoverRatio(revenue12m, totalHerdValue)}
        />
        <CategorySalesTable animals={active} arrobaPrice={quote.price} />
      </div>
    </div>
  );
}
