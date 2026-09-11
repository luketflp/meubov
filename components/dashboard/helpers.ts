/**
 * LOCAL pure helpers of the Dashboard: composition/presentation specific to
 * this screen. No new business rule — the shared functions (isFootAndMouth,
 * scheduledTreatmentsInWindow, herdAverageAdg) live in lib/domain.
 */
import type { Category } from "@/lib/types";
import { CATEGORY_LABEL, pluralCategory } from "@/lib/domain/labels";

/** Category label with initial capital, e.g.: "Novilha". */
export function categoryLabel(category: Category): string {
  return CATEGORY_LABEL[category];
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
