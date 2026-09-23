"use client";

/**
 * Exportar of the Manejo screen: the Histórico de manejos under the `tipo`
 * filter, and the whole history when the filter narrows it. Reads the query,
 * so it sits inside a Suspense boundary.
 */
import { useSearchParams } from "next/navigation";
import { ExportMenu } from "@/components/export/ExportMenu";
import {
  MANEJO_ACTION_LABEL,
  MANEJO_FILTER_ALL,
  manejoHistory,
  parseManejoFilter,
  type ManejoHistoryRow,
} from "@/components/manejo/helpers";
import { manejoHistoryExportTable } from "@/lib/export/datasets/manejo";
import { useHerdStore } from "@/lib/store/useHerdStore";

const countLabel = (n: number) => (n === 1 ? "1 manejo" : `${n} manejos`);

export function ManejoHistoryExport() {
  const treatments = useHerdStore((s) => s.treatments);
  const animals = useHerdStore((s) => s.animals);
  const manejoSessions = useHerdStore((s) => s.manejoSessions);
  const lots = useHerdStore((s) => s.lots);
  const filter = parseManejoFilter(useSearchParams().get("tipo"));

  const history = manejoHistory(treatments, animals, manejoSessions);
  const filtered = filter === MANEJO_FILTER_ALL ? history : history.filter((row) => row.kind === filter);
  const table = (rows: ManejoHistoryRow[]) => () => [manejoHistoryExportTable(rows, manejoSessions, lots)];
  const filters = filter === MANEJO_FILTER_ALL ? [] : [`Tipo: ${MANEJO_ACTION_LABEL[filter]}`];

  return (
    <ExportMenu
      title="Manejos"
      current={{
        label: "Filtro atual",
        detail: [countLabel(filtered.length), ...filters].join(" · "),
        filters,
        build: table(filtered),
      }}
      all={
        filter === MANEJO_FILTER_ALL
          ? undefined
          : { label: "Histórico todo", detail: countLabel(history.length), build: table(history) }
      }
      hint="O histórico de manejos, com lote, comprador ou vendedor, R$/@ e status."
    />
  );
}
