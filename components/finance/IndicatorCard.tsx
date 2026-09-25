import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { Benchmark } from "@/lib/domain/benchmarks";
import { formatNumber } from "@/lib/domain/format";
import { BenchmarkBand } from "@/components/finance/BenchmarkBand";
import { cn } from "@/lib/utils";

/** `positive` = good for the farm (colors it); `up` = the figure rose (points the arrow). */
export interface IndicatorDelta {
  text: string;
  positive: boolean;
  up?: boolean;
}

export interface IndicatorStat {
  label: string;
  value: string;
  sub: string;
}

/**
 * "+8% vs ano anterior", or "+3,5 pts vs ano anterior" with `pts`. Null when
 * either year has no figure, which hides the delta. `lowerIsBetter` for cost.
 */
export function yoyDelta(
  delta: { pct: number | null; pts: number | null },
  options: { lowerIsBetter?: boolean; pts?: boolean } = {}
): IndicatorDelta | null {
  const value = options.pts ? delta.pts : delta.pct;
  if (value === null) return null;
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const amount = options.pts
    ? `${formatNumber(Math.abs(value), 1)} pts`
    : `${formatNumber(Math.abs(value), 0)}%`;
  return {
    text: `${sign}${amount} vs ano anterior`,
    positive: options.lowerIsBetter ? value <= 0 : value >= 0,
    up: value >= 0,
  };
}

export function DeltaText({ delta }: { delta: IndicatorDelta }) {
  const up = delta.up ?? delta.positive;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium whitespace-nowrap",
        delta.positive ? "text-healthy" : "text-overdue"
      )}
    >
      {up ? (
        <ArrowUpRight className="size-3.5" aria-hidden />
      ) : (
        <ArrowDownRight className="size-3.5" aria-hidden />
      )}
      {delta.text}
    </span>
  );
}

const LABEL = "text-[11px] font-medium tracking-wide text-ink-soft uppercase";

interface IndicatorCardProps {
  label: string;
  /** "—" when the records can't support the figure. */
  value: ReactNode;
  unit?: string;
  sub?: string;
  delta?: IndicatorDelta | null;
  /** A row of small figures under the value (the Resultado card). */
  stats?: IndicatorStat[];
  band?: { value: number; benchmark: Benchmark; format: (value: number) => string };
  /** Band caption: source and safra. */
  source?: string;
  /** Closing note when the card has no band. */
  foot?: string;
  className?: string;
}

/** One Placar indicator, in the KpiCard look, with its reference band pinned to the bottom. */
export function IndicatorCard({
  label,
  value,
  unit,
  sub,
  delta,
  stats,
  band,
  source,
  foot,
  className,
}: IndicatorCardProps) {
  return (
    <div className={cn("flex h-full flex-col rounded-lg border border-hairline bg-panel p-4", className)}>
      <p className={LABEL}>{label}</p>
      <div className="mt-1.5 font-mono text-2xl font-medium text-ink">
        {value}
        {unit ? <span className="text-sm text-ink-soft"> {unit}</span> : null}
      </div>
      {delta || sub ? (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {delta ? <DeltaText delta={delta} /> : null}
          {sub ? <span className="text-xs text-ink-soft">{sub}</span> : null}
        </div>
      ) : null}
      {stats ? (
        <dl className="mt-3.5 grid grid-cols-3 border-t border-hairline">
          {stats.map((stat, index) => (
            <div
              key={stat.label}
              className={cn("min-w-0 pt-2.5", index > 0 && "border-l border-hairline pl-3")}
            >
              <dt className={LABEL}>{stat.label}</dt>
              <dd className="mt-1 truncate font-mono text-lg font-medium text-ink">{stat.value}</dd>
              <dd className="mt-0.5 truncate text-[11px] text-ink-soft">{stat.sub}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {band || source ? (
        <div className="mt-auto pt-2">
          {band ? (
            <BenchmarkBand value={band.value} benchmark={band.benchmark} format={band.format} />
          ) : null}
          {source ? <p className="mt-0.5 text-[10px] leading-3.5 text-ink-soft">{source}</p> : null}
        </div>
      ) : null}
      {foot ? <p className="mt-auto pt-2.5 text-[11px] leading-3.5 text-ink-soft">{foot}</p> : null}
    </div>
  );
}
