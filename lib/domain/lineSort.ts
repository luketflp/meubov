/**
 * Sorting the animal lines of a table by one column, with the same header click
 * cycle as the Rebanho and Nascimentos tables: a new column sorts ascending, a
 * second click descending, a third returns the lines to their own order.
 */

/** What a column sorts by; null, "" or the tables' "—" for a cell with nothing in it. */
export type SortValue = string | number | null;

/** The column a table is sorted by, named by its key (the header). */
export interface LineSort {
  key: string;
  direction: "asc" | "desc";
}

const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

const isEmpty = (value: SortValue): boolean => value === null || value === "" || value === "—";

/**
 * The lines ordered by `value`; empty values always last, ties keep the order
 * they came in. Does not mutate the received list.
 */
export function sortLines<T>(
  lines: readonly T[],
  value: (line: T) => SortValue,
  direction: LineSort["direction"]
): T[] {
  const sign = direction === "asc" ? 1 : -1;
  return lines
    .map((line) => ({ line, value: value(line) }))
    .sort((a, b) => {
      if (isEmpty(a.value) || isEmpty(b.value)) {
        return Number(isEmpty(a.value)) - Number(isEmpty(b.value));
      }
      const order =
        typeof a.value === "number" && typeof b.value === "number"
          ? a.value - b.value
          : collator.compare(String(a.value), String(b.value));
      return sign * order;
    })
    .map((entry) => entry.line);
}

/** Header click cycle: new column asc; asc → desc; desc → no sort. */
export function nextLineSort(current: LineSort | null, key: string): LineSort | null {
  if (current?.key !== key) return { key, direction: "asc" };
  return current.direction === "asc" ? { key, direction: "desc" } : null;
}
