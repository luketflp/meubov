import { bandPosition, bandTone, type BandTone, type Benchmark } from "@/lib/domain/benchmarks";
import { cn } from "@/lib/utils";

interface BenchmarkBandProps {
  value: number;
  benchmark: Benchmark;
  /** How the tick labels print a benchmark value, e.g. `v => `${formatNumber(v)}%``. */
  format: (value: number) => string;
}

const TONE: Record<BandTone, { fill: string; ring: string }> = {
  healthy: { fill: "bg-healthy", ring: "ring-healthy" },
  attention: { fill: "bg-attention", ring: "ring-attention" },
  overdue: { fill: "bg-overdue", ring: "ring-overdue" },
};

/** Keeps a label under its tick without spilling past the track's ends. */
function labelAlign(position: number): string {
  if (position < 12) return "translate-x-0";
  if (position > 88) return "-translate-x-full";
  return "-translate-x-1/2";
}

/**
 * The reference band under an indicator: the track, a tick for the média and
 * one for the top, the farm's value as a colored marker and a soft fill from
 * the worse end to it.
 */
export function BenchmarkBand({ value, benchmark, format }: BenchmarkBandProps) {
  const position = bandPosition(value, benchmark);
  const tone = TONE[bandTone(value, benchmark)];
  const ticks = [
    {
      key: "mean",
      at: bandPosition(benchmark.mean, benchmark),
      label: `${benchmark.meanLabel ?? "média"} ${format(benchmark.mean)}`,
    },
    ...(benchmark.top === null
      ? []
      : [
          {
            key: "top",
            at: bandPosition(benchmark.top, benchmark),
            label: `${benchmark.topLabel ?? "top"} ${format(benchmark.top)}`,
          },
        ]),
  ];
  const fill =
    benchmark.better === "high"
      ? { left: 0, width: `${position}%` }
      : { left: `${position}%`, right: 0 };

  return (
    <div
      role="img"
      aria-label={ticks.map((tick) => tick.label).join(" · ")}
      className="relative mt-1.5 mb-3.5 h-1.5 rounded-full border border-hairline bg-canvas"
    >
      <span className={cn("absolute inset-y-0 rounded-full opacity-25", tone.fill)} style={fill} />
      {ticks.map((tick) => (
        <span
          key={tick.key}
          className="absolute -inset-y-1 w-px bg-ink-soft/60"
          style={{ left: `${tick.at}%` }}
        />
      ))}
      <span
        className={cn(
          "absolute top-1/2 -ml-1.5 size-3 -translate-y-1/2 rounded-full border-2 border-panel ring-1",
          tone.fill,
          tone.ring
        )}
        style={{ left: `${position}%` }}
      />
      <div className="absolute inset-x-0 top-2.5 h-3">
        {ticks.map((tick) => (
          <span
            key={tick.key}
            className={cn(
              "absolute text-[10px] leading-3 whitespace-nowrap text-ink-soft",
              labelAlign(tick.at)
            )}
            style={{ left: `${tick.at}%` }}
          >
            {tick.label}
          </span>
        ))}
      </div>
    </div>
  );
}
