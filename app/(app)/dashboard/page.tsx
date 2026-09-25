"use client";

/**
 * Painel: what needs a hand today, lote by lote, then the farm's standing
 * questions — the herd and how it changed, the breeding season, the pastures,
 * the gain, the arroba and the period's money. Money needs Financeiro.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import { useCan } from "@/lib/store/usePermissions";
import {
  activeAnimals,
  countByCategory,
  herdStockingRateAuPerHa,
  invernadasWithSummary,
} from "@/lib/store/selectors";
import {
  adgChange,
  calvingCalendar,
  farmAgenda,
  herdFlow,
  lotsUpToDate,
  nextCalvings,
  seasonReproduction,
} from "@/lib/store/dashboard";
import { todayISO } from "@/lib/domain/dates";
import { herdAverageAdg, monthlyAdg } from "@/lib/domain/adg";
import { kgToArroba, totalWeightKg } from "@/lib/domain/weights";
import { classifyStockingRate } from "@/lib/domain/stocking";
import { filterMonthlyByPeriod, periodResult, type Period } from "@/lib/domain/finance";
import { costBreakdownBetween, monthlyRevenueCost } from "@/lib/domain/economics";
import { useArrobaQuote } from "@/lib/data/useArrobaQuote";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { PendingInviteBanner } from "@/components/invites/PendingInviteBanner";
import { RegisterManejoDialog } from "@/components/manejo/register-manejo-dialog";
import { FirstStepsBanner } from "@/components/dashboard/FirstStepsBanner";
import { FarmAgenda } from "@/components/dashboard/FarmAgenda";
import { OpenSessionsStack } from "@/components/dashboard/OpenSessionsStack";
import { HerdCard } from "@/components/dashboard/HerdCard";
import { HerdFlowCard } from "@/components/dashboard/HerdFlowCard";
import { ReproductionCard } from "@/components/dashboard/ReproductionCard";
import { PaddocksCard } from "@/components/dashboard/PaddocksCard";
import { AdgChart } from "@/components/dashboard/AdgChart";
import { MarketCard } from "@/components/dashboard/MarketCard";
import { FinanceCard } from "@/components/dashboard/FinanceCard";
import { PeriodPicker } from "@/components/dashboard/PeriodPicker";
import { defaultPeriod } from "@/lib/domain/period";
import { longDateLabel } from "@/components/dashboard/helpers";
import { cn } from "@/lib/utils";

const ADG_CHART_MONTHS = 6;

/**
 * Thin section divider with an uppercase heading, as in the herd screens. On
 * the phone its action (the period picker) takes a line of its own.
 */
function SectionDivider({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-2">
      <span className="font-heading text-sm font-semibold tracking-wide text-ink-soft uppercase">
        {title}
      </span>
      <span className="h-px min-w-8 flex-1 bg-hairline" aria-hidden />
      {action ? <div className="w-full sm:w-auto">{action}</div> : null}
    </div>
  );
}

export default function DashboardPage() {
  const animals = useHerdStore((s) => s.animals);
  const lots = useHerdStore((s) => s.lots);
  const invernadas = useHerdStore((s) => s.invernadas);
  const lotPlacements = useHerdStore((s) => s.lotPlacements);
  const treatments = useHerdStore((s) => s.treatments);
  const movements = useHerdStore((s) => s.movements);
  const expenses = useHerdStore((s) => s.expenses);
  const farm = useHerdStore((s) => s.farm);
  const completeTreatments = useHerdStore((s) => s.completeTreatments);
  // Without Financeiro the server sends no values: the money cards go instead of showing zeros.
  const seeMoney = useCan("finance", "view");
  const canCompleteTreatments = useCan("sanitary", "edit");
  const canStartManejo = useCan("manejo", "edit");
  const { addToast } = useToast();
  const today = todayISO();

  /** Closes one lote's batch; a failure already told the user through the store. */
  async function onComplete(treatmentIds: string[]) {
    try {
      await completeTreatments(treatmentIds);
      addToast({
        messageType: "success",
        text:
          treatmentIds.length === 1
            ? "Tratamento concluído"
            : `${treatmentIds.length} tratamentos concluídos`,
      });
    } catch {
      // apiFail has shown the error toast.
    }
  }

  const [period, setPeriod] = useState<Period>(() => defaultPeriod(today));
  const quote = useArrobaQuote();

  const active = useMemo(() => activeAnimals(animals), [animals]);
  const animalsByEarTag = useMemo(
    () => new Map(active.map((animal) => [animal.earTag, animal])),
    [active]
  );
  const agendaInput = useMemo(
    () => ({ animals, treatments, lots, invernadas, lotPlacements }),
    [animals, treatments, lots, invernadas, lotPlacements]
  );
  const agenda = useMemo(() => farmAgenda(agendaInput, today), [agendaInput, today]);
  const quietLots = useMemo(() => lotsUpToDate(agendaInput, agenda), [agendaInput, agenda]);

  const flow = useMemo(() => herdFlow(animals, movements, today), [animals, movements, today]);
  const byCategory = useMemo(() => countByCategory(active), [active]);
  const adgSeries = useMemo(() => monthlyAdg(active, ADG_CHART_MONTHS), [active]);
  const averageAdg = useMemo(() => herdAverageAdg(active, today), [active, today]);
  const stockingRate = useMemo(
    () => herdStockingRateAuPerHa(animals, invernadas),
    [animals, invernadas]
  );
  const totalKg = useMemo(() => totalWeightKg(active), [active]);

  const season = useMemo(() => seasonReproduction(animals, today), [animals, today]);
  const calvingMonths = useMemo(() => calvingCalendar(animals, today), [animals, today]);
  const upcomingCalvings = useMemo(() => nextCalvings(animals, today), [animals, today]);
  const paddocks = useMemo(
    () => invernadasWithSummary(invernadas, lots, lotPlacements, animals),
    [invernadas, lots, lotPlacements, animals]
  );

  const monthsInPeriod = useMemo(
    () =>
      filterMonthlyByPeriod(monthlyRevenueCost(movements, treatments, expenses, 12, today), period),
    [movements, treatments, expenses, today, period]
  );
  const financials = useMemo(
    () =>
      periodResult(
        monthsInPeriod.map((month) => month.revenue),
        monthsInPeriod.map((month) => month.cost)
      ),
    [monthsInPeriod]
  );
  const costSlices = useMemo(
    () => costBreakdownBetween(expenses, treatments, period.start, period.end),
    [expenses, treatments, period]
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        title="Painel"
        subtitle={[farm.name, farm.municipality, longDateLabel(today)]
          .filter((part) => part.trim() !== "")
          .join(" · ")}
        actions={
          <>
            <Button asChild variant="outline" className="min-h-11">
              <Link href="/calendar">
                <CalendarDays aria-hidden />
                Calendário sanitário
              </Link>
            </Button>
            {canStartManejo ? <RegisterManejoDialog /> : null}
          </>
        }
      />

      <PendingInviteBanner />

      <FirstStepsBanner />

      <OpenSessionsStack />

      <FarmAgenda
        lots={agenda}
        animalsByEarTag={animalsByEarTag}
        todayIso={today}
        quietLots={quietLots}
        onComplete={canCompleteTreatments ? onComplete : undefined}
      />

      {/* Side by side the two cards stretch to one height. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <HerdCard
          className="lg:col-span-5"
          headCount={active.length}
          change12m={flow.end - flow.start}
          byCategory={byCategory}
          averageAdg={averageAdg}
          adgChange={adgChange(adgSeries)}
          stockingRate={stockingRate}
          stockingClass={classifyStockingRate(stockingRate)}
          totalKg={totalKg}
          totalArrobas={kgToArroba(totalKg)}
        />
        <HerdFlowCard className="lg:col-span-7" flow={flow} />
      </div>

      <SectionDivider title="Reprodução e pastos" />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <ReproductionCard
            season={season}
            months={calvingMonths}
            next={upcomingCalvings}
            todayIso={today}
          />
        </div>
        <div className="lg:col-span-5">
          <PaddocksCard rows={paddocks} herdRate={stockingRate} />
        </div>
      </div>

      <SectionDivider title={seeMoney ? "Desempenho e mercado" : "Desempenho"} />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
        <div className={cn(seeMoney ? "lg:col-span-7" : "lg:col-span-12")}>
          <AdgChart series={adgSeries} change={adgChange(adgSeries)} />
        </div>
        {seeMoney ? (
          <div className="lg:col-span-5">
            <MarketCard quote={quote} totalArrobas={kgToArroba(totalKg)} />
          </div>
        ) : null}
      </div>

      {seeMoney ? (
        <>
          <SectionDivider
            title="Financeiro"
            action={<PeriodPicker value={period} onChange={setPeriod} />}
          />
          <FinanceCard result={financials} breakdown={costSlices} months={monthsInPeriod} />
        </>
      ) : null}
    </div>
  );
}
