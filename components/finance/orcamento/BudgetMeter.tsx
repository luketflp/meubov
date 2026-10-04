/**
 * The orçamento's "% usado" bar and its tone colours (by the % as shown: up to
 * 90 % brand, 91 to 100 % attention, above overdue), and the two ways the
 * orçamento writes its figures: whole reais and "108 %". The table, the phone
 * cards and the Painel's band share them.
 */
import type { BudgetTone } from "@/lib/domain/budget";
import { formatNumber } from "@/lib/domain/format";
import { cn } from "@/lib/utils";

export const TONE_TEXT: Record<BudgetTone, string> = {
  brand: "text-brand",
  attention: "text-attention",
  overdue: "text-overdue",
  none: "text-ink-soft",
};

export const TONE_BAR: Record<BudgetTone, string> = {
  brand: "bg-brand",
  attention: "bg-attention",
  overdue: "bg-overdue",
  none: "bg-hairline",
};

/** "108 %". */
export const usedText = (pct: number) => `${formatNumber(pct)} %`;

/** "R$ 360.000": the orçamento reads in whole reais. */
export const reais = (value: number) => `R$ ${formatNumber(value)}`;

/** Full at 100 %; the number goes beside it. Spans, so it fits inside a card's button. */
export function BudgetMeter({ pct, tone, className }: { pct: number; tone: BudgetTone; className?: string }) {
  return (
    <span
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.min(100, Math.round(pct))}
      aria-label={`${usedText(pct)} do orçado`}
      className={cn("block h-1.5 overflow-hidden rounded-full bg-surface ring-1 ring-hairline ring-inset", className)}
    >
      <span className={cn("block h-full", TONE_BAR[tone])} style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }} />
    </span>
  );
}
