import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { ArrobaQuoteView } from "@/lib/data/useArrobaQuote";
import type { Indicators } from "@/lib/domain/economics";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { formatCompactCurrency } from "@/components/finance/format";
import { Sparkline } from "@/components/charts/sparkline";
import { SectionCard } from "@/components/ui/section-card";
import { cn } from "@/lib/utils";

const LABEL = "text-[11px] font-medium tracking-wide text-ink-soft uppercase";
const DASH = "—";

/**
 * "Mercado": the arroba and its month, then what the price says about the
 * farm — troca, the herd's worth and the price it actually sold at. "—" when
 * the quote is unavailable: the app never shows a made-up price.
 */
export function MarketPanel({ quote, ind }: { quote: ArrobaQuoteView; ind: Indicators }) {
  const price = quote.price;
  const rising = (quote.changePct ?? 0) >= 0;
  const { calvesPerSteer, arrobasPerCalf } = ind.exchange;
  const change = ind.inventoryDeltaBrl;

  const rows = [
    {
      label: "Relação de troca",
      sub:
        arrobasPerCalf === null
          ? "suas compras"
          : `${formatNumber(arrobasPerCalf, 1)} @ por bezerro · suas compras`,
      value: calvesPerSteer === null ? DASH : `1 boi ≈ ${formatNumber(calvesPerSteer, 1)} bezerros`,
    },
    {
      label: "Valor do rebanho",
      sub:
        `${formatNumber(ind.herdArrobas)} @ × cotação` +
        (change === null
          ? ""
          : ` · ${change < 0 ? "−" : "+"}${formatCompactCurrency(Math.abs(change))} no período`),
      value: ind.herdValue === null ? DASH : formatCurrency(ind.herdValue),
    },
    {
      label: "Preço médio realizado",
      sub: `${formatNumber(ind.produced.headsSold)} cab. vendidas · ${formatNumber(ind.produced.sold)} @`,
      value: ind.realizedPerArroba === null ? DASH : `${formatCurrency(ind.realizedPerArroba)}/@`,
    },
  ];

  return (
    <SectionCard title="Mercado" subtitle="cotação, troca e patrimônio">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className={LABEL}>Arroba do boi gordo</p>
          <p className="mt-1 font-mono text-2xl font-medium whitespace-nowrap text-ink">
            {price === null ? (
              DASH
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
              {rising ? "+" : "−"}
              {formatNumber(Math.abs(quote.changePct), 1)}% no mês
            </span>
          ) : null}
        </div>
        <Sparkline values={quote.series.slice(-12).map((point) => point.value)} />
      </div>

      <ul className="mt-3 border-t border-hairline">
        {rows.map((row) => (
          <li
            key={row.label}
            className="flex min-h-12 items-center justify-between gap-3 border-b border-hairline py-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{row.label}</p>
              <p className="mt-px text-xs text-ink-soft">{row.sub}</p>
            </div>
            <span className="font-mono text-sm font-medium whitespace-nowrap text-ink">{row.value}</span>
          </li>
        ))}
      </ul>

      <p className="mt-2.5 text-[11px] leading-4 text-ink-soft">
        {price === null
          ? "Fontes de cotação indisponíveis no momento — os valores que dependem da arroba mostram “—”. Receitas e custos seguem reais, calculados dos lançamentos da fazenda."
          : `Cotação: ${quote.sourceLabel}.${quote.seriesSourceLabel ? ` Histórico: ${quote.seriesSourceLabel}.` : ""}`}
      </p>
    </SectionCard>
  );
}
