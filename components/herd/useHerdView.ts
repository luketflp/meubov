"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { nextSort, type HerdFilters, type SortColumn } from "@/components/herd/filters";
import { pageAfterResize, type PageSize } from "@/components/herd/pagination";
import {
  parseHerdView,
  serializeHerdView,
  type HerdView,
} from "@/components/herd/view-params";

/** Pause after the last keystroke before the search reaches the URL (and the list). */
const SEARCH_DELAY_MS = 250;

/** Filters written to the URL as soon as they change (the search waits for typing to stop). */
const SELECT_FILTERS = ["category", "lotId", "status"] as const;

/**
 * The Herd screen's view, kept in the URL query with `history.replaceState`:
 * no server round trip and no history entry per change, while going back from
 * an animal's record still restores the exact view.
 *
 * Handlers read the latest query from `window.location` rather than the
 * rendered one, because Next applies a replaced URL in a transition and two
 * quick changes would otherwise overwrite each other.
 */
export function useHerdView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const view = useMemo(() => parseHerdView(new URLSearchParams(query)), [query]);

  // The search box types into local state; the URL catches up after a pause.
  const [searchText, setSearchText] = useState(view.filters.search);
  const [writtenSearch, setWrittenSearch] = useState(view.filters.search);
  const [seenSearch, setSeenSearch] = useState(view.filters.search);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // The URL's search changed without this screen writing it (the sidebar's
  // Rebanho link, for one): the box follows the URL.
  if (view.filters.search !== seenSearch) {
    setSeenSearch(view.filters.search);
    if (view.filters.search !== writtenSearch) setSearchText(view.filters.search);
  }

  useEffect(() => {
    const timer = searchTimer;
    return () => clearTimeout(timer.current);
  }, []);

  const replaceView = useCallback(
    (next: HerdView): void => {
      const nextQuery = serializeHerdView(next);
      window.history.replaceState(null, "", nextQuery === "" ? pathname : `${pathname}?${nextQuery}`);
    },
    [pathname]
  );

  const latestView = (): HerdView => parseHerdView(new URLSearchParams(window.location.search));

  const setFilters = (next: HerdFilters): void => {
    const changed = SELECT_FILTERS.filter((key) => next[key] !== view.filters[key]);
    const searchChanged = next.search !== searchText;
    if (searchChanged) setSearchText(next.search);
    clearTimeout(searchTimer.current);

    const write = (search: string): void => {
      const latest = latestView();
      const filters = { ...latest.filters, search };
      for (const key of changed) Object.assign(filters, { [key]: next[key] });
      // Trailing spaces do not change the result, so they keep the page.
      const sameResult = changed.length === 0 && search.trim() === latest.filters.search.trim();
      setWrittenSearch(search);
      replaceView({ ...latest, filters, page: sameResult ? latest.page : 1 });
    };

    // An emptied search (the "Limpar filtros" button, for one) applies at once.
    if (changed.length > 0 || (searchChanged && next.search === "")) {
      write(next.search);
    } else if (searchChanged) {
      const searchWhenTyped = latestView().filters.search;
      searchTimer.current = setTimeout(() => {
        // The URL's search changed elsewhere while typing (the sidebar's
        // Rebanho link, for one): that change wins over the typed text.
        if (latestView().filters.search !== searchWhenTyped) return;
        write(next.search);
      }, SEARCH_DELAY_MS);
    }
  };

  const sortBy = (column: SortColumn): void => {
    const latest = latestView();
    replaceView({ ...latest, sort: nextSort(latest.sort, column), page: 1 });
  };

  const goToPage = (page: number): void => {
    replaceView({ ...latestView(), page });
    window.scrollTo({ top: 0 });
  };

  /** Changes the page size while keeping `firstVisible` (1-based) on screen. */
  const setPageSize = (pageSize: PageSize, firstVisible: number): void => {
    replaceView({ ...latestView(), pageSize, page: pageAfterResize(firstVisible, pageSize) });
  };

  return { view, searchText, setFilters, sortBy, goToPage, setPageSize, replaceView };
}
