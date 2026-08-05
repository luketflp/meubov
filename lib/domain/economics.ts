/**
 * Real-data economics of the farm: revenue×cost series, cost breakdown and
 * livestock indicators derived from movements, treatments and expenses.
 *
 * Conventions:
 * - Revenue = sale movements with `amountBrl` (legacy/valueless rows are
 *   excluded). Purchases are capital, not monthly cost — they feed
 *   `averageCalfPrice`, never the cost series.
 * - Cost = expenses + DONE treatments' `costBrl` (the "health" bucket).
 * - Every indicator returns `number | null`; null means "insufficient data"
 *   and the UI renders "—" instead of a fake number.
 */
import type {
  Animal,
  Expense,
  ExpenseCategory,
  Movement,
  Treatment,
} from "@/lib/types";
import { daysBetween, monthYearLabel, parseISODate, toISO } from "@/lib/domain/dates";
import { currentWeight, kgToArroba } from "@/lib/domain/weights";

/** One month of consolidated revenue × cost (date = first day of the month). */
export interface MonthlyRevenueCost {
  date: string;
  /** Month label, e.g.: "mai/26". */
  month: string;
  revenue: number;
  cost: number;
}

/** One slice of the cost breakdown. */
export interface CostBreakdownSlice {
  category: ExpenseCategory;
  amountBrl: number;
  /** Share of the total cost, in % (0-100). */
  pct: number;
}

/** Days of the rolling window used by the annual indicators. */
const YEAR_DAYS = 365;

/** True when the ISO date falls in the rolling year ending at refIso. */
const inLastYear = (iso: string, refIso: string): boolean =>
  iso <= refIso && daysBetween(iso, refIso) < YEAR_DAYS;

/** First day (ISO) of the month `back` months before refIso's month. */
function monthStart(refIso: string, back: number): string {
  const ref = parseISODate(refIso);
  return toISO(new Date(ref.getFullYear(), ref.getMonth() - back, 1));
}

/** A sale with a recorded value (the only rows that count as revenue). */
const isPricedSale = (m: Movement): m is Movement & { amountBrl: number } =>
  m.type === "sale" && m.amountBrl !== undefined;

/** A done treatment with a recorded cost (the "health" cost rows). */
const isCostedTreatment = (t: Treatment): t is Treatment & { costBrl: number } =>
  t.status === "done" && t.costBrl !== undefined;

/**
 * Consolidated revenue × cost of the last `months` calendar months ending at
 * refIso's month. Months without records stay at zero.
 */
export function monthlyRevenueCost(
  movements: Movement[],
  treatments: Treatment[],
  expenses: Expense[],
  months: number,
  refIso: string
): MonthlyRevenueCost[] {
  const buckets = new Map<string, MonthlyRevenueCost>();
  const series: MonthlyRevenueCost[] = [];
  for (let back = months - 1; back >= 0; back--) {
    const date = monthStart(refIso, back);
    const entry: MonthlyRevenueCost = {
      date,
      month: monthYearLabel(date),
      revenue: 0,
      cost: 0,
    };
    buckets.set(date.slice(0, 7), entry);
    series.push(entry);
  }

  for (const m of movements) {
    if (!isPricedSale(m)) continue;
    const bucket = buckets.get(m.date.slice(0, 7));
    if (bucket) bucket.revenue += m.amountBrl;
  }
  for (const e of expenses) {
    const bucket = buckets.get(e.date.slice(0, 7));
    if (bucket) bucket.cost += e.amountBrl;
  }
  for (const t of treatments) {
    if (!isCostedTreatment(t)) continue;
    const bucket = buckets.get(t.date.slice(0, 7));
    if (bucket) bucket.cost += t.costBrl;
  }
  return series;
}

/**
 * Cost split by category between two ISO dates (both inclusive). Done
 * treatments' costs land in the "health" bucket. Zero slices are dropped;
 * empty array when there is no cost at all.
 */
export function costBreakdownBetween(
  expenses: Expense[],
  treatments: Treatment[],
  startIso: string,
  endIso: string
): CostBreakdownSlice[] {
  const totals = new Map<ExpenseCategory, number>();
  const add = (category: ExpenseCategory, amount: number): void => {
    totals.set(category, (totals.get(category) ?? 0) + amount);
  };

  for (const e of expenses) {
    if (e.date >= startIso && e.date <= endIso) add(e.category, e.amountBrl);
  }
  for (const t of treatments) {
    if (isCostedTreatment(t) && t.date >= startIso && t.date <= endIso) {
      add("health", t.costBrl);
    }
  }

  const total = [...totals.values()].reduce((sum, v) => sum + v, 0);
  if (total === 0) return [];
  return [...totals.entries()]
    .filter(([, amount]) => amount > 0)
    .map(([category, amountBrl]) => ({
      category,
      amountBrl,
      pct: (amountBrl / total) * 100,
    }))
    .sort((a, b) => b.amountBrl - a.amountBrl);
}

/**
 * Cost split over the last `months` calendar months ending at refIso's month.
 */
export function costBreakdown(
  expenses: Expense[],
  treatments: Treatment[],
  months: number,
  refIso: string
): CostBreakdownSlice[] {
  return costBreakdownBetween(expenses, treatments, monthStart(refIso, months - 1), refIso);
}

/** Total cost (expenses + done treatments) of the rolling year ending at refIso. */
export function totalCostLast12m(
  expenses: Expense[],
  treatments: Treatment[],
  refIso: string
): number {
  let total = 0;
  for (const e of expenses) if (inLastYear(e.date, refIso)) total += e.amountBrl;
  for (const t of treatments) {
    if (isCostedTreatment(t) && inLastYear(t.date, refIso)) total += t.costBrl;
  }
  return total;
}

/** Revenue (priced sales) of the rolling year ending at refIso. */
export function annualRevenue(movements: Movement[], refIso: string): number {
  let total = 0;
  for (const m of movements) {
    if (isPricedSale(m) && inLastYear(m.date, refIso)) total += m.amountBrl;
  }
  return total;
}

/**
 * Heads sold in the rolling year ending at refIso (all sales count). Legacy
 * rows with no head count contribute nothing — they have no animals to count.
 */
export function headSoldLast12m(movements: Movement[], refIso: string): number {
  let total = 0;
  for (const m of movements) {
    if (m.type === "sale" && inLastYear(m.date, refIso)) total += m.quantity ?? 0;
  }
  return total;
}

/**
 * Average calf purchase price (R$/head) over the rolling year: priced calf
 * purchases only; null when there is none.
 */
export function averageCalfPrice(movements: Movement[], refIso: string): number | null {
  let amount = 0;
  let heads = 0;
  for (const m of movements) {
    if (
      m.type === "purchase" &&
      m.category === "calf" &&
      m.amountBrl !== undefined &&
      m.quantity !== undefined &&
      inLastYear(m.date, refIso)
    ) {
      amount += m.amountBrl;
      heads += m.quantity;
    }
  }
  return heads === 0 ? null : amount / heads;
}

/**
 * Mean current weight (in arrobas) of the active weighed steers; null when
 * no steer has a weighing.
 */
export function averageArrobasPerSteer(animals: Animal[]): number | null {
  const arrobas: number[] = [];
  for (const a of animals) {
    if (!a.active || a.category !== "steer") continue;
    const weight = currentWeight(a);
    if (weight !== null) arrobas.push(kgToArroba(weight));
  }
  if (arrobas.length === 0) return null;
  return arrobas.reduce((sum, v) => sum + v, 0) / arrobas.length;
}

/**
 * Estimated arrobas produced per year: heads sold × average steer arrobas.
 * An ESTIMATE — sales don't persist the sold animals' weights. 0 when nothing
 * was sold; null when the herd has no weighed steer to base the estimate on.
 */
export function arrobasProducedPerYear(
  movements: Movement[],
  animals: Animal[],
  refIso: string
): number | null {
  const sold = headSoldLast12m(movements, refIso);
  if (sold === 0) return 0;
  const avg = averageArrobasPerSteer(animals);
  if (avg === null) return null;
  return sold * avg;
}

/** Daily cost per head (R$/head/day); null without herd or without costs. */
export function dailyCostPerHead(
  totalCost12m: number,
  activeHeadCount: number
): number | null {
  if (activeHeadCount === 0 || totalCost12m === 0) return null;
  return totalCost12m / YEAR_DAYS / activeHeadCount;
}

/** Production cost per arroba (R$/@); null without costs or production. */
export function productionCostPerArroba(
  totalCost12m: number,
  arrobasProduced: number | null
): number | null {
  if (totalCost12m === 0 || arrobasProduced === null || arrobasProduced === 0) {
    return null;
  }
  return totalCost12m / arrobasProduced;
}

/** Annual offtake rate (%): heads sold over total active heads; null without herd. */
export function offtakeRate(headSold: number, totalHeads: number): number | null {
  if (totalHeads === 0) return null;
  return (headSold / totalHeads) * 100;
}

/** Productivity (@/ha/year); null without production estimate or land. */
export function productivityPerHa(
  arrobasProduced: number | null,
  totalHectares: number
): number | null {
  if (arrobasProduced === null || totalHectares === 0) return null;
  return arrobasProduced / totalHectares;
}

/** Capital turnover: annual revenue over herd value; null when either is missing. */
export function capitalTurnoverRatio(
  annualRevenueBrl: number,
  totalHerdValue: number | null
): number | null {
  if (totalHerdValue === null || totalHerdValue === 0 || annualRevenueBrl === 0) {
    return null;
  }
  return annualRevenueBrl / totalHerdValue;
}

/**
 * Fat-steer to calf exchange: how many calves one finished steer buys.
 * Null when the quote, the steer arrobas or the calf price is unknown.
 */
export function steerToCalfExchange(
  arrobaPrice: number | null,
  averageSteerArrobas: number | null,
  calfPrice: number | null
): number | null {
  if (arrobaPrice === null || averageSteerArrobas === null || calfPrice === null || calfPrice === 0) {
    return null;
  }
  return (averageSteerArrobas * arrobaPrice) / calfPrice;
}
