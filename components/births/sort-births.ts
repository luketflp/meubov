/**
 * Pure sort functions for the Nascimentos table, with the same header click
 * cycle as the Rebanho table.
 */
import type { Birth } from "@/lib/store/selectors";
import { SEX_LABEL } from "@/lib/domain/labels";

/** Sortable columns of the births table. */
export type BirthSortColumn = "date" | "calf" | "sex" | "dam" | "lot" | "breed" | "weight";

/** Table sort state. */
export interface BirthSort {
  column: BirthSortColumn;
  direction: "asc" | "desc";
}

/** Default sort: newest first. */
export const DEFAULT_BIRTH_SORT: BirthSort = { column: "date", direction: "desc" };

const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

function compareDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareByColumn(
  a: Birth,
  b: Birth,
  column: BirthSortColumn,
  lotNames: ReadonlyMap<string, string>
): number {
  switch (column) {
    case "date":
      return compareDates(a.date, b.date);
    case "calf":
      return collator.compare(a.calf?.earTag ?? a.calfEarTag, b.calf?.earTag ?? b.calfEarTag);
    case "sex":
      return collator.compare(
        a.calf ? SEX_LABEL[a.calf.sex] : "",
        b.calf ? SEX_LABEL[b.calf.sex] : ""
      );
    case "dam":
      return collator.compare(a.dam.earTag, b.dam.earTag);
    case "lot":
      return collator.compare(lotNames.get(a.dam.lotId) ?? "", lotNames.get(b.dam.lotId) ?? "");
    case "breed":
      return collator.compare(a.calf?.breed ?? "", b.calf?.breed ?? "");
    case "weight":
      return (a.birthWeightKg ?? -1) - (b.birthWeightKg ?? -1);
  }
}

/**
 * Sorts the births by column/direction, with a stable tiebreak newest first,
 * then by calf ear tag. Does not mutate the received list.
 */
export function sortBirths(
  births: Birth[],
  sort: BirthSort,
  lotNames: ReadonlyMap<string, string>
): Birth[] {
  const sign = sort.direction === "asc" ? 1 : -1;
  return [...births].sort(
    (a, b) =>
      sign * compareByColumn(a, b, sort.column, lotNames) ||
      compareDates(b.date, a.date) ||
      collator.compare(a.calfEarTag, b.calfEarTag)
  );
}

/**
 * Header click cycle: new column -> asc; asc -> desc; desc -> back to the
 * default sort (newest first). The date column just flips.
 */
export function nextBirthSort(current: BirthSort, column: BirthSortColumn): BirthSort {
  if (current.column !== column) return { column, direction: "asc" };
  if (column === DEFAULT_BIRTH_SORT.column) {
    return { column, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  if (current.direction === "asc") return { column, direction: "desc" };
  return { ...DEFAULT_BIRTH_SORT };
}
