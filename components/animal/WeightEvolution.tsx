"use client";

/**
 * "Weight evolution" section: line chart of the weighings, ADG summary
 * and the new weighing form beside it (stacked on mobile). Its "Exportar"
 * takes the weighings alone, with the GMD since the previous one.
 */
import { Scale } from "lucide-react";
import type { Animal } from "@/lib/types";
import { formatDate } from "@/lib/domain/dates";
import { formatNumber } from "@/lib/domain/format";
import { useCan } from "@/lib/store/usePermissions";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { LineChart } from "@/components/charts/line-chart";
import { WeighingForm } from "@/components/animal/WeighingForm";
import { ExportMenu } from "@/components/export/ExportMenu";
import { animalWeighingsTable } from "@/lib/export/datasets/animal";

/** Short date "dd/mm" for the chart axis labels. */
function shortDate(iso: string): string {
  return formatDate(iso).slice(0, 5);
}

interface WeightEvolutionProps {
  animal: Animal;
  adg: number | null;
}

export function WeightEvolution({ animal, adg }: WeightEvolutionProps) {
  const canEditHerd = useCan("herd", "edit");
  const weighings = animal.weighings;
  const points = weighings.map((w) => ({ label: shortDate(w.date), value: w.weightKg }));

  return (
    <SectionCard
      title="Evolução de peso"
      action={
        weighings.length > 0 ? (
          <ExportMenu
            title={`Pesagens ${animal.earTag}`}
            current={{
              label: "Pesagens",
              detail: `${weighings.length} ${weighings.length === 1 ? "pesagem" : "pesagens"} do animal ${animal.earTag}`,
              build: () => [animalWeighingsTable(animal)],
            }}
            formats={["xlsx", "csv"]}
          />
        ) : null
      }
    >
      <div
        className={
          canEditHerd ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]" : "grid gap-6"
        }
      >
        <div className="min-w-0">
          {points.length > 0 ? (
            <>
              <LineChart
                points={points}
                height={220}
                area
                highlightLast
                formatValue={(v) => formatNumber(v)}
              />
              <p className="mt-3 text-sm text-ink-soft">
                {adg !== null ? (
                  <>
                    GMD no período:{" "}
                    <span className="font-mono font-medium text-ink">
                      {formatNumber(adg, 2)} kg/dia
                    </span>{" "}
                    · <span className="font-mono">{weighings.length}</span> pesagens de{" "}
                    <span className="font-mono">{formatDate(weighings[0].date)}</span> a{" "}
                    <span className="font-mono">
                      {formatDate(weighings[weighings.length - 1].date)}
                    </span>
                  </>
                ) : (
                  "GMD indisponível: são necessárias ao menos 2 pesagens em datas diferentes."
                )}
              </p>
            </>
          ) : (
            <EmptyState
              icon={Scale}
              title="Nenhuma pesagem registrada"
              description="Registre a primeira pesagem para acompanhar a evolução de peso do animal."
            />
          )}
        </div>

        {canEditHerd ? <WeighingForm earTag={animal.earTag} /> : null}
      </div>
    </SectionCard>
  );
}
