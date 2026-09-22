/**
 * "Rebanho": the active head count and how it changed in 12 months, the herd
 * by category as one bar, and three figures — GMD, lotação and peso vivo.
 */
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import type { Category, StockingRateClass } from "@/lib/types";
import { pluralCategory } from "@/lib/domain/labels";
import { formatKg, formatNumber } from "@/lib/domain/format";
import { STOCKING_LABEL } from "@/components/lots/stocking-bar";
import { SectionCard } from "@/components/ui/section-card";
import { cn } from "@/lib/utils";

const SWATCH: Record<Category, string> = {
  cow: "bg-brand",
  steer: "bg-scheduled",
  calf: "bg-healthy-soft ring-1 ring-healthy ring-inset",
  heifer: "bg-attention",
  bull: "bg-fmd",
};

const STOCKING_INK: Record<StockingRateClass, string> = {
  light: "text-scheduled",
  good: "text-healthy",
  high: "text-overdue",
};

interface HerdCardProps {
  headCount: number;
  /** Heads gained, or lost, over the flow's 12 months. */
  change12m: number;
  byCategory: Record<Category, number>;
  /** Herd GMD (kg/dia), or null without two weighings. */
  averageAdg: number | null;
  /** Last month's GMD minus the month before's. */
  adgChange: number | null;
  stockingRate: number;
  stockingClass: StockingRateClass;
  totalKg: number;
  totalArrobas: number;
  className?: string;
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function Stat({
  label,
  value,
  unit,
  sub,
  subClass = "text-ink-soft",
}: {
  label: string;
  value: string;
  unit: string;
  sub: string;
  subClass?: string;
}) {
  return (
    <div className="min-w-0 border-l border-hairline px-3 py-3 first:border-l-0 sm:px-4">
      <dt className="text-[11px] font-medium tracking-wide text-ink-soft uppercase">{label}</dt>
      <dd className="mt-1 font-mono text-base font-medium whitespace-nowrap text-ink sm:text-lg">
        {value}
        <span className="text-xs text-ink-soft"> {unit}</span>
      </dd>
      <dd className={cn("mt-0.5 truncate text-[11px]", subClass)}>{sub}</dd>
    </div>
  );
}

export function HerdCard({
  headCount,
  change12m,
  byCategory,
  averageAdg,
  adgChange,
  stockingRate,
  stockingClass,
  totalKg,
  totalArrobas,
  className,
}: HerdCardProps) {
  const categories = (Object.entries(byCategory) as [Category, number][])
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    // Stretched beside the Evolução, the three figures keep to the card's floor.
    <SectionCard
      title="Rebanho"
      className={cn("flex flex-col", className)}
      bodyClassName="flex flex-1 flex-col"
      action={
        <Link
          href="/herd"
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline md:min-h-0"
        >
          Ver rebanho
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      }
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-3xl font-medium text-ink">
          {formatNumber(headCount)}
          <span className="text-sm text-ink-soft"> {headCount === 1 ? "cabeça" : "cabeças"}</span>
        </p>
        <span
          className={cn(
            "inline-flex items-center gap-0.5 text-xs font-medium",
            change12m > 0 ? "text-healthy" : change12m < 0 ? "text-overdue" : "text-ink-soft"
          )}
        >
          {change12m > 0 ? <ArrowUpRight className="size-3.5" aria-hidden /> : null}
          {change12m < 0 ? <ArrowDownRight className="size-3.5" aria-hidden /> : null}
          {change12m === 0
            ? "estável em 12 meses"
            : `${change12m > 0 ? "+" : "−"}${formatNumber(Math.abs(change12m))} em 12 meses`}
        </span>
      </div>

      {categories.length > 0 ? (
        <>
          <div aria-hidden className="mt-3 flex h-3 gap-0.5 overflow-hidden rounded-full">
            {categories.map(([category, count]) => (
              <span key={category} className={SWATCH[category]} style={{ flexGrow: count }} />
            ))}
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
            {categories.map(([category, count]) => (
              <li key={category} className="flex items-center gap-1.5 text-xs text-ink-soft">
                <span aria-hidden className={cn("size-2 shrink-0 rounded-full", SWATCH[category])} />
                {capitalized(pluralCategory(category, 2))}
                <span className="font-mono font-medium text-ink">{formatNumber(count)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <span aria-hidden className="flex-1" />
      <dl className="-mx-4 mt-4 -mb-4 grid grid-cols-3 border-t border-hairline">
        <Stat
          label="GMD"
          value={averageAdg === null ? "—" : formatNumber(averageAdg, 2)}
          unit="kg/dia"
          sub={
            adgChange === null
              ? "últimos 120 dias"
              : `${adgChange >= 0 ? "↑" : "↓"} ${formatNumber(Math.abs(adgChange), 2)} no mês`
          }
          subClass={
            adgChange === null ? undefined : adgChange >= 0 ? "text-healthy" : "text-overdue"
          }
        />
        <Stat
          label="Lotação"
          value={formatNumber(stockingRate, 2)}
          unit="UA/ha"
          sub={STOCKING_LABEL[stockingClass]}
          subClass={STOCKING_INK[stockingClass]}
        />
        <Stat
          label="Peso vivo"
          value={formatNumber(totalArrobas)}
          unit="@"
          sub={formatKg(totalKg)}
        />
      </dl>
    </SectionCard>
  );
}
