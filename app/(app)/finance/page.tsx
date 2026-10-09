"use client";

/**
 * Financeiro: the owner's cockpit for the window in the URL (?de&ate) — caixa,
 * capital, dívidas e sócios, the current safra's orçamento, the eight
 * indicators against their references and the year before, receita × custo,
 * mercado, composição, contas, custo por lote and the newest lançamentos.
 * Every figure follows the window but the orçamento, which follows the safra.
 */
import { Suspense, useEffect, useMemo } from "react";
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
import { capitalSummary } from "@/lib/domain/planTree";
import { budgetView, safraOf } from "@/lib/domain/budget";
import { RequireAccess } from "@/components/layout/RequireAccess";
import { FinanceHeader } from "@/components/finance/FinanceHeader";
import { FinanceSubnav } from "@/components/finance/FinanceSubnav";
import { CashStrip } from "@/components/finance/CashStrip";
import { CapitalStrip } from "@/components/finance/CapitalStrip";
import { BudgetBand } from "@/components/finance/BudgetBand";
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
  const expenses = useHerdStore((s) => s.expenses);
  const invernadas = useHerdStore((s) => s.invernadas);
  const lots = useHerdStore((s) => s.lots);
  const accounts = useHerdStore((s) => s.accounts);
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
  const transfers = useHerdStore((s) => s.transfers);
  const planGroups = useHerdStore((s) => s.planGroups);
  // An offline snapshot from before the orçamento has no início da safra.
  const safraStartMonth = useHerdStore((s) => s.farm.safraStartMonth ?? 10);
  const loadBudgets = useHerdStore((s) => s.loadBudgets);
  // Live arroba quote; null price = every @-figure shows "—".
  const quote = useArrobaQuote();
  const today = todayISO();

  const period = useMemo(() => periodFromSearch(searchParams, today), [searchParams, today]);
  const setPeriod = (next: Period) =>
    router.replace(`/finance?${periodSearch(next)}`, { scroll: false });

  const inputs = useMemo<EconomicsInputs>(
    () => ({ animals, manejoSessions, movements, expenses, invernadas, lots }),
    [animals, manejoSessions, movements, expenses, invernadas, lots]
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
    () => cashSummary({ expenses, movements }, period, today),
    [expenses, movements, period, today]
  );
  const rows = useMemo(
    () => ledgerRows({ ...inputs, accounts, planGroups }, period, today),
    [inputs, accounts, planGroups, period, today]
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
        expenses.filter((e) => inPeriod(e.date, period)),
        monthsSpanned(period),
        period.end
      ),
    [movements, expenses, period]
  );
  const breakdown = useMemo(
    () => costBreakdownBetween(expenses, period.start, period.end),
    [expenses, period]
  );
  const bills = useMemo(() => pendingBills(expenses, today), [expenses, today]);
  const capital = useMemo(
    () => capitalSummary({ ...inputs, accounts, bankAccounts, transfers, planGroups }, period, today),
    [inputs, accounts, bankAccounts, transfers, planGroups, period, today]
  );
  // The band reads the current safra's orçamento, loaded on demand (never every safra with the herd).
  const safra = safraOf(today, safraStartMonth);
  const budgets = useHerdStore((s) => s.budgets[safra]);
  const budgetsMissing = budgets === undefined;
  useEffect(() => {
    // Whenever absent (the store empties the cache on a farm switch and a new início da safra).
    // A failed load leaves the band hidden: the store toasts why, or nothing without signal.
    if (budgetsMissing) loadBudgets(safra).catch(() => {});
  }, [budgetsMissing, safra, loadBudgets]);
  const budget = useMemo(
    () =>
      budgets
        ? budgetView({ budgets, expenses, accounts, planGroups }, safra, safraStartMonth, today)
        : null,
    [budgets, expenses, accounts, planGroups, safra, safraStartMonth, today]
  );

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

      <FinanceSubnav current="painel" period={period} />

      <CashStrip cash={cash} />

      <CapitalStrip summary={capital} period={period} resultBrl={ind.result} />

      <BudgetBand view={budget} period={period} />

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
