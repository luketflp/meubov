import Link from "next/link";
import { safraLabel, type BudgetView } from "@/lib/domain/budget";
import { periodSearch, type Period } from "@/lib/domain/period";
import { BudgetMeter, TONE_TEXT, usedText } from "@/components/finance/orcamento/BudgetMeter";
import { cn } from "@/lib/utils";

/**
 * "Orçamento" on the Painel, under "Capital, dívidas e sócios": how much of
 * the current safra's orçado to date is used, the grupos already above it
 * (three at most, worst first) and the way to the page. Nothing while the
 * safra has no orçado. It follows the safra, not the window.
 */
export function BudgetBand({ view, period }: { view: BudgetView | null; period: Period }) {
  if (!view || !view.groups.some((group) => group.hasBudget)) return null;
  const { usedPct, tone } = view.totals;
  return (
    <section
      aria-label="Orçamento da safra"
      className="flex flex-col gap-2.5 rounded-lg border border-hairline bg-panel px-4 py-3 md:flex-row md:items-center md:gap-4"
    >
      <p className="text-sm text-ink md:shrink-0">
        <span className="font-medium">Orçamento</span> · {safraLabel(view.safra, view.startMonth).replace("Safra", "safra")} ·{" "}
        {usedPct === null ? (
          <span className="text-ink-soft">nada orçado até hoje</span>
        ) : (
          <>
            <span className={cn("font-mono font-medium", TONE_TEXT[tone])}>{usedText(usedPct)}</span> usado
          </>
        )}
      </p>
      {usedPct !== null ? <BudgetMeter pct={usedPct} tone={tone} className="w-full md:max-w-60 md:flex-1" /> : null}
      {view.over.length > 0 ? (
        <ul aria-label="Grupos acima do orçado" className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-soft">
          {view.over.map((group) => (
            <li key={group.label}>
              {group.label} <span className="font-mono font-medium text-overdue">{usedText(group.usedPct)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <Link
        href={`/finance/orcamento?safra=${view.safra}&${periodSearch(period)}`}
        className="inline-flex min-h-11 items-center self-start text-sm font-medium text-brand hover:underline md:ml-auto md:min-h-0 md:self-auto"
      >
        Ver orçamento
      </Link>
    </section>
  );
}
