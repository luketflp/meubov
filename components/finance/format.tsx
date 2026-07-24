/**
 * Local compact-formatting helpers for the Finance screen.
 * Presentation only: no business rule lives here.
 */
import { formatNumber } from "@/lib/domain/format";

const THOUSAND = 1_000;
const MILLION = 1_000_000;

/** Compacts a value without currency symbol: "80 mil", "1,2 mi" or "500". */
export function formatCompact(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= MILLION) return `${formatNumber(value / MILLION, 1)} mi`;
  if (absolute >= THOUSAND) return `${formatNumber(value / THOUSAND)} mil`;
  return formatNumber(value);
}

/** Compact currency for chart axes, e.g.: "R$ 80 mil". */
export function formatCompactCurrency(value: number): string {
  return `R$ ${formatCompact(value)}`;
}
