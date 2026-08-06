/**
 * Pure location validation for bulk herd imports.
 *
 * A spreadsheet names logical lots and identifies physical invernadas by their
 * fixed codes. This resolver makes the relationship explicit before a database
 * transaction creates anything: every referenced code must exist, each batch
 * lot must have one destination, and an existing lot must already be there.
 */

export interface ImportLocationRow {
  lot: string;
  invernada: string;
}

export interface ImportLocationInvernada {
  id: string;
  code: string;
}

export interface ExistingImportLot {
  name: string;
  currentInvernadaId?: string;
}

export type ImportLocationError =
  | { error: "invernada_not_found"; codes: string[] }
  | { error: "lot_invernada_conflict"; lots: string[] };

export type ImportLocationResolution =
  | { ok: true; destinationByLotName: Map<string, string> }
  | ({ ok: false } & ImportLocationError);

export function resolveImportLocations(
  rows: readonly ImportLocationRow[],
  existingLots: readonly ExistingImportLot[],
  invernadas: readonly ImportLocationInvernada[]
): ImportLocationResolution {
  const invernadaByCode = new Map(
    invernadas.map((invernada) => [invernada.code, invernada.id])
  );
  const missingCodes = [...new Set(rows.map((row) => row.invernada))]
    .filter((code) => !invernadaByCode.has(code))
    .sort();
  if (missingCodes.length > 0) {
    return { ok: false, error: "invernada_not_found", codes: missingCodes };
  }

  const destinationByLotName = new Map<string, string>();
  const conflictingLots = new Set<string>();
  for (const row of rows) {
    const destinationId = invernadaByCode.get(row.invernada)!;
    const priorDestinationId = destinationByLotName.get(row.lot);
    if (priorDestinationId !== undefined && priorDestinationId !== destinationId) {
      conflictingLots.add(row.lot);
    } else {
      destinationByLotName.set(row.lot, destinationId);
    }
  }

  const currentLocationsByName = new Map<string, (string | undefined)[]>();
  for (const lot of existingLots) {
    const locations = currentLocationsByName.get(lot.name) ?? [];
    locations.push(lot.currentInvernadaId);
    currentLocationsByName.set(lot.name, locations);
  }
  for (const [lotName, destinationId] of destinationByLotName) {
    const currentLocations = currentLocationsByName.get(lotName);
    if (
      currentLocations !== undefined &&
      (currentLocations.length !== 1 || currentLocations[0] !== destinationId)
    ) {
      conflictingLots.add(lotName);
    }
  }

  if (conflictingLots.size > 0) {
    return {
      ok: false,
      error: "lot_invernada_conflict",
      lots: [...conflictingLots].sort(),
    };
  }
  return { ok: true, destinationByLotName };
}
