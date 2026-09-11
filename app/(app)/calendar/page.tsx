"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Treatment } from "@/lib/types";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import { treatmentsInMonth, pendingTreatments, treatmentBatchSize } from "@/lib/store/selectors";
import { deriveTreatmentStatus, isFootAndMouth } from "@/lib/domain/status";
import { todayISO, formatDate } from "@/lib/domain/dates";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { FootAndMouthBanner } from "@/components/calendar/FootAndMouthBanner";
import { DayDialog } from "@/components/calendar/DayDialog";
import { MonthlyGrid } from "@/components/calendar/MonthlyGrid";
import { MonthList } from "@/components/calendar/MonthList";
import { OverdueSection } from "@/components/calendar/OverdueSection";
import { HealthProtocols } from "@/components/calendar/HealthProtocols";
import { cn } from "@/lib/utils";
import {
  yearMonthOf,
  previousMonth,
  nextFootAndMouthCampaign,
  nextMonth,
  monthLabel,
  type YearMonth,
} from "@/components/calendar/helpers";

interface CalendarPageProps {
  searchParams: Promise<{ tab?: string | string[] }>;
}

/** Warns that a delete also erases an application already on the record. */
function alreadyAppliedWarning(treatment: Treatment): string {
  return deriveTreatmentStatus(treatment, todayISO()) === "done"
    ? " Ele já foi aplicado: o histórico dos animais perde esse registro."
    : "";
}

export default function CalendarPage({ searchParams }: CalendarPageProps) {
  const query = use(searchParams);
  const activeTab = query.tab === "protocolos" ? "protocolos" : "agenda";
  const treatments = useHerdStore((s) => s.treatments);
  const protocols = useHerdStore((s) => s.protocols);
  const markTreatmentDone = useHerdStore((s) => s.markTreatmentDone);
  const deleteTreatment = useHerdStore((s) => s.deleteTreatment);
  const { addToast } = useToast();

  /** Completes one treatment and confirms it with a toast. */
  async function onMarkDone(id: string) {
    await markTreatmentDone(id);
    addToast({ messageType: "success", text: "Tratamento concluído" });
  }

  /** Deletes one animal's treatment, leaving the rest of the agendamento. */
  async function onDelete(treatment: Treatment) {
    const question = `Excluir ${treatment.name} de ${formatDate(treatment.date)} do animal ${treatment.animalEarTag}?`;
    if (!window.confirm(`${question}${alreadyAppliedWarning(treatment)}`)) return;

    await deleteTreatment(treatment.id, "one");
    addToast({ messageType: "success", text: "Tratamento excluído" });
  }

  /**
   * Deletes the whole agendamento. One action books the same treatment for many
   * animals, so the confirmation says how many fall with it.
   */
  async function onDeleteGroup(treatment: Treatment) {
    const heads = treatmentBatchSize(treatments, treatment);
    const question = `Excluir ${treatment.name} de ${formatDate(treatment.date)}?`;
    const scope =
      heads === 1
        ? " Isso remove o tratamento de 1 animal."
        : ` Isso remove o tratamento de ${heads} animais.`;
    if (!window.confirm(`${question}${scope}${alreadyAppliedWarning(treatment)}`)) return;

    const removed = await deleteTreatment(treatment.id, "batch");
    addToast({
      messageType: "success",
      text:
        removed === 1
          ? "Tratamento excluído"
          : `Tratamento excluído para ${removed} animais`,
    });
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
        subtitle={
          activeTab === "agenda"
            ? "Vacinas, vermifugações e manejos do rebanho"
            : "Regras sanitárias usadas para organizar os agendamentos"
        }
        actions={
          activeTab === "agenda" ? (
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
          ) : undefined
        }
      />

      <nav
        aria-label="Seções do calendário sanitário"
        className="flex gap-1 border-b border-hairline"
      >
        <Link
          href="/calendar"
          scroll={false}
          aria-current={activeTab === "agenda" ? "page" : undefined}
          className={cn(
            "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            activeTab === "agenda"
              ? "border-brand text-brand"
              : "border-transparent text-ink-soft hover:text-ink"
          )}
        >
          Agenda
        </Link>
        <Link
          href="/calendar?tab=protocolos"
          scroll={false}
          aria-current={activeTab === "protocolos" ? "page" : undefined}
          className={cn(
            "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            activeTab === "protocolos"
              ? "border-brand text-brand"
              : "border-transparent text-ink-soft hover:text-ink"
          )}
        >
          Protocolos
        </Link>
      </nav>

      {activeTab === "agenda" ? (
        <>
          <OverdueSection
            overdue={overdue}
            onMarkDone={onMarkDone}
            onDelete={onDelete}
            onDeleteGroup={onDeleteGroup}
          />

          {showBanner ? <FootAndMouthBanner /> : null}

          <MonthlyGrid
            yearMonth={yearMonth}
            monthTreatments={ofMonth}
            todayIso={todayISO()}
            onOpenDay={setOpenDay}
          />

          <MonthList
            yearMonth={yearMonth}
            treatments={ofMonth}
            onMarkDone={onMarkDone}
            onDelete={onDelete}
            onDeleteGroup={onDeleteGroup}
          />

          <DayDialog
            iso={openDay}
            treatments={ofOpenDay}
            onClose={() => setOpenDay(null)}
            onMarkDone={onMarkDone}
            onDelete={onDelete}
            onDeleteGroup={onDeleteGroup}
          />
        </>
      ) : (
        <HealthProtocols />
      )}
    </div>
  );
}
