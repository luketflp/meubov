import { SectionCard } from "@/components/ui/section-card";
import { LineChart, type LinePoint } from "@/components/charts/line-chart";
import type { ArrobaQuote } from "@/lib/data/market";
import { monthYearLabel } from "@/lib/domain/dates";
import { formatCurrency } from "@/lib/domain/format";

interface QuoteChartProps {
  series: ArrobaQuote[];
  /** True when the series is the illustrative mock (source has no history). */
  illustrative?: boolean;
}

/** Monthly evolution of the fat steer arroba quote. */
export function QuoteChart({ series, illustrative = false }: QuoteChartProps) {
  const points: LinePoint[] = series.map((quote) => ({
    label: monthYearLabel(quote.date),
    value: quote.value,
  }));

  return (
    <SectionCard
      title={`Cotação da arroba (12 meses)${illustrative ? " · ilustrativa" : ""}`}
    >
      <LineChart points={points} height={220} area highlightLast formatValue={formatCurrency} />
    </SectionCard>
  );
}
