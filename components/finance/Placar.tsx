import type { Indicators, indicatorDeltas } from "@/lib/domain/economics";
import { benchmark, FARM_SYSTEM_LABEL, type BenchmarkKey } from "@/lib/domain/benchmarks";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { formatCompactCurrency } from "@/components/finance/format";
import { IndicatorCard, yoyDelta } from "@/components/finance/IndicatorCard";
import { CostVsPriceCard, producedEquation } from "@/components/finance/CostVsPriceCard";

const DASH = "—";
const DAYS_PER_MONTH = 30.4375;

interface PlacarProps {
  ind: Indicators;
  deltas: ReturnType<typeof indicatorDeltas>;
  /** Today's arroba price, or null when the quote is unavailable. */
  quote: number | null;
}

/** The eight indicators of the window, each against its reference and the year before. */
export function Placar({ ind, deltas, quote }: PlacarProps) {
  const produced = ind.produced;
  const { kgPerDay, animals } = ind.adg;
  const { calvesPerSteer, arrobasPerCalf } = ind.exchange;
  const outlay = ind.outlayPerHeadMonth;
  const offtake = ind.offtakePct;
  const stocking = ind.stocking;

  // A figure without data hides its band and its source with it.
  const band = (key: BenchmarkKey, value: number | null, format: (value: number) => string) =>
    value === null ? undefined : { value, benchmark: benchmark(key, ind.system), format };
  // `bySystem` names the production system for metas that depend on it.
  const source = (key: BenchmarkKey, value: number | null, bySystem = false) =>
    value === null
      ? undefined
      : `${benchmark(key, ind.system).source}${bySystem ? ` · ${FARM_SYSTEM_LABEL[ind.system]}` : ""}`;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <IndicatorCard
        label="Resultado do período"
        value={formatCurrency(ind.result)}
        delta={yoyDelta(deltas.result)}
        sub={`receita ${formatCurrency(ind.revenue)} − COE ${formatCurrency(ind.coe)}`}
        stats={[
          {
            label: "R$/ha",
            value: ind.resultPerHa === null ? DASH : formatCompactCurrency(ind.resultPerHa),
            sub: `${formatNumber(ind.hectares)} ha`,
          },
          {
            label: "Margem",
            value: ind.marginPct === null ? DASH : `${formatNumber(ind.marginPct, 1)}%`,
            sub: "da receita",
          },
          {
            label: "Giro do capital",
            value: ind.capitalTurnover === null ? DASH : `${formatNumber(ind.capitalTurnover, 2)}×`,
            sub: "receita ÷ rebanho",
          },
        ]}
        band={band("costToRevenue", ind.costToRevenuePct, (v) => `${formatNumber(v)}%`)}
        source={
          ind.costToRevenuePct === null
            ? undefined
            : `custo ÷ receita ${formatNumber(ind.costToRevenuePct, 1)}% · teto de ${FARM_SYSTEM_LABEL[ind.system]} · Inttegra`
        }
      />

      <CostVsPriceCard
        className="md:col-span-2"
        ind={ind}
        quote={quote}
        delta={yoyDelta(deltas.costPerArroba, { lowerIsBetter: true })}
      />

      <IndicatorCard
        label="@ produzidas"
        value={formatNumber(produced.produced)}
        unit={
          ind.arrobasPerHa === null ? "@" : `@ · ${formatNumber(ind.arrobasPerHa, 2)} @/ha/ano`
        }
        delta={yoyDelta(deltas.arrobasPerHa)}
        sub={producedEquation(produced)}
        band={band("arrobasPerHa", ind.arrobasPerHa, (v) => formatNumber(v, 1))}
        source={source("arrobasPerHa", ind.arrobasPerHa)}
      />

      <IndicatorCard
        label="Desembolso por cabeça"
        value={outlay === null ? DASH : formatNumber(outlay, 2)}
        unit={outlay === null ? undefined : "R$/cab/mês"}
        delta={yoyDelta(deltas.outlayPerHeadMonth, { lowerIsBetter: true })}
        sub={
          outlay === null
            ? undefined
            : `${formatCurrency(outlay / DAYS_PER_MONTH)} por cabeça por dia`
        }
        band={band("outlay", outlay, formatCurrency)}
        source={source("outlay", outlay, true)}
      />

      <IndicatorCard
        label="GMD do rebanho"
        value={kgPerDay === null ? DASH : formatNumber(kgPerDay, 3)}
        unit={kgPerDay === null ? undefined : "kg/dia"}
        delta={yoyDelta(deltas.adg)}
        sub={`pesagens dos manejos, ${formatNumber(animals)} ${animals === 1 ? "animal" : "animais"}`}
        band={band("gmd", kgPerDay, (v) => `${formatNumber(v * 1000)} g`)}
        source={source("gmd", kgPerDay)}
      />

      <IndicatorCard
        label="Taxa de desfrute"
        value={offtake === null ? DASH : formatNumber(offtake, 1)}
        unit={offtake === null ? undefined : "%"}
        delta={yoyDelta(deltas.offtakePct, { pts: true })}
        sub={`${formatNumber(produced.headsSold)} vendidas sobre ${formatNumber(ind.heads.avg)} cabeças`}
        band={band("offtake", offtake, (v) => `${formatNumber(v, 1)}%`)}
        source={source("offtake", offtake, true)}
      />

      <IndicatorCard
        label="Lotação"
        value={stocking === null ? DASH : formatNumber(stocking, 2)}
        unit={stocking === null ? undefined : "UA/ha"}
        sub={`${formatNumber(ind.heads.end)} cabeças em ${formatNumber(ind.hectares)} ha`}
        band={band("stocking", stocking, (v) => formatNumber(v, 2))}
        source={source("stocking", stocking)}
      />

      <IndicatorCard
        label="Relação de troca"
        value={calvesPerSteer === null ? DASH : `1 boi ≈ ${formatNumber(calvesPerSteer, 1)} bezerros`}
        delta={yoyDelta(deltas.exchange)}
        sub={
          arrobasPerCalf === null
            ? undefined
            : `${formatNumber(arrobasPerCalf, 1)} @ por bezerro · pelas suas compras`
        }
        foot="sem cotação de bezerro no app · calculado pelas suas compras"
      />
    </div>
  );
}
