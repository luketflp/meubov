"use client";

import { CalendarDays } from "lucide-react";
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

/** List of the shown month's treatments, grouped by day. */
export function MonthList({
  yearMonth,
  treatments,
  onMarkDone,
  onDelete,
  onDeleteGroup,
}: MonthListProps) {
  const groups = groupByDay(treatments);

  return (
    <SectionCard title={`Tratamentos de ${monthLabel(yearMonth)}`}>
      {groups.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Nenhum tratamento neste mês"
          description={`Nada agendado ou registrado para ${monthLabel(yearMonth)}.`}
        />
      ) : (
        <div className="space-y-4">
          {groups.map(([date, ofDay]) => (
            <div key={date}>
              <h3 className="flex items-baseline gap-2 border-b border-hairline pb-1.5">
                <span className="font-mono text-sm font-medium text-ink">
                  {formatDate(date)}
                </span>
                <span className="text-xs text-ink-soft">{weekdayName(date)}</span>
              </h3>
              <TreatmentGroupList
                treatments={ofDay}
                onMarkDone={onMarkDone}
                onDelete={onDelete}
                onDeleteGroup={onDeleteGroup}
              />
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
