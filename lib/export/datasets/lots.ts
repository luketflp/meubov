/**
 * Lotes and pesagens as tables: the /lots index read by invernada, the name of
 * the invernada each lot stands on, and every weighing of the herd.
 */
import type { Animal, Invernada, LotPlacement } from "@/lib/types";
import type { LotsByInvernada } from "@/lib/store/selectors";
import { buildTable, type ExportTable } from "@/lib/export/table";
import { weighingGains } from "@/lib/export/datasets/animal";

/** "01 · Baixada", or just the code when the invernada has no name. */
export function invernadaLabel(invernada: Pick<Invernada, "code" | "name">): string {
  return `${invernada.code}${invernada.name ? ` · ${invernada.name}` : ""}`;
}

/** The current invernada of each lot, keyed by lot id, as the herd tables name it. */
export function currentInvernadaNames(
  invernadas: readonly Invernada[],
  lotPlacements: readonly LotPlacement[]
): Map<string, string> {
  const byId = new Map(invernadas.map((invernada) => [invernada.id, invernada]));
  return new Map(
    lotPlacements
      .filter((placement) => placement.endedOn === undefined)
      .map((placement) => {
        const invernada = byId.get(placement.invernadaId);
        return [placement.lotId, invernada ? invernadaLabel(invernada) : "—"] as const;
      })
  );
}

interface LotRow {
  code: string | null;
  name: string | null;
  hectares: number | null;
  lot: string | null;
  heads: number | null;
  auPerHa: number | null;
  since: string | null;
}

/**
 * The /lots index as one table, in its order: each occupied invernada with its
 * lotes (UA/ha of the whole invernada), then the free invernadas, then the
 * encerrados, which stand on no invernada.
 */
export function lotsExportTable(view: LotsByInvernada, title = "Lotes"): ExportTable {
  const rows: LotRow[] = [
    ...view.sections.flatMap((section) =>
      section.lots.map(
        (row): LotRow => ({
          code: section.invernada.code,
          name: section.invernada.name ?? null,
          hectares: section.invernada.hectares,
          lot: row.lot.name,
          heads: row.heads,
          auPerHa: section.auPerHa,
          since: row.placement?.startedOn ?? null,
        })
      )
    ),
    ...view.free.map(
      ({ invernada }): LotRow => ({
        code: invernada.code,
        name: invernada.name ?? null,
        hectares: invernada.hectares,
        lot: null,
        heads: 0,
        auPerHa: 0,
        since: null,
      })
    ),
    ...view.closed.map(
      (row): LotRow => ({
        code: null,
        name: null,
        hectares: null,
        lot: row.lot.name,
        heads: row.heads,
        auPerHa: null,
        since: null,
      })
    ),
  ];

  return buildTable(
    title,
    [
      { header: "Invernada (código)", value: (r) => r.code },
      { header: "Invernada (nome)", value: (r) => r.name },
      { header: "Área (ha)", kind: "number", decimals: 1, value: (r) => r.hectares },
      { header: "Lote", value: (r) => r.lot },
      { header: "Cabeças", kind: "number", value: (r) => r.heads },
      { header: "UA/ha", kind: "number", decimals: 2, value: (r) => r.auPerHa },
      { header: "Desde", kind: "date", value: (r) => r.since },
    ],
    rows
  );
}

/**
 * Every weighing of every animal given, in the animals' order and each one's
 * weighings oldest first: brinco, data, peso, lote atual and the GMD since the
 * animal's previous weighing.
 */
export function weighingsExportTable(
  animals: readonly Animal[],
  lotNames: ReadonlyMap<string, string>,
  title = "Pesagens"
): ExportTable {
  const rows = animals.flatMap((animal) => {
    const gains = weighingGains(animal.weighings);
    return animal.weighings.map((weighing, i) => ({ animal, weighing, gain: gains[i] }));
  });
  return buildTable(
    title,
    [
      { header: "Brinco", value: (r) => r.animal.earTag },
      { header: "Data", kind: "date", value: (r) => r.weighing.date },
      { header: "Peso (kg)", kind: "number", decimals: 1, value: (r) => r.weighing.weightKg },
      { header: "Lote atual", value: (r) => lotNames.get(r.animal.lotId) ?? null },
      { header: "GMD desde a anterior (kg/dia)", kind: "number", decimals: 3, value: (r) => r.gain },
    ],
    rows
  );
}
