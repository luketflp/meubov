/**
 * Pure filter, sort and label functions for the Herd screen.
 * No embedded state: they receive the data and return new collections (testable).
 */
import type { Category, AnimalStatus } from "@/lib/types";
import type { AnimalWithDerived } from "@/lib/store/selectors";
import { formatWeightWithArroba } from "@/lib/domain/weights";
import { CATEGORY_LABEL, SEX_LABEL_SHORT } from "@/lib/domain/labels";

/** Category value in the filter ("todas" disables the filter). */
export type CategoryFilter = Category | "todas";

/** Status value in the filter ("todos" disables the filter). */
export type StatusFilter = AnimalStatus | "todos";

/** Full state of the herd list filters. */
export interface HerdFilters {
  search: string;
  category: CategoryFilter;
  lotId: string;
  status: StatusFilter;
}

/** Sentinel value of the lot filter when no lot is selected. */
export const LOT_ALL = "todos";

/** Initial state (no active filter). */
export const INITIAL_FILTERS: HerdFilters = {
  search: "",
  category: "todas",
  lotId: LOT_ALL,
  status: "todos",
};

/** Sortable columns of the herd table. */
export type SortColumn =
  | "earTag"
  | "category"
  | "breed"
  | "sex"
  | "birthDate"
  | "weight"
  | "lot"
  | "status";

/** Sort direction. */
export type SortDirection = "asc" | "desc";

/** Table sort state. */
export interface HerdSort {
  column: SortColumn;
  direction: SortDirection;
}

/** Default sort: ear tag ascending. */
export const DEFAULT_SORT: HerdSort = { column: "earTag", direction: "asc" };

/** pt-BR labels of the categories (canonical from lib/domain). */
export const CATEGORY_LABELS = CATEGORY_LABEL;

/** pt-BR labels of the animal statuses (filter options). */
export const STATUS_LABELS: Record<AnimalStatus, string> = {
  healthy: "Saudável",
  attention: "Atenção",
  overdue: "Atrasado",
};

/** Short sex abbreviation shown in the table ("M"/"F", canonical from lib/domain). */
export const SEX_LABEL = SEX_LABEL_SHORT;

/** All categories, in the order shown in the select. */
export const CATEGORIES: readonly Category[] = ["calf", "heifer", "steer", "cow", "bull"];

/** All animal statuses, in the order shown in the select. */
export const ANIMAL_STATUSES: readonly AnimalStatus[] = ["healthy", "attention", "overdue"];

/** Increasing status severity (used to sort the Status column). */
const STATUS_ORDER: Record<AnimalStatus, number> = { healthy: 0, attention: 1, overdue: 2 };

const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

/** Normalizes text for search: lowercase and without accents. */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Indicates whether any filter differs from the initial state. */
export function hasActiveFilter(filters: HerdFilters): boolean {
  return (
    filters.search.trim() !== "" ||
    filters.category !== "todas" ||
    filters.lotId !== LOT_ALL ||
    filters.status !== "todos"
  );
}

/** Applies search (ear tag or breed), category, lot and status over the derived list. */
export function filterHerd(
  items: AnimalWithDerived[],
  filters: HerdFilters
): AnimalWithDerived[] {
  const term = normalize(filters.search.trim());
  return items.filter(({ animal, status }) => {
    if (
      term !== "" &&
      !normalize(animal.earTag).includes(term) &&
      !normalize(animal.breed).includes(term)
    ) {
      return false;
    }
    if (filters.category !== "todas" && animal.category !== filters.category) return false;
    if (filters.lotId !== LOT_ALL && animal.lotId !== filters.lotId) return false;
    if (filters.status !== "todos" && status !== filters.status) return false;
    return true;
  });
}

function compareByColumn(
  a: AnimalWithDerived,
  b: AnimalWithDerived,
  column: SortColumn,
  lotNames: ReadonlyMap<string, string>
): number {
  switch (column) {
    case "earTag":
      return collator.compare(a.animal.earTag, b.animal.earTag);
    case "category":
      return collator.compare(
        CATEGORY_LABELS[a.animal.category],
        CATEGORY_LABELS[b.animal.category]
      );
    case "breed":
      return collator.compare(a.animal.breed, b.animal.breed);
    case "sex":
      return collator.compare(SEX_LABEL[a.animal.sex], SEX_LABEL[b.animal.sex]);
    case "birthDate":
      return a.animal.birthDate < b.animal.birthDate
        ? -1
        : a.animal.birthDate > b.animal.birthDate
          ? 1
          : 0;
    case "weight":
      return (a.currentWeightKg ?? -1) - (b.currentWeightKg ?? -1);
    case "lot":
      return collator.compare(
        lotNames.get(a.animal.lotId) ?? "",
        lotNames.get(b.animal.lotId) ?? ""
      );
    case "status":
      return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  }
}

/**
 * Sorts the list by column/direction, with a stable tiebreak by ear tag asc.
 * Does not mutate the received list.
 */
export function sortHerd(
  items: AnimalWithDerived[],
  sort: HerdSort,
  lotNames: ReadonlyMap<string, string>
): AnimalWithDerived[] {
  const sign = sort.direction === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    const cmp = compareByColumn(a, b, sort.column, lotNames);
    if (cmp !== 0) return sign * cmp;
    return collator.compare(a.animal.earTag, b.animal.earTag);
  });
}

/**
 * Header click cycle: new column -> asc; asc -> desc;
 * desc -> back to the default sort (ear tag asc).
 */
export function nextSort(current: HerdSort, column: SortColumn): HerdSort {
  if (current.column !== column) return { column, direction: "asc" };
  if (current.direction === "asc") return { column, direction: "desc" };
  return { ...DEFAULT_SORT };
}

/** Composite weight "482 kg · 16,1 @", or "—" without a registered weighing. */
export function formatFullWeight(weightKg: number | null): string {
  if (weightKg === null) return "—";
  return formatWeightWithArroba(weightKg);
}

/** Header subtitle, e.g. "39 animais" or "39 animais · 4 filtrados". */
export function herdSubtitle(
  total: number,
  filtered: number,
  hasFilter: boolean
): string {
  const base = total === 1 ? "1 animal" : `${total} animais`;
  if (!hasFilter) return base;
  return `${base} · ${filtered} ${filtered === 1 ? "filtrado" : "filtrados"}`;
}
