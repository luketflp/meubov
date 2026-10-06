"use client";

import { CalendarDays, CheckCircle2 } from "lucide-react";
import type { Treatment } from "@/lib/types";
import { formatDate } from "@/lib/domain/dates";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { TreatmentGroupList } from "@/components/calendar/TreatmentGroupList";
import {
  groupByDay,
  weekdayName,
  monthLabel,
  type YearMonth,
} from "@/components/calendar/helpers";

interface MonthListProps {
  yearMonth: YearMonth;
  treatments: Treatment[];
  onMarkDone: (id: string) => void;
  onDelete: (treatment: Treatment) => void;
  onDeleteGroup: (treatment: Treatment) => void;
}

/**
 * List of the shown month's treatments, grouped by day: what is still to do
 * first, and the ones already done after it under "Feitos".
 */
export function MonthList({
  yearMonth,
  treatments,
  onMarkDone,
  onDelete,
  onDeleteGroup,
}: MonthListProps) {
  const toDo = treatments.filter((t) => t.status !== "done");
  const done = treatments.filter((t) => t.status === "done");

  function days(list: Treatment[]) {
    return groupByDay(list).map(([date, ofDay]) => (
      <div key={date}>
        <h3 className="flex items-baseline gap-2 border-b border-hairline pb-1.5">
          <span className="font-mono text-sm font-medium text-ink">{formatDate(date)}</span>
          <span className="text-xs text-ink-soft">{weekdayName(date)}</span>
        </h3>
        <TreatmentGroupList
          treatments={ofDay}
          onMarkDone={onMarkDone}
          onDelete={onDelete}
          onDeleteGroup={onDeleteGroup}
        />
      </div>
    ));
  }

  return (
    <SectionCard title={`Tratamentos de ${monthLabel(yearMonth)}`}>
      {treatments.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Nenhum tratamento neste mês"
          description={`Nada agendado ou registrado para ${monthLabel(yearMonth)}.`}
        />
      ) : (
        <div className="space-y-4">
          {days(toDo)}
          {done.length > 0 ? (
            <section aria-label="Feitos" className="space-y-4 pt-2">
              <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-ink-soft uppercase">
                <CheckCircle2 className="size-3.5" aria-hidden />
                Feitos
              </p>
              {days(done)}
            </section>
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}
