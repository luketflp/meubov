"use client";

/**
 * Exportar of the Baixas screen: the rows of the list under the `motivo`
 * filter, and every baixa when the filter narrows it. Reads the query, so it
 * sits inside a Suspense boundary.
 */
import { useSearchParams } from "next/navigation";
import { ExportMenu } from "@/components/export/ExportMenu";
import {
  BAIXA_FILTER_ALL,
  BAIXA_FILTER_LABEL,
  parseBaixaFilter,
  recentBaixas,
  type BaixaFilter,
} from "@/components/baixas/baixas";
import { baixasExportTable } from "@/lib/export/datasets/baixas";
import { useHerdStore } from "@/lib/store/useHerdStore";

const countLabel = (n: number) => (n === 1 ? "1 baixa" : `${n} baixas`);

export function BaixasExport() {
  const animals = useHerdStore((s) => s.animals);
  const lots = useHerdStore((s) => s.lots);
  const customCategories = useHerdStore((s) => s.customCategories);
  const filter = parseBaixaFilter(useSearchParams().get("motivo"));

  const names = { lotNames: new Map(lots.map((lot) => [lot.id, lot.name])), customCategories };
  const build = (f: BaixaFilter) => () => [baixasExportTable(recentBaixas(animals, f), names)];
  const narrowed = filter !== BAIXA_FILTER_ALL;
  const filters = narrowed ? [`Motivo: ${BAIXA_FILTER_LABEL[filter]}`] : [];

  return (
    <ExportMenu
      title="Baixas"
      current={{
        label: "Filtro atual",
        detail: [countLabel(recentBaixas(animals, filter).length), ...filters].join(" · "),
        filters,
        build: build(filter),
      }}
      all={
        narrowed
          ? {
              label: "Baixas todas",
              detail: countLabel(recentBaixas(animals, BAIXA_FILTER_ALL).length),
              build: build(BAIXA_FILTER_ALL),
            }
          : undefined
      }
      hint="Mesmas colunas e ordem da tabela."
    />
  );
}
