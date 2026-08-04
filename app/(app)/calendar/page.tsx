"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import { treatmentsInMonth, pendingTreatments } from "@/lib/store/selectors";
import { deriveTreatmentStatus, isFootAndMouth } from "@/lib/domain/status";
import { todayISO } from "@/lib/domain/dates";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { FootAndMouthBanner } from "@/components/calendar/FootAndMouthBanner";
import { DayDialog } from "@/components/calendar/DayDialog";
import { MonthlyGrid } from "@/components/calendar/MonthlyGrid";
import { MonthList } from "@/components/calendar/MonthList";
import { OverdueSection } from "@/components/calendar/OverdueSection";
import {
  yearMonthOf,
  previousMonth,
  nextFootAndMouthCampaign,
  nextMonth,
  monthLabel,
  type YearMonth,
} from "@/components/calendar/helpers";

export default function CalendarPage() {
  const treatments = useHerdStore((s) => s.treatments);
  const protocols = useHerdStore((s) => s.protocols);
  const markTreatmentDone = useHerdStore((s) => s.markTreatmentDone);
  const { addToast } = useToast();

  /** Completes one treatment and confirms it with a toast. */
  async function onMarkDone(id: string) {
    await markTreatmentDone(id);
    addToast({ messageType: "success", text: "Tratamento concluído" });
  }

  const [yearMonth, setYearMonth] = useState<YearMonth>(() => yearMonthOf(todayISO()));
  const [openDay, setOpenDay] = useState<string | null>(null);

  const ofMonth = useMemo(
    () => treatmentsInMonth(treatments, yearMonth.year, yearMonth.month),
    [treatments, yearMonth.year, yearMonth.month]
  );
  const overdue = useMemo(
    () =>
      pendingTreatments(treatments, todayISO()).filter(
        (t) => deriveTreatmentStatus(t, todayISO()) === "overdue"
      ),
    [treatments]
  );
  const campaign = useMemo(
    () => nextFootAndMouthCampaign(treatments, protocols),
    [treatments, protocols]
  );

  const showBanner =
    ofMonth.some(isFootAndMouth) ||
    (campaign !== null && campaign.year === yearMonth.year && campaign.month === yearMonth.month);
  const ofOpenDay = openDay === null ? [] : ofMonth.filter((t) => t.date === openDay);

  const navigateTo = (destination: YearMonth): void => {
    setOpenDay(null);
    setYearMonth(destination);
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-6 md:px-8">
      <PageHeader
        title="Calendário Sanitário"
        subtitle="Vacinas, vermifugações e manejos do rebanho"
        actions={
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              aria-label="Mês anterior"
              className="size-11 md:size-8"
              onClick={() => navigateTo(previousMonth(yearMonth))}
            >
              <ChevronLeft />
            </Button>
            <span className="min-w-40 text-center font-heading text-base font-semibold text-ink">
              {monthLabel(yearMonth)}
            </span>
            <Button
              variant="outline"
              size="icon"
              aria-label="Próximo mês"
              className="size-11 md:size-8"
              onClick={() => navigateTo(nextMonth(yearMonth))}
            >
              <ChevronRight />
            </Button>
            <Button
              variant="outline"
              className="ml-1 min-h-11 md:min-h-0"
              onClick={() => navigateTo(yearMonthOf(todayISO()))}
            >
              Hoje
            </Button>
          </div>
        }
      />

      <OverdueSection overdue={overdue} onMarkDone={onMarkDone} />

      {showBanner ? <FootAndMouthBanner /> : null}

      <MonthlyGrid
        yearMonth={yearMonth}
        monthTreatments={ofMonth}
        todayIso={todayISO()}
        onOpenDay={setOpenDay}
      />

      <MonthList yearMonth={yearMonth} treatments={ofMonth} onMarkDone={onMarkDone} />

      <DayDialog
        iso={openDay}
        treatments={ofOpenDay}
        onClose={() => setOpenDay(null)}
        onMarkDone={onMarkDone}
      />
    </div>
  );
}
