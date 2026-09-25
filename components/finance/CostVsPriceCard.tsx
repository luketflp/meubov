import { Fragment } from "react";
import type { ArrobasProduced, Indicators } from "@/lib/domain/economics";
import { benchmark } from "@/lib/domain/benchmarks";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { DeltaText, type IndicatorDelta } from "@/components/finance/IndicatorCard";
import { SectionCard } from "@/components/ui/section-card";
import { cn } from "@/lib/utils";

const DASH = "—";
const MONO = "font-mono text-sm font-medium whitespace-nowrap";

/** "2.006 vendidas − 280 compradas + 212 de estoque" (the stock term keeps its sign). */
export function producedEquation(p: ArrobasProduced): string {
  const sign = p.delta < 0 ? "−" : "+";
  return `${formatNumber(p.sold)} vendidas − ${formatNumber(p.bought)} compradas ${sign} ${formatNumber(Math.abs(p.delta))} de estoque`;
}

interface CostVsPriceCardProps {
  ind: Indicators;
  /** Today's arroba price, or null when the quote is unavailable. */
  quote: number | null;
  /** Year-over-year change of the custo/@ (down is good). */
  delta: IndicatorDelta | null;
  className?: string;
}

/** Custo da @ produzida, preço médio realizado and today's cotação on one R$/@ scale. */
export function CostVsPriceCard({ ind, quote, delta, className }: CostVsPriceCardProps) {
  const bars = [
    { label: "Custo da @ produzida", value: ind.costPerArroba, fill: "bg-fmd", ink: "text-fmd", delta },
    { label: "Preço médio realizado", value: ind.realizedPerArroba, fill: "bg-scheduled", ink: "text-scheduled", delta: null },
    { label: "Cotação de hoje", value: quote, fill: "bg-brand", ink: "text-brand", delta: null },
  ];
  const largest = Math.max(0, ...bars.map((bar) => bar.value ?? 0));
  const max = Math.max(350, Math.ceil(largest / 50) * 50);
  const reference = benchmark("costPerArroba", ind.system);
  const produced = ind.produced;
  const margin = ind.marginPerArroba;
  const unweighed =
    produced.unweighed > 0
      ? ` · ${produced.unweighed} ${produced.unweighed === 1 ? "vendido" : "vendidos"} sem peso`
      : "";

  return (
    <SectionCard
      title="Custo da @ produzida × cotação"
      subtitle="R$ por arroba · o custo do período contra o preço de hoje"
      className={className}
    >
      <div className="grid grid-cols-[7.5rem_minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[172px_minmax(0,1fr)_84px]">
        {bars.map((bar) => (
          <Fragment key={bar.label}>
            <div className="flex flex-col">
              <span className="text-[13px] leading-4.5 text-ink">{bar.label}</span>
              {bar.delta ? <DeltaText delta={bar.delta} /> : null}
            </div>
            <div
              aria-hidden
              className="relative h-2.5 overflow-hidden rounded-full border border-hairline bg-canvas"
            >
              {bar.value !== null ? (
                <span
                  className={cn("absolute inset-y-0 left-0 rounded-full", bar.fill)}
                  style={{ width: `${Math.min(100, Math.max(0, (bar.value / max) * 100))}%` }}
                />
              ) : null}
            </div>
            <span className={cn("text-right", MONO, bar.value === null ? "text-ink-soft" : bar.ink)}>
              {bar.value === null ? DASH : formatCurrency(bar.value)}
            </span>
          </Fragment>
        ))}
        <span aria-hidden />
        <div aria-hidden className="flex justify-between text-[10px] leading-3 text-ink-soft">
          <span>0</span>
          <span>R$ {formatNumber(max)}/@</span>
        </div>
        <span aria-hidden />
      </div>

      <p className="mt-3 border-t border-hairline pt-2.5 text-[13px] leading-4.5 text-ink">
        Margem na cotação{" "}
        <span
          className={cn(
            MONO,
            margin === null ? "text-ink-soft" : margin >= 0 ? "text-healthy" : "text-overdue"
          )}
        >
          {margin === null ? DASH : `${formatCurrency(margin)}/@`}
        </span>{" "}
        · {reference.meanLabel ?? "média"}{" "}
        <span className={MONO}>{formatCurrency(reference.mean)}</span>
        {reference.top === null ? null : (
          <>
            {" "}
            · {reference.topLabel ?? "top"} <span className={MONO}>{formatCurrency(reference.top)}</span>
          </>
        )}{" "}
        <span className="text-ink-soft">({reference.source})</span>
      </p>
      <p className="mt-1.5 text-[11px] leading-4 text-ink-soft">
        @ produzidas = {producedEquation(produced)} = {formatNumber(produced.produced)} @ · COE{" "}
        {formatCurrency(ind.coe)}
        {unweighed}
      </p>
    </SectionCard>
  );
}
