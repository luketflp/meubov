"use client";

import { useMemo } from "react";
import type { Treatment } from "@/lib/types";
import { formatDate } from "@/lib/domain/dates";
import { cn } from "@/lib/utils";
import { StatusDot } from "@/components/ui/status-dot";
import {
  WEEK_HEADER,
  groupByDay,
  dayChips,
  weeksOfMonth,
  type DayChip,
  type CalendarDay,
  type YearMonth,
} from "@/components/calendar/helpers";

/** Maximum of chips shown per cell before the "+N". */
const MAX_CHIPS = 3;

function chipClasses(chip: DayChip): string {
  if (chip.footAndMouth) {
    return cn(
      chip.status === "overdue" ? "bg-fmd text-panel" : "bg-fmd-soft text-fmd",
      chip.status === "done" && "line-through"
    );
  }
  if (chip.status === "overdue") return "bg-overdue text-panel";
  if (chip.status === "done") return "bg-healthy-soft text-healthy line-through";
  return "bg-scheduled-soft text-scheduled";
}

interface DayCellProps {
  day: CalendarDay;
  treatments: Treatment[];
  todayIso: string;
  onOpenDay: (iso: string) => void;
}

function DayCell({ day, treatments, todayIso, onOpenDay }: DayCellProps) {
  if (!day.inMonth) {
    return <div aria-hidden className="min-h-14 bg-surface md:min-h-24" />;
  }

  const isToday = day.iso === todayIso;
  const chips = dayChips(treatments, todayIso);
  const visible = chips.slice(0, MAX_CHIPS);
  const hidden = treatments.length - visible.reduce((sum, c) => sum + c.quantity, 0);

  const number = (
    <span
      className={cn(
        "font-mono text-xs",
        isToday
          ? "flex size-5 items-center justify-center rounded-full bg-brand font-semibold text-panel"
          : "text-ink-soft"
      )}
    >
      {day.day}
    </span>
  );

  const cellClasses = cn(
    "flex min-h-14 flex-col items-start gap-1 p-1.5 text-left md:min-h-24 md:p-2",
    isToday && "ring-2 ring-brand ring-inset"
  );

  if (treatments.length === 0) {
    return <div className={cellClasses}>{number}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => onOpenDay(day.iso)}
      aria-label={`Ver tratamentos de ${formatDate(day.iso)}`}
      className={cn(cellClasses, "w-full cursor-pointer transition-colors hover:bg-surface")}
    >
      {number}
      <span className="hidden w-full flex-col gap-1 md:flex">
        {visible.map((chip) => (
          <span
            key={chip.key}
            className={cn(
              "w-full truncate rounded px-1.5 py-0.5 text-[10px] font-medium",
              chipClasses(chip)
            )}
          >
            {chip.quantity} {chip.label}
          </span>
        ))}
        {hidden > 0 ? (
          <span className="w-fit rounded bg-surface px-1.5 py-0.5 text-[10px] font-medium text-ink-soft">
            +{hidden}
          </span>
        ) : null}
      </span>
      <span className="flex flex-wrap gap-1 md:hidden">
        {visible.map((chip) => (
          <StatusDot key={chip.key} status={chip.footAndMouth ? "fmd" : chip.status} />
        ))}
        {hidden > 0 ? (
          <span className="text-[10px] font-medium text-ink-soft">+{hidden}</span>
        ) : null}
      </span>
    </button>
  );
}

interface MonthlyGridProps {
  yearMonth: YearMonth;
  monthTreatments: Treatment[];
  todayIso: string;
  onOpenDay: (iso: string) => void;
}

/** Monthly grid Mon–Sun; on mobile the chips collapse into coloured dots. */
export function MonthlyGrid({ yearMonth, monthTreatments, todayIso, onOpenDay }: MonthlyGridProps) {
  const weeks = useMemo(() => weeksOfMonth(yearMonth), [yearMonth]);
  const byDay = useMemo(() => new Map(groupByDay(monthTreatments)), [monthTreatments]);

  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-panel">
      <div className="grid grid-cols-7 divide-x divide-hairline border-b border-hairline bg-surface text-center">
        {WEEK_HEADER.map((label) => (
          <div key={label} className="py-2 text-[11px] font-medium text-ink-soft">
            {label}
          </div>
        ))}
      </div>
      <div className="divide-y divide-hairline">
        {weeks.map((week) => (
          <div key={week[0].iso} className="grid grid-cols-7 divide-x divide-hairline">
            {week.map((day) => (
              <DayCell
                key={day.iso}
                day={day}
                treatments={byDay.get(day.iso) ?? []}
                todayIso={todayIso}
                onOpenDay={onOpenDay}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
