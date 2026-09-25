/**
 * Financial indicators for beef cattle ranching.
 */

/** Half-open-agnostic date window, ISO strings "YYYY-MM-DD" (both inclusive). */
export interface Period {
  start: string;
  end: string;
}

/**
 * Keeps only the entries whose ISO `date` falls inside [period.start, period.end]
 * (both ends inclusive). Pure and allocation-light: ISO "YYYY-MM-DD" strings sort
 * lexicographically the same as chronologically, so a plain string compare is safe.
 *
 * Generic over any record carrying a `date: string` field, so it filters both a
 * monthly revenue series and any other dated illustrative series without coupling
 * to a concrete row shape.
 */
export function filterMonthlyByPeriod<T extends { date: string }>(
  series: readonly T[],
  period: Period
): T[] {
  return series.filter((item) => item.date >= period.start && item.date <= period.end);
}

/** Consolidated financial result of a period. */
export interface PeriodResult {
  totalRevenue: number;
  totalCost: number;
  /** Revenue minus cost. */
  result: number;
  /** Result over revenue, in % (0 when there is no revenue). */
  netMarginPct: number;
}

/** Herd market value: total arrobas x arroba price (R$). */
export function herdValue(totalArrobas: number, arrobaPrice: number): number {
  return totalArrobas * arrobaPrice;
}

/**
 * Consolidates revenues and costs of a period, with net margin percentage.
 */
export function periodResult(revenues: number[], costs: number[]): PeriodResult {
  const totalRevenue = revenues.reduce((sum, r) => sum + r, 0);
  const totalCost = costs.reduce((sum, c) => sum + c, 0);
  const result = totalRevenue - totalCost;
  return {
    totalRevenue,
    totalCost,
    result,
    netMarginPct: totalRevenue === 0 ? 0 : (result / totalRevenue) * 100,
  };
}
