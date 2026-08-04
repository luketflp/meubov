import { SectionCard } from "@/components/ui/section-card";
import { formatCurrency, formatNumber } from "@/lib/domain/format";

interface LivestockIndicatorsProps {
  /** All derived from real records; null = insufficient data ("—"). */
  exchangeRatio: number | null;
  offtakeRate: number | null;
  productivity: number | null;
  dailyCost: number | null;
  turnover: number | null;
}

interface IndicatorRow {
  label: string;
  explanation: string;
  value: string;
}

const DASH = "—";

/** Key-value list of the technical and economic livestock indicators. */
export function LivestockIndicators({
  exchangeRatio,
  offtakeRate,
  productivity,
  dailyCost,
  turnover,
}: LivestockIndicatorsProps) {
  const rows: IndicatorRow[] = [
    {
      label: "Relação de troca boi/bezerro",
      explanation: "Quantos bezerros o valor de 1 boi gordo compra hoje.",
      value: exchangeRatio === null ? DASH : `1 boi ≈ ${formatNumber(exchangeRatio, 1)} bezerros`,
    },
    {
      label: "Taxa de desfrute",
      explanation: "Cabeças vendidas nos últimos 12 meses sobre o rebanho ativo.",
      value: offtakeRate === null ? DASH : `${formatNumber(offtakeRate, 1)}%`,
    },
    {
      label: "Produtividade (@/ha/ano)",
      explanation: "Estimativa: cabeças vendidas × @ média dos bois, por hectare.",
      value: productivity === null ? DASH : formatNumber(productivity, 1),
    },
    {
      label: "Custo da diária",
      explanation: "Custo dos últimos 12 meses por cabeça por dia.",
      value: dailyCost === null ? DASH : `${formatCurrency(dailyCost)}/cab/dia`,
    },
    {
      label: "Giro de capital",
      explanation: "Receita dos últimos 12 meses sobre o valor do rebanho.",
      value: turnover === null ? DASH : `${formatNumber(turnover, 2)}×`,
    },
  ];

  return (
    <SectionCard title="Indicadores">
      <ul className="divide-y divide-hairline">
        {rows.map((row) => (
          <li
            key={row.label}
            className="flex min-h-11 items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{row.label}</p>
              <p className="mt-0.5 text-xs text-ink-soft">{row.explanation}</p>
            </div>
            <span className="shrink-0 font-mono text-sm font-medium text-ink">
              {row.value}
            </span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
