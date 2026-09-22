"use client";

/**
 * "Mercado": the arroba of the boi gordo with its monthly change and its last
 * 12 months, and what the herd is worth at that price. "—" when the quote is
 * unavailable: the app never shows a made-up price.
 */
import { ArrowDownRight, ArrowUpRight, Info } from "lucide-react";
import type { ArrobaQuoteView } from "@/lib/data/useArrobaQuote";
import { herdValue } from "@/lib/domain/finance";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { formatCompactCurrency } from "@/components/finance/format";
import { Sparkline } from "@/components/charts/sparkline";
import { SectionCard } from "@/components/ui/section-card";
import { cn } from "@/lib/utils";

const LABEL = "text-[11px] font-medium tracking-wide text-ink-soft uppercase";

export function MarketCard({ quote, totalArrobas }: { quote: ArrobaQuoteView; totalArrobas: number }) {
  const price = quote.price;
  const value = price === null ? null : herdValue(totalArrobas, price);
  const rising = (quote.changePct ?? 0) >= 0;

  return (
    <SectionCard title="Mercado" subtitle="arroba e valor do rebanho">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className={LABEL}>Arroba do boi gordo</p>
          <p className="mt-1 font-mono text-2xl font-medium whitespace-nowrap text-ink">
            {price === null ? (
              "—"
            ) : (
              <>
                {formatNumber(price, 2)}
                <span className="text-sm text-ink-soft"> R$/@</span>
              </>
            )}
          </p>
          {quote.changePct !== null ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-xs font-medium",
                rising ? "text-healthy" : "text-overdue"
              )}
            >
              {rising ? (
                <ArrowUpRight className="size-3.5" aria-hidden />
              ) : (
                <ArrowDownRight className="size-3.5" aria-hidden />
              )}
              {formatNumber(Math.abs(quote.changePct), 1)}% no mês
            </span>
          ) : null}
        </div>
        <Sparkline values={quote.series.slice(-12).map((point) => point.value)} />
      </div>

      <div className="-mx-4 mt-4 border-t border-hairline px-4 pt-3">
        <p className={LABEL}>Valor do rebanho</p>
        <p className="mt-1 font-mono text-2xl font-medium text-ink">
          {value === null ? "—" : formatCompactCurrency(value)}
        </p>
        <p className="mt-0.5 text-xs text-ink-soft">
          {value === null || price === null
            ? "cotação indisponível"
            : `${formatNumber(totalArrobas)} @ × R$ ${formatNumber(price, 2)} · ${formatCurrency(value)}`}
        </p>
      </div>

      {quote.sourceLabel ? (
        <p className="mt-3 flex gap-1.5 text-[11px] text-ink-soft">
          <Info className="size-3.5 shrink-0" aria-hidden />
          {quote.sourceLabel}
        </p>
      ) : null}
    </SectionCard>
  );
}
