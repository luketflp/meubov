"use client";

/**
 * Financeiro: the owner's cockpit for the window in the URL (?de&ate) — caixa,
 * the eight indicators against their references and the year before, receita
 * × custo, mercado, composição, contas, custo por lote and the newest
 * lançamentos. Every figure follows the window.
 */
import { Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { useArrobaQuote } from "@/lib/data/useArrobaQuote";
import { parseISODate, todayISO } from "@/lib/domain/dates";
import { inPeriod, periodFromSearch, periodSearch, priorPeriod, type Period } from "@/lib/domain/period";
import {
  costBreakdownBetween,
  indicatorDeltas,
  indicators,
  monthlyRevenueCost,
  type EconomicsInputs,
} from "@/lib/domain/economics";
import { cashSummary, ledgerRows, pendingBills } from "@/lib/domain/ledger";
import { lotEconomics } from "@/lib/domain/lotEconomics";
import { RequireAccess } from "@/components/layout/RequireAccess";
import { FinanceHeader } from "@/components/finance/FinanceHeader";
import { CashStrip } from "@/components/finance/CashStrip";
import { Placar } from "@/components/finance/Placar";
import { RevenueCostChart } from "@/components/finance/RevenueCostChart";
import { MarketPanel } from "@/components/finance/MarketPanel";
import { CostBreakdownCard } from "@/components/finance/CostBreakdownCard";
import { BillsCard } from "@/components/finance/BillsCard";
import { LotsEconomicsCard } from "@/components/finance/LotsEconomicsCard";
import { RecentEntriesCard } from "@/components/finance/RecentEntriesCard";

/**
 * Opened by URL without Financeiro, the page is the "Porteira fechada" of
 * NoAccess. The window lives in the URL query, which useSearchParams reads
 * inside a Suspense boundary.
 */
export default function FinancePage() {
  return (
    <RequireAccess area="finance" level="view">
      <Suspense fallback={null}>
        <FinanceContent />
      </Suspense>
    </RequireAccess>
  );
}

/** Calendar months from the window's first month through its last, inclusive. */
function monthsSpanned(period: Period): number {
  const start = parseISODate(period.start);
  const end = parseISODate(period.end);
  return Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth() + 1);
}

function FinanceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canEdit = useCan("finance", "edit");
  const animals = useHerdStore((s) => s.animals);
  const manejoSessions = useHerdStore((s) => s.manejoSessions);
  const movements = useHerdStore((s) => s.movements);
  const treatments = useHerdStore((s) => s.treatments);
  const expenses = useHerdStore((s) => s.expenses);
  const invernadas = useHerdStore((s) => s.invernadas);
  const lots = useHerdStore((s) => s.lots);
  const accounts = useHerdStore((s) => s.accounts);
  // Live arroba quote; null price = every @-figure shows "—".
  const quote = useArrobaQuote();
  const today = todayISO();

  const period = useMemo(() => periodFromSearch(searchParams, today), [searchParams, today]);
  const setPeriod = (next: Period) =>
    router.replace(`/finance?${periodSearch(next)}`, { scroll: false });

  const inputs = useMemo<EconomicsInputs>(
    () => ({ animals, manejoSessions, movements, treatments, expenses, invernadas, lots }),
    [animals, manejoSessions, movements, treatments, expenses, invernadas, lots]
  );
  const ind = useMemo(
    () => indicators(inputs, period, quote.price, today),
    [inputs, period, quote.price, today]
  );
  const prior = useMemo(
    () => indicators(inputs, priorPeriod(period), quote.price, today),
    [inputs, period, quote.price, today]
  );
  const deltas = useMemo(() => indicatorDeltas(ind, prior), [ind, prior]);
  const cash = useMemo(
    () => cashSummary({ expenses, movements, treatments }, period, today),
    [expenses, movements, treatments, period, today]
  );
  const rows = useMemo(
    () => ledgerRows({ ...inputs, accounts }, period, today),
    [inputs, accounts, period, today]
  );
  const lotEcon = useMemo(
    () => lotEconomics(inputs, period, quote.price, today),
    [inputs, period, quote.price, today]
  );
  // Records filtered to the window first, so the legend totals equal ind.revenue and ind.coe.
  const series = useMemo(
    () =>
      monthlyRevenueCost(
        movements.filter((m) => inPeriod(m.date, period)),
        treatments.filter((t) => inPeriod(t.date, period)),
        expenses.filter((e) => inPeriod(e.date, period)),
        monthsSpanned(period),
        period.end
      ),
    [movements, treatments, expenses, period]
  );
  const breakdown = useMemo(
    () => costBreakdownBetween(expenses, treatments, period.start, period.end),
    [expenses, treatments, period]
  );
  const bills = useMemo(() => pendingBills(expenses, today), [expenses, today]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 md:px-8">
      <FinanceHeader
        period={period}
        onPeriodChange={setPeriod}
        canEdit={canEdit}
        ind={ind}
        prior={prior}
        lots={lotEcon.lots}
        farm={lotEcon.farm}
      />

      <CashStrip cash={cash} />

      <Placar ind={ind} deltas={deltas} quote={quote.price} />

      {/* Desktop reads in rows; the phone reorders to chart, composição, contas, lançamentos, lotes, mercado. */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
        <div className="order-1 lg:col-span-7">
          <RevenueCostChart months={series} />
        </div>
        <div className="order-6 lg:order-2 lg:col-span-5">
          <MarketPanel quote={quote} ind={ind} />
        </div>
        <div className="order-2 lg:order-3 lg:col-span-6">
          <CostBreakdownCard
            breakdown={breakdown}
            expenses={expenses}
            treatments={treatments}
            accounts={accounts}
            period={period}
          />
        </div>
        <div className="order-3 lg:order-4 lg:col-span-6">
          <BillsCard payables={bills.payables} receivables={bills.receivables} canEdit={canEdit} />
        </div>
        <div className="order-5 lg:col-span-12">
          <LotsEconomicsCard lots={lotEcon.lots} farm={lotEcon.farm} quote={quote.price} />
        </div>
        <div className="order-4 lg:order-6 lg:col-span-12">
          <RecentEntriesCard rows={rows} period={period} />
        </div>
      </div>
    </div>
  );
}
