"use client";

import { CalendarDays } from "lucide-react";
import type { Treatment } from "@/lib/types";
import { TODAY_ISO, formatDate } from "@/lib/domain/dates";
import { deriveTreatmentStatus } from "@/lib/domain/status";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { TreatmentRow } from "@/components/calendar/TreatmentRow";
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
}

/** List of the shown month's treatments, grouped by day. */
export function MonthList({ yearMonth, treatments, onMarkDone }: MonthListProps) {
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
              <ul className="divide-y divide-hairline">
                {ofDay.map((t) => (
                  <TreatmentRow
                    key={t.id}
                    treatment={t}
                    status={deriveTreatmentStatus(t, TODAY_ISO)}
                    onMarkDone={onMarkDone}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
