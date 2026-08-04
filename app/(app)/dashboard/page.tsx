"use client";

import { useMemo, useState } from "react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import {
  activeAnimals,
  animalsNeedingAttention,
  countByCategory,
  herdStockingRateAuPerHa,
  pendingTreatments,
} from "@/lib/store/selectors";
import { todayISO } from "@/lib/domain/dates";
import { monthlyAdg, herdAverageAdg } from "@/lib/domain/adg";
import { kgToArroba, totalWeightKg } from "@/lib/domain/weights";
import {
  filterMonthlyByPeriod,
  herdValue as computeHerdValue,
  periodResult,
  type Period,
} from "@/lib/domain/finance";
import { deriveTreatmentStatus } from "@/lib/domain/status";
import { costBreakdownBetween, monthlyRevenueCost } from "@/lib/domain/economics";
import { useArrobaQuote } from "@/lib/data/useArrobaQuote";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  DashboardKpisRow,
  DashboardKpisNote,
} from "@/components/dashboard/DashboardKpisRow";
import { ExpensesCard } from "@/components/dashboard/ExpensesCard";
import { PeriodResultCard } from "@/components/dashboard/PeriodResultCard";
import { PeriodPicker } from "@/components/dashboard/PeriodPicker";
import { defaultPeriod } from "@/components/dashboard/period";
import { summaryByCategory } from "@/components/dashboard/helpers";
import { AdgChart } from "@/components/dashboard/AdgChart";
import { AnimalsNeedingAttention } from "@/components/dashboard/AnimalsNeedingAttention";
import { OpenManejoSessions } from "@/components/manejo/open-sessions";
import {
  UpcomingTreatments,
  type PendingTreatmentItem,
} from "@/components/dashboard/UpcomingTreatments";

const ADG_CHART_MONTHS = 6;

/** Thin section divider with an uppercase heading, as in the herd screens. */
function SectionDivider({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <span className="font-heading text-sm font-semibold tracking-wide text-ink-soft uppercase">
        {title}
      </span>
      <span className="h-px flex-1 bg-hairline" aria-hidden />
      {action}
    </div>
  );
}

export default function DashboardPage() {
  const animals = useHerdStore((s) => s.animals);
  const lots = useHerdStore((s) => s.lots);
  const treatments = useHerdStore((s) => s.treatments);
  const movements = useHerdStore((s) => s.movements);
  const expenses = useHerdStore((s) => s.expenses);
  const farm = useHerdStore((s) => s.farm);
  const markTreatmentDone = useHerdStore((s) => s.markTreatmentDone);
  const { addToast } = useToast();

  /** Completes one treatment and confirms it with a toast. */
  async function onCompleteTreatment(id: string) {
    await markTreatmentDone(id);
    addToast({ messageType: "success", text: "Tratamento concluído" });
  }

  const [period, setPeriod] = useState<Period>(() => defaultPeriod(todayISO()));

  // Live arroba quote (IPEADATA), with mock fallback while loading/offline.
  const quote = useArrobaQuote();

  const active = useMemo(() => activeAnimals(animals), [animals]);

  // REAL KPIs derived from the herd.
  const categorySummary = useMemo(() => summaryByCategory(countByCategory(active)), [active]);
  const averageAdg = useMemo(() => herdAverageAdg(active, todayISO()), [active]);
  const stockingRate = useMemo(
    () => herdStockingRateAuPerHa(animals, lots),
    [animals, lots]
  );
  const herdValue = useMemo(() => {
    if (quote.price === null) return null;
    const totalArrobas = kgToArroba(totalWeightKg(active));
    return computeHerdValue(totalArrobas, quote.price);
  }, [active, quote.price]);

  // Real revenue × cost series from the farm's records; the period picker
  // filters it before consolidating.
  const datedSeries = useMemo(
    () => monthlyRevenueCost(movements, treatments, expenses, 12, todayISO()),
    [movements, treatments, expenses]
  );
  const financials = useMemo(() => {
    const inPeriod = filterMonthlyByPeriod(datedSeries, period);
    return periodResult(
      inPeriod.map((m) => m.revenue),
      inPeriod.map((m) => m.cost)
    );
  }, [datedSeries, period]);
  const periodBreakdown = useMemo(
    () => costBreakdownBetween(expenses, treatments, period.start, period.end),
    [expenses, treatments, period]
  );

  // Daily management: what needs action today comes first on the screen.
  const needingAttention = useMemo(
    () => animalsNeedingAttention(active, treatments, todayISO()),
    [active, treatments]
  );
  const pending = useMemo<PendingTreatmentItem[]>(
    () =>
      pendingTreatments(treatments, todayISO()).map((treatment) => ({
        treatment,
        status: deriveTreatmentStatus(treatment, todayISO()),
      })),
    [treatments]
  );
  const adgSeries = useMemo(() => monthlyAdg(active, ADG_CHART_MONTHS), [active]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8 md:py-8">
      <PageHeader title="Painel" subtitle={`${farm.name} · ${farm.municipality}`} />

      <div className="space-y-2">
        <DashboardKpisRow
          headCount={active.length}
          categorySummary={categorySummary}
          arrobaPrice={quote.price}
          arrobaMonthlyChangePct={quote.changePct}
          arrobaQuoteSub={quote.sourceLabel}
          averageAdg={averageAdg}
          stockingRate={stockingRate}
          herdValue={herdValue}
        />
        <DashboardKpisNote quoteLive={quote.live} />
      </div>

      <SectionDivider title="Manejo do rebanho" />

      <OpenManejoSessions />

      <div className="grid items-start gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <AnimalsNeedingAttention items={needingAttention} />
        </div>
        <div className="lg:col-span-2">
          <UpcomingTreatments items={pending} onComplete={onCompleteTreatment} />
        </div>
      </div>

      <SectionDivider title="Desempenho" />

      <AdgChart series={adgSeries} />

      <SectionDivider
        title="Financeiro do período"
        action={<PeriodPicker value={period} onChange={setPeriod} />}
      />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <PeriodResultCard result={financials} />
        <ExpensesCard breakdown={periodBreakdown} totalCost={financials.totalCost} />
      </div>
    </div>
  );
}
