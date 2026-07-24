/**
 * LOCAL pure helpers of the Dashboard: composition/presentation specific to
 * this screen. No new business rule — the shared functions (isFootAndMouth,
 * scheduledTreatmentsInWindow, herdAverageAdg) live in lib/domain.
 */
import type { Category, Treatment } from "@/lib/types";
import { parseISODate } from "@/lib/domain/dates";
import { CATEGORY_LABEL, pluralCategory } from "@/lib/domain/labels";

/** Default window (days) of the health calendar and the treatments KPI. */
export const CALENDAR_WINDOW_DAYS = 30;

const SHORT_WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;

/** Category label with initial capital, e.g.: "Novilha". */
export function categoryLabel(category: Category): string {
  return CATEGORY_LABEL[category];
}

/** Short pt-BR weekday of an ISO date, e.g.: "sex". */
export function shortWeekday(iso: string): string {
  return SHORT_WEEKDAYS[parseISODate(iso).getDay()];
}

/** Group of treatments of the same date. */
export interface GroupByDate {
  date: string;
  items: Treatment[];
}

/** Groups treatments (already sorted) by date, preserving the order. */
export function groupByDate(treatments: Treatment[]): GroupByDate[] {
  const groups: GroupByDate[] = [];
  for (const t of treatments) {
    const last = groups[groups.length - 1];
    if (last && last.date === t.date) last.items.push(t);
    else groups.push({ date: t.date, items: [t] });
  }
  return groups;
}

/**
 * Mini-summary by category, sorted by descending count and omitting zeros,
 * e.g.: "13 vacas · 9 bois · 8 bezerros".
 */
export function summaryByCategory(count: Record<Category, number>): string {
  return (Object.entries(count) as [Category, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([category, n]) => `${n} ${pluralCategory(category, n)}`)
    .join(" · ");
}
