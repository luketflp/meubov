"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Period } from "@/lib/domain/finance";
import { shiftPeriodByMonths } from "@/components/dashboard/period";

interface PeriodPickerProps {
  value: Period;
  onChange: (period: Period) => void;
}

const DATE_INPUT =
  "min-w-0 rounded-md bg-transparent px-1.5 py-1 font-mono text-xs text-ink tabular-nums outline-none transition-colors hover:bg-panel focus-visible:bg-panel [color-scheme:light]";

/**
 * Free date-range selector: two editable "dd/mm/aaaa" fields ("início até fim")
 * flanked by ‹ › buttons that shift the whole window one month back/forward. The
 * chosen window really filters the monthly revenue x cost series shown in the
 * panel. Start is clamped to ≤ end and end to ≥ start.
 */
export function PeriodPicker({ value, onChange }: PeriodPickerProps) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-hairline bg-surface p-0.5">
      <button
        type="button"
        aria-label="Recuar um mês"
        onClick={() => onChange(shiftPeriodByMonths(value, -1))}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-panel hover:text-ink md:size-7"
      >
        <ChevronLeft className="size-4" aria-hidden />
      </button>

      <input
        type="date"
        aria-label="Data inicial"
        value={value.start}
        max={value.end}
        onChange={(event) => {
          const start = event.target.value;
          if (start && start <= value.end) onChange({ ...value, start });
        }}
        className={DATE_INPUT}
      />
      <span className="px-0.5 text-xs text-ink-soft">até</span>
      <input
        type="date"
        aria-label="Data final"
        value={value.end}
        min={value.start}
        onChange={(event) => {
          const end = event.target.value;
          if (end && end >= value.start) onChange({ ...value, end });
        }}
        className={DATE_INPUT}
      />

      <button
        type="button"
        aria-label="Avançar um mês"
        onClick={() => onChange(shiftPeriodByMonths(value, 1))}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-panel hover:text-ink md:size-7"
      >
        <ChevronRight className="size-4" aria-hidden />
      </button>
    </div>
  );
}
