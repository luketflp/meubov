import { SectionCard } from "@/components/ui/section-card";
import { formatCurrency, formatNumber } from "@/lib/domain/format";

interface LivestockIndicatorsProps {
  exchangeRatio: number;
  offtakeRate: number;
  productivity: number;
  dailyCost: number;
  turnover: number;
}

interface IndicatorRow {
  label: string;
  explanation: string;
  value: string;
}

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
      value: `1 boi ≈ ${formatNumber(exchangeRatio, 1)} bezerros`,
    },
    {
      label: "Taxa de desfrute",
      explanation: "Cabeças vendidas no ano sobre o rebanho ativo.",
      value: `${formatNumber(offtakeRate, 1)}%`,
    },
    {
      label: "Produtividade (@/ha/ano)",
      explanation: "Arrobas produzidas no ano por hectare de pasto.",
      value: formatNumber(productivity, 1),
    },
    {
      label: "Custo da diária",
      explanation: "Custo médio de manter cada cabeça por dia.",
      value: `${formatCurrency(dailyCost)}/cab/dia`,
    },
    {
      label: "Giro de capital",
      explanation: "Receita dos últimos 12 meses sobre o valor do rebanho.",
      value: `${formatNumber(turnover, 2)}×`,
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
