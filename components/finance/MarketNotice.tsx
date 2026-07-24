import { Info } from "lucide-react";

interface MarketNoticeProps {
  /** True when the arroba quote is coming from the real source. */
  quoteLive: boolean;
  /** Provenance label of the live quote (e.g. "cotação de 31/07/2026 · … Scot Consultoria"). */
  quoteSourceLabel: string | null;
}

/** Discreet notice on the provenance of the market figures. */
export function MarketNotice({ quoteLive, quoteSourceLabel }: MarketNoticeProps) {
  return (
    <div
      role="note"
      className="flex items-start gap-2.5 rounded-lg bg-attention-soft px-4 py-3 text-attention"
    >
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="text-xs leading-relaxed">
        {quoteLive ? (
          <>
            Cotação da arroba real: {quoteSourceLabel}. Receitas, custos e demais
            valores de mercado seguem ilustrativos até a integração financeira.
          </>
        ) : (
          <>
            Valores de mercado ilustrativos — fonte real indisponível no momento
            (a cotação tenta a Scot Consultoria via{" "}
            <code className="font-mono font-medium">/api/market/quote</code> e cai
            no mock quando offline).
          </>
        )}
      </p>
    </div>
  );
}
