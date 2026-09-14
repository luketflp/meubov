/**
 * The Herd screen's view (filters, sort, page, page size) read from and
 * written to the URL query, so going back from an animal's record or sharing
 * the link lands on the same view. Defaults are left out of the query.
 */
import type { AnimalStatus, Category } from "@/lib/types";
import {
  ANIMAL_STATUSES,
  CATEGORIES,
  DEFAULT_SORT,
  INITIAL_FILTERS,
  type HerdFilters,
  type HerdSort,
  type SortColumn,
} from "@/components/herd/filters";
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZES,
  type PageSize,
} from "@/components/herd/pagination";

/** Everything the Herd screen keeps in the URL. */
export interface HerdView {
  filters: HerdFilters;
  sort: HerdSort;
  page: number;
  pageSize: PageSize;
}

/** The view of a bare `/herd`. */
export const DEFAULT_VIEW: HerdView = {
  filters: INITIAL_FILTERS,
  sort: DEFAULT_SORT,
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
};

/** Query keys, in the order they are written. */
const KEY = {
  page: "pagina",
  pageSize: "por",
  search: "busca",
  category: "categoria",
  lot: "lote",
  status: "status",
  sort: "ordem",
} as const;

const SORT_COLUMNS: Record<SortColumn, true> = {
  earTag: true,
  category: true,
  breed: true,
  sex: true,
  birthDate: true,
  weight: true,
  lot: true,
  status: true,
};

function isSortColumn(value: string): value is SortColumn {
  return Object.hasOwn(SORT_COLUMNS, value);
}

function parsePage(value: string | null): number {
  if (value === null || !/^\d+$/.test(value)) return 1;
  return Math.max(1, Number(value));
}

function parsePageSize(value: string | null): PageSize {
  return PAGE_SIZES.find((size) => String(size) === value) ?? DEFAULT_PAGE_SIZE;
}

/** "weight-desc" -> { column: "weight", direction: "desc" }. */
function parseSort(value: string | null): HerdSort {
  if (value === null) return DEFAULT_SORT;
  const cut = value.lastIndexOf("-");
  const column = value.slice(0, cut);
  const direction = value.slice(cut + 1);
  if (cut < 0 || !isSortColumn(column) || (direction !== "asc" && direction !== "desc")) {
    return DEFAULT_SORT;
  }
  return { column, direction };
}

/** Reads the view from a query, falling back to the default for any value it does not know. */
export function parseHerdView(params: URLSearchParams): HerdView {
  const category = params.get(KEY.category);
  const status = params.get(KEY.status);
  return {
    filters: {
      search: params.get(KEY.search) ?? INITIAL_FILTERS.search,
      category: CATEGORIES.includes(category as Category)
        ? (category as Category)
        : INITIAL_FILTERS.category,
      lotId: params.get(KEY.lot) || INITIAL_FILTERS.lotId,
      status: ANIMAL_STATUSES.includes(status as AnimalStatus)
        ? (status as AnimalStatus)
        : INITIAL_FILTERS.status,
    },
    sort: parseSort(params.get(KEY.sort)),
    page: parsePage(params.get(KEY.page)),
    pageSize: parsePageSize(params.get(KEY.pageSize)),
  };
}

/** Writes the view as a query string without a leading "?"; the default view is "". */
export function serializeHerdView(view: HerdView): string {
  const params = new URLSearchParams();
  const { filters, sort } = view;
  if (view.page !== DEFAULT_VIEW.page) params.set(KEY.page, String(view.page));
  if (view.pageSize !== DEFAULT_VIEW.pageSize) params.set(KEY.pageSize, String(view.pageSize));
  if (filters.search.trim() !== "") params.set(KEY.search, filters.search);
  if (filters.category !== INITIAL_FILTERS.category) params.set(KEY.category, filters.category);
  if (filters.lotId !== INITIAL_FILTERS.lotId) params.set(KEY.lot, filters.lotId);
  if (filters.status !== INITIAL_FILTERS.status) params.set(KEY.status, filters.status);
  if (sort.column !== DEFAULT_SORT.column || sort.direction !== DEFAULT_SORT.direction) {
    params.set(KEY.sort, `${sort.column}-${sort.direction}`);
  }
  return params.toString();
}
