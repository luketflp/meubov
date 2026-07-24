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

/** Gross margin per sold arroba: arroba price minus cost per arroba (R$/@). */
export function grossMarginPerArroba(arrobaPrice: number, costPerArroba: number): number {
  return arrobaPrice - costPerArroba;
}

/**
 * Fat steer/calf exchange ratio: value of 1 fat steer (arrobas x arroba
 * price) divided by the calf price — how many calves 1 fat steer buys.
 */
export function steerToCalfRatio(
  arrobaPrice: number,
  fatSteerArrobas: number,
  calfPrice: number
): number {
  return (fatSteerArrobas * arrobaPrice) / calfPrice;
}

/**
 * Annual offtake rate in %: heads sold in the year over the total heads
 * of the herd (0 when the herd is empty).
 */
export function offtakeRatePct(headSoldPerYear: number, totalHeads: number): number {
  if (totalHeads === 0) return 0;
  return (headSoldPerYear / totalHeads) * 100;
}

/** Annual productivity: arrobas produced in the year per hectare of pasture. */
export function productivityArrobasPerHa(
  arrobasProducedPerYear: number,
  totalHectares: number
): number {
  if (totalHectares === 0) return 0;
  return arrobasProducedPerYear / totalHectares;
}

/**
 * Capital turnover: annual revenue over the value of the immobilized herd
 * (0 when the herd value is 0).
 */
export function capitalTurnover(annualRevenue: number, totalHerdValue: number): number {
  if (totalHerdValue === 0) return 0;
  return annualRevenue / totalHerdValue;
}
