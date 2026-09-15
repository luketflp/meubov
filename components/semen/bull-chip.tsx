"use client";

/**
 * One semen bull as a chip to pick: its name and the doses it has left, amber
 * at the Touros tab's low-stock mark, "sem doses" when none. The brete picks
 * the bull of the cow in it on one; "Iniciar inseminação" picks the touros of
 * the morning on many.
 */
import { Check } from "lucide-react";
import type { SemenBull } from "@/lib/types";
import { LOW_STOCK_DOSES, MonoDoses } from "@/components/semen/stock-pill";
import { cn } from "@/lib/utils";

/** The grid the chips sit in: two columns on a phone, a wrapping row above. */
export const BULL_CHIP_GRID = "grid grid-cols-2 gap-2 sm:flex sm:flex-wrap";

interface BullChipProps {
  bull: SemenBull;
  /** Doses the bull has left. */
  left: number;
  selected: boolean;
  /** A bull with no dose left cannot be picked, unless the caller says otherwise. */
  disabled?: boolean;
  onClick: () => void;
}

export function BullChip({ bull, left, selected, disabled = left <= 0, onClick }: BullChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-11 flex-col items-start justify-center rounded-lg border px-3 py-1.5 text-left transition-colors sm:flex-row sm:items-center sm:gap-2.5",
        selected
          ? "border-brand bg-brand-soft ring-1 ring-brand"
          : "border-hairline bg-panel hover:bg-surface",
        "disabled:cursor-not-allowed disabled:bg-surface disabled:opacity-50"
      )}
    >
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
        {selected ? <Check className="size-4 text-brand" aria-hidden /> : null}
        {bull.name}
      </span>
      <span
        className={cn(
          "text-xs whitespace-nowrap",
          left > 0 && left <= LOW_STOCK_DOSES ? "font-medium text-attention" : "text-ink-soft"
        )}
      >
        {left <= 0 ? "sem doses" : <MonoDoses doses={left} />}
      </span>
    </button>
  );
}
