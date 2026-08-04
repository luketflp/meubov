import { Info } from "lucide-react";

interface MarketNoticeProps {
  /** True when the arroba quote came from the real source. */
  quoteLive: boolean;
  /** Provenance label of the live quote (e.g. "cotação de 31/07/2026 · … Scot Consultoria"). */
  quoteSourceLabel: string | null;
  /** Provenance label of the historical series, or null without series. */
  seriesSourceLabel: string | null;
}

/** Discreet notice on the provenance of the market figures. */
export function MarketNotice({
  quoteLive,
  quoteSourceLabel,
  seriesSourceLabel,
}: MarketNoticeProps) {
  return (
    <div
      role="note"
      className="flex items-start gap-2.5 rounded-lg bg-attention-soft px-4 py-3 text-attention"
    >
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="text-xs leading-relaxed">
        {quoteLive ? (
          <>
            Cotação da arroba: {quoteSourceLabel}
            {seriesSourceLabel ? <> · histórico: {seriesSourceLabel}</> : null}.
            Receitas, custos e indicadores são calculados dos lançamentos da
            fazenda (vendas, compras, despesas e tratamentos).
          </>
        ) : (
          <>
            Fontes de cotação indisponíveis no momento — os valores que dependem
            da arroba mostram “—”. Receitas e custos seguem reais, calculados dos
            lançamentos da fazenda.
          </>
        )}
      </p>
    </div>
  );
}
