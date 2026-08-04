import { TrendingUp } from "lucide-react";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { LineChart, type LinePoint } from "@/components/charts/line-chart";
import type { ArrobaQuote } from "@/lib/data/market";
import { monthYearLabel } from "@/lib/domain/dates";
import { formatCurrency } from "@/lib/domain/format";

interface QuoteChartProps {
  series: ArrobaQuote[];
  /** Provenance of the series (e.g. "Seab/Deral-PR · Ipeadata"), or null. */
  sourceLabel: string | null;
}

/** Monthly evolution of the fat steer arroba quote (real history). */
export function QuoteChart({ series, sourceLabel }: QuoteChartProps) {
  if (series.length === 0) {
    return (
      <SectionCard title="Cotação da arroba (12 meses)">
        <EmptyState
          icon={TrendingUp}
          title="Histórico indisponível"
          description="A série histórica da arroba não pôde ser carregada no momento."
        />
      </SectionCard>
    );
  }

  const points: LinePoint[] = series.map((quote) => ({
    label: monthYearLabel(quote.date),
    value: quote.value,
  }));

  return (
    <SectionCard title="Cotação da arroba (12 meses)">
      <LineChart points={points} height={220} area highlightLast formatValue={formatCurrency} />
      {sourceLabel ? (
        <p className="pt-2 text-xs text-ink-soft">
          Fonte: {sourceLabel} — série de referência (PR); o preço atual do
          painel vem da praça C. Grande-MS.
        </p>
      ) : null}
    </SectionCard>
  );
}
