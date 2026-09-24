/**
 * The lote and categoria filters of the "Iniciar manejo" animal list, several
 * of each at once. An empty pick means every lote (or every categoria), so the
 * dialog opens on the whole herd.
 */
import type { Category } from "@/lib/types";

export interface PickerFilters {
  lotIds: string[];
  categories: Category[];
}

type Filterable = { lotId: string; category: Category };

/** In one of the picked lotes and one of the picked categorias. */
export function matchesPicker(animal: Filterable, { lotIds, categories }: PickerFilters): boolean {
  return (
    (lotIds.length === 0 || lotIds.includes(animal.lotId)) &&
    (categories.length === 0 || categories.includes(animal.category))
  );
}

function countBy<K>(animals: readonly Filterable[], key: (a: Filterable) => K, keep: (a: Filterable) => boolean) {
  const counts = new Map<K, number>();
  for (const animal of animals) {
    if (!keep(animal)) continue;
    const k = key(animal);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

/** Animals of each lote inside the picked categorias: the numbers of the Lote menu. */
export function lotCounts(animals: readonly Filterable[], categories: Category[]): Map<string, number> {
  return countBy(animals, (a) => a.lotId, (a) => matchesPicker(a, { lotIds: [], categories }));
}

/** Animals of each categoria inside the picked lotes: the numbers of the Categoria menu. */
export function categoryCounts(animals: readonly Filterable[], lotIds: string[]): Map<Category, number> {
  return countBy(animals, (a) => a.category, (a) => matchesPicker(a, { lotIds, categories: [] }));
}

/**
 * What the menu's button reads: the all option, one pick in full
 * ("Recria · Inv. 04"), two by their short names ("Recria, Garrotes"), then a
 * count ("3 lotes").
 */
export function pickedLabel(
  names: string[],
  shortNames: string[],
  allLabel: string,
  plural: string
): string {
  if (names.length === 0) return allLabel;
  if (names.length === 1) return names[0];
  if (names.length === 2) return shortNames.join(", ");
  return `${names.length} ${plural}`;
}

/** The pick with the value added, or taken out when it was there. */
export function togglePicked<T>(picked: T[], value: T): T[] {
  return picked.includes(value) ? picked.filter((v) => v !== value) : [...picked, value];
}
