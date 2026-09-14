/**
 * Pure pagination functions for the Herd screen.
 * The whole herd is already in memory, so pages only slice what is drawn.
 */
import { formatNumber } from "@/lib/domain/format";

/** Page sizes offered in the "Por página" select. */
export const PAGE_SIZES = [25, 50, 100] as const;

/** One of the offered page sizes. */
export type PageSize = (typeof PAGE_SIZES)[number];

/** Page size when the URL does not ask for another one. */
export const DEFAULT_PAGE_SIZE: PageSize = 50;

/** Slot of the page window that stands for two or more hidden pages. */
export const ELLIPSIS = "ellipsis";

/** A page number or the ellipsis, in the order the pager draws them. */
export type PageSlot = number | typeof ELLIPSIS;

/** One page of a list, with the 1-based range it covers ("51–100 de 105"). */
export interface Page<T> {
  items: T[];
  page: number;
  pageCount: number;
  from: number;
  to: number;
  total: number;
}

/**
 * Slots of the page window: the first and last page, the current page with
 * one neighbour on each side, and the ellipses between them. Past seven pages
 * the window keeps exactly seven slots, so the buttons never shift under the
 * pointer while paging.
 */
const WINDOW_SLOTS = 7;

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Number of pages for a list, never less than one (an empty list has one empty page). */
export function pageCountFor(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/**
 * Cuts one page out of the list. A page outside the list (a stale URL, or
 * animals removed while on the last page) is clamped to the nearest real page.
 */
export function paginate<T>(items: readonly T[], page: number, pageSize: number): Page<T> {
  const total = items.length;
  const pageCount = pageCountFor(total, pageSize);
  const current = clamp(page, 1, pageCount);
  const start = (current - 1) * pageSize;
  const slice = items.slice(start, start + pageSize);
  return {
    items: slice,
    page: current,
    pageCount,
    from: total === 0 ? 0 : start + 1,
    to: start + slice.length,
    total,
  };
}

/**
 * Page numbers and ellipses to draw, e.g. page 10 of 20 gives
 * `1 … 9 10 11 … 20`. An ellipsis always hides at least two pages: when it
 * would hide one, that page's number is shown instead.
 */
export function pageWindow(current: number, pageCount: number): PageSlot[] {
  if (pageCount <= WINDOW_SLOTS) return range(1, pageCount);

  const page = clamp(current, 1, pageCount);
  // Five slots stay between the two boundary pages; with both ellipses shown,
  // three of them are the current page and its neighbours.
  const hidesHead = page > 4;
  const hidesTail = page < pageCount - 3;

  if (!hidesHead) return [...range(1, 5), ELLIPSIS, pageCount];
  if (!hidesTail) return [1, ELLIPSIS, ...range(pageCount - 4, pageCount)];
  return [1, ELLIPSIS, page - 1, page, page + 1, ELLIPSIS, pageCount];
}

/** Pager caption, e.g. "51–100 de 1.234 animais". */
export function rangeLabel(from: number, to: number, total: number): string {
  const noun = total === 1 ? "animal" : "animais";
  return `${formatNumber(from)}–${formatNumber(to)} de ${formatNumber(total)} ${noun}`;
}

/**
 * Page that holds the first animal on screen once the page size changes, so
 * switching from 50 to 100 keeps the reader where they were.
 */
export function pageAfterResize(firstVisible: number, pageSize: number): number {
  if (firstVisible < 1) return 1;
  return Math.floor((firstVisible - 1) / pageSize) + 1;
}
