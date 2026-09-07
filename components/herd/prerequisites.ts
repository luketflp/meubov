/**
 * What a farm must already have before a single animal can be registered.
 *
 * Raça and Lote are required fields fed by farm-scoped lists, so on a farm that
 * has not registered a breed — or has not put any lot in an invernada — both
 * dropdowns open empty. Without this the form only says "Selecione a raça",
 * blaming the user for not picking from a list with nothing in it.
 *
 * The bulk import has no such dead end: it creates the missing breeds and lots
 * from the spreadsheet itself.
 */
import type { Lot } from "@/lib/types";

/** A message per field that cannot be filled yet; null when the field is usable. */
export interface AnimalPrerequisiteHints {
  breed: string | null;
  lot: string | null;
}

/**
 * Reads the farm's breeds and lots, where `placedLots` are the ones with an
 * open invernada placement (the only ones a new animal may join).
 */
export function animalPrerequisites(
  breeds: readonly string[],
  lots: readonly Lot[],
  placedLots: readonly Lot[]
): AnimalPrerequisiteHints {
  return {
    breed:
      breeds.length > 0
        ? null
        : "Cadastre uma raça nas Configurações antes de cadastrar o animal.",
    lot: lotHint(lots, placedLots),
  };
}

/**
 * A farm with lots that sit in no invernada needs a placement, not another lot
 * — pointing it at "cadastre um lote" would send it round in circles.
 */
function lotHint(lots: readonly Lot[], placedLots: readonly Lot[]): string | null {
  if (placedLots.length > 0) return null;
  return lots.length === 0
    ? "Cadastre um lote em Lotes antes de cadastrar o animal."
    : "Nenhum lote está em uma invernada. Coloque um em Lotes antes de cadastrar o animal.";
}

/** True while something is missing, so the form must not accept a submit. */
export function blocksRegistration(hints: AnimalPrerequisiteHints): boolean {
  return hints.breed !== null || hints.lot !== null;
}
