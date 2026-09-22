/**
 * Grazing pressure of an invernada as a faixa, not a percentage: the fill is
 * the rate against a fixed ceiling and the two ticks are the limits
 * `classifyStockingRate` already uses, so the bar says "where in the range"
 * instead of "how full".
 */
import type { StockingRateClass } from "@/lib/types";
import { formatNumber } from "@/lib/domain/format";
import { cn } from "@/lib/utils";

/** Top of the scale, past the "high" threshold so a loaded pasture still reads. */
const SCALE_MAX_AU_PER_HA = 2.4;

/** The limits of classifyStockingRate, drawn on the track. */
const FAIXA_TICKS = [0.9, 1.6];

export const STOCKING_LABEL: Record<StockingRateClass, string> = {
  light: "subutilizada",
  good: "faixa de equilíbrio",
  high: "pressão alta",
};

const fillClass: Record<StockingRateClass, string> = {
  light: "bg-scheduled",
  good: "bg-healthy",
  high: "bg-overdue",
};

const inkClass: Record<StockingRateClass, string> = {
  light: "text-scheduled",
  good: "text-healthy",
  high: "text-overdue",
};

interface StockingBarProps {
  auPerHa: number;
  classification: StockingRateClass;
  className?: string;
  /** Value and bar only: the row around it already says the faixa. */
  compact?: boolean;
}

export function StockingBar({
  auPerHa,
  classification,
  className,
  compact = false,
}: StockingBarProps) {
  const width = Math.min(auPerHa / SCALE_MAX_AU_PER_HA, 1) * 100;

  return (
    <div className={cn("w-full sm:w-44", className)}>
      <div className="flex items-baseline justify-between gap-1.5">
        <span className={cn("font-mono text-[13px] font-medium", inkClass[classification])}>
          {formatNumber(auPerHa, 2)} UA/ha
        </span>
        {compact ? null : (
          <span className="text-[11px] text-ink-soft">{STOCKING_LABEL[classification]}</span>
        )}
      </div>
      <div
        aria-hidden
        className="relative mt-1.5 h-1.5 rounded-full border border-hairline bg-canvas"
      >
        <span
          className={cn("absolute inset-y-0 left-0 rounded-full", fillClass[classification])}
          style={{ width: `${width}%` }}
        />
        {FAIXA_TICKS.map((tick) => (
          <span
            key={tick}
            className="absolute -top-0.5 h-2.5 w-px bg-ink/20"
            style={{ left: `${(tick / SCALE_MAX_AU_PER_HA) * 100}%` }}
          />
        ))}
      </div>
    </div>
  );
}
