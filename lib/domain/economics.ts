/**
 * Economics of the farm over a window: the revenue × cost series of the
 * Painel, and the Placar of Financeiro (COE, @ produzidas, custo da @,
 * desembolso, desfrute, relação de troca, production system).
 *
 * Conventions:
 * - Windows are inclusive ISO dates. Competência uses `date`.
 * - Revenue = priced sale movements + receitas lançadas (`kind: "revenue"`).
 *   Purchases are capital, never cost.
 * - COE = despesas (`kind: "expense"`, paid or not) + DONE treatments' `costBrl`.
 * - Arrobas sold are carcass arrobas (kg × rendimento ÷ 15); bought and herd
 *   arrobas are live (kg ÷ 30).
 * - Every indicator returns `number | null`; null means "insufficient data"
 *   and the UI renders "—" instead of a fake number.
 */
import type {
  Animal,
  Expense,
  ExpenseCategory,
  Invernada,
  Lot,
  ManejoSession,
  Movement,
  Treatment,
} from "@/lib/types";
import { addDays, monthYearLabel, parseISODate, toISO } from "@/lib/domain/dates";
import { carcassArrobas, kgToArroba, totalWeightKg } from "@/lib/domain/weights";
import { passYieldPct } from "@/lib/domain/movements";
import { periodAdg } from "@/lib/domain/adg";
import { herdValue, type Period } from "@/lib/domain/finance";
import { annualise, inPeriod, periodDays } from "@/lib/domain/period";
import type { FarmSystem } from "@/lib/domain/benchmarks";
import { activeAnimals, herdStockingRateAuPerHa } from "@/lib/store/selectors";

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

/** Everything the window's figures are computed from (the store's slices). */
export interface EconomicsInputs {
  animals: Animal[];
  manejoSessions: ManejoSession[];
  movements: Movement[];
  treatments: Treatment[];
  expenses: Expense[];
  invernadas: Invernada[];
  lots: Lot[];
}

/** Average days in a month, to turn a window's days into months. */
const DAYS_PER_MONTH = 30.4375;

/** First day (ISO) of the month `back` months before refIso's month. */
function monthStart(refIso: string, back: number): string {
  const ref = parseISODate(refIso);
  return toISO(new Date(ref.getFullYear(), ref.getMonth() - back, 1));
}

/** A sale with a recorded value (the only movement rows that count as revenue). */
const isPricedSale = (m: Movement): m is Movement & { amountBrl: number } =>
  m.type === "sale" && m.amountBrl !== undefined;

/** A done treatment with a recorded cost (the "health" cost rows). */
const isCostedTreatment = (t: Treatment): t is Treatment & { costBrl: number } =>
  t.status === "done" && t.costBrl !== undefined;

const isRevenue = (e: Expense): boolean => e.kind === "revenue";

/**
 * Consolidated revenue × cost of the last `months` calendar months ending at
 * refIso's month. Receitas lançadas add to revenue and never to cost. Months
 * without records stay at zero.
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
    if (!bucket) continue;
    if (isRevenue(e)) bucket.revenue += e.amountBrl;
    else bucket.cost += e.amountBrl;
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
 * treatments' costs land in the "health" bucket; receitas are skipped. Zero
 * slices are dropped; empty array when there is no cost at all.
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
    if (!isRevenue(e) && e.date >= startIso && e.date <= endIso) add(e.category, e.amountBrl);
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

/** Cost split over the last `months` calendar months ending at refIso's month. */
export function costBreakdown(
  expenses: Expense[],
  treatments: Treatment[],
  months: number,
  refIso: string
): CostBreakdownSlice[] {
  return costBreakdownBetween(expenses, treatments, monthStart(refIso, months - 1), refIso);
}

/** COE of the window: despesas by `date`, paid or pending, plus done treatment costs. */
export function coe(expenses: Expense[], treatments: Treatment[], period: Period): number {
  let total = 0;
  for (const e of expenses) {
    if (!isRevenue(e) && inPeriod(e.date, period)) total += e.amountBrl;
  }
  for (const t of treatments) {
    if (isCostedTreatment(t) && inPeriod(t.date, period)) total += t.costBrl;
  }
  return total;
}

/** Revenue of the window: priced sales (`sales`) plus receitas lançadas (`other`). */
export function periodRevenue(
  expenses: Expense[],
  movements: Movement[],
  period: Period
): { total: number; sales: number; other: number } {
  let sales = 0;
  let other = 0;
  for (const m of movements) {
    if (isPricedSale(m) && inPeriod(m.date, period)) sales += m.amountBrl;
  }
  for (const e of expenses) {
    if (isRevenue(e) && inPeriod(e.date, period)) other += e.amountBrl;
  }
  return { total: sales + other, sales, other };
}

/** Weight (kg) of the animal's last weighing on or before the date, or null. */
function weightOnOrBefore(animal: Animal | undefined, dateIso: string): number | null {
  if (animal === undefined) return null;
  let kg: number | null = null;
  for (const w of animal.weighings) if (w.date <= dateIso) kg = w.weightKg;
  return kg;
}

/** Weight on a date: the last weighing on or before it, else the first one after. */
function weightAt(animal: Animal | undefined, dateIso: string): number | null {
  return (
    weightOnOrBefore(animal, dateIso) ??
    animal?.weighings.find((w) => w.date > dateIso)?.weightKg ??
    null
  );
}

/** Carcass arrobas the window sold, over how many heads, and how many had no weight at all. */
export interface SoldArrobas {
  arrobas: number;
  heads: number;
  unweighed: number;
}

/**
 * Carcass arrobas sold in the window: every animal that passed a venda dated
 * inside it, at its chute weight × its rendimento ÷ 15. Without a chute
 * weight, its last weighing on or before the venda at the same rendimento;
 * without any weight it adds nothing and counts in `unweighed`.
 */
export function arrobasSold(
  sessions: ManejoSession[],
  animals: Animal[],
  period: Period
): SoldArrobas {
  const byEarTag = new Map(animals.map((a) => [a.earTag, a]));
  let arrobas = 0;
  let heads = 0;
  let unweighed = 0;
  for (const session of sessions) {
    if (session.kind !== "sale" || !inPeriod(session.date, period)) continue;
    for (const entry of session.animals) {
      if (entry.outcome !== "done") continue;
      heads++;
      const kg = entry.weightKg ?? weightOnOrBefore(byEarTag.get(entry.earTag), session.date);
      if (kg === null) unweighed++;
      else arrobas += carcassArrobas(kg, passYieldPct(session, entry));
    }
  }
  return { arrobas, heads, unweighed };
}

/**
 * Live arrobas bought in the window: entry weight ÷ 30 of every animal an
 * entrada dated inside it received. An entrada without weight takes the
 * animal's weight on that date as `herdArrobasAt` does, so the closing stock
 * does not count bought arrobas as produced.
 */
export function arrobasBought(
  sessions: ManejoSession[],
  animals: Animal[],
  period: Period
): { arrobas: number; heads: number } {
  const byEarTag = new Map(animals.map((a) => [a.earTag, a]));
  let arrobas = 0;
  let heads = 0;
  for (const session of sessions) {
    if (session.kind !== "entry" || !inPeriod(session.date, period)) continue;
    for (const entry of session.animals) {
      if (entry.outcome !== "done") continue;
      heads++;
      arrobas += kgToArroba(entry.weightKg ?? weightAt(byEarTag.get(entry.earTag), session.date) ?? 0);
    }
  }
  return { arrobas, heads };
}

/**
 * Herd live arrobas on a date. An animal counts when it was alive on the
 * date: born on or before it, active or gone after it, and not registered by
 * an entrada dated after it. Its weight is the last weighing on or before the
 * date, else the first one after (an animal weighed for the first time later
 * was already there); never weighed, it is a head without arrobas.
 */
export function herdArrobasAt(
  animals: Animal[],
  sessions: ManejoSession[],
  dateIso: string
): { arrobas: number; heads: number } {
  const enteredLater = new Set<string>();
  for (const session of sessions) {
    if (session.kind !== "entry" || session.date <= dateIso) continue;
    for (const entry of session.animals) if (entry.createdAnimal) enteredLater.add(entry.earTag);
  }

  let arrobas = 0;
  let heads = 0;
  for (const animal of animals) {
    if (animal.birthDate > dateIso || enteredLater.has(animal.earTag)) continue;
    const stillHere =
      animal.active || (animal.inactiveDate !== undefined && animal.inactiveDate > dateIso);
    if (!stillHere) continue;
    heads++;
    const kg = weightAt(animal, dateIso);
    if (kg !== null) arrobas += kgToArroba(kg);
  }
  return { arrobas, heads };
}

/** The parts of @ produzidas: sold − bought + (inventoryEnd − inventoryStart). */
export interface ArrobasProduced {
  sold: number;
  bought: number;
  inventoryStart: number;
  inventoryEnd: number;
  delta: number;
  produced: number;
  /** Heads sold without any weight (they add no arrobas). */
  unweighed: number;
  headsSold: number;
}

/** Last day of the window that has already happened. */
const closingDate = (period: Period, todayIso: string): string =>
  period.end < todayIso ? period.end : todayIso;

/** @ produzidas in the window: the industry's denominator for custo da @. */
export function arrobasProduced(
  input: EconomicsInputs,
  period: Period,
  todayIso: string
): ArrobasProduced {
  const { animals, manejoSessions } = input;
  const sold = arrobasSold(manejoSessions, animals, period);
  const bought = arrobasBought(manejoSessions, animals, period);
  // The opening stock is taken the day before the window so that a weighing,
  // a birth or an entrada on `start` belongs to the window. The closing stock
  // stops at today: a window ending in the future has no weights there yet.
  const inventoryStart = herdArrobasAt(animals, manejoSessions, addDays(period.start, -1)).arrobas;
  const inventoryEnd = herdArrobasAt(animals, manejoSessions, closingDate(period, todayIso)).arrobas;
  const delta = inventoryEnd - inventoryStart;
  return {
    sold: sold.arrobas,
    bought: bought.arrobas,
    inventoryStart,
    inventoryEnd,
    delta,
    produced: sold.arrobas - bought.arrobas + delta,
    unweighed: sold.unweighed,
    headsSold: sold.heads,
  };
}

/** Custo da @ produzida (R$/@); null without cost or without production. */
export function costPerArroba(coeBrl: number, produced: number): number | null {
  if (coeBrl === 0 || produced <= 0) return null;
  return coeBrl / produced;
}

/** Desembolso por cabeça por mês (R$/cab/mês); null without heads or without cost. */
export function outlayPerHeadMonth(
  coeBrl: number,
  avgHeads: number,
  period: Period
): number | null {
  if (avgHeads <= 0 || coeBrl === 0) return null;
  return coeBrl / avgHeads / (periodDays(period) / DAYS_PER_MONTH);
}

/** Taxa de desfrute: heads sold over average heads, annualised, in %. */
export function offtakeRate(headsSold: number, avgHeads: number, period: Period): number | null {
  if (avgHeads <= 0) return null;
  return annualise((headsSold / avgHeads) * 100, period);
}

/** Average price (R$/head) of the priced calf purchases in the window; null when none. */
export function averageCalfPrice(movements: Movement[], period: Period): number | null {
  let amount = 0;
  let heads = 0;
  for (const m of movements) {
    if (
      m.type === "purchase" &&
      m.category === "calf" &&
      m.amountBrl !== undefined &&
      m.quantity !== undefined &&
      inPeriod(m.date, period)
    ) {
      amount += m.amountBrl;
      heads += m.quantity;
    }
  }
  return heads === 0 ? null : amount / heads;
}

/**
 * Relação de troca: how many calves one finished steer buys (its average
 * sold arrobas × the quote ÷ the calf price), and how many arrobas one calf
 * costs. The average is over the weighed sold heads: an unweighed one has no
 * arrobas to average.
 */
export function exchangeRatio(
  sold: SoldArrobas,
  quote: number | null,
  calfPrice: number | null
): { calvesPerSteer: number | null; arrobasPerCalf: number | null } {
  if (quote === null || quote === 0 || calfPrice === null || calfPrice === 0) {
    return { calvesPerSteer: null, arrobasPerCalf: null };
  }
  const weighedHeads = sold.heads - sold.unweighed;
  return {
    calvesPerSteer:
      weighedHeads > 0 && sold.arrobas > 0
        ? ((sold.arrobas / weighedHeads) * quote) / calfPrice
        : null,
    arrobasPerCalf: calfPrice / quote,
  };
}

/**
 * Production system the window looks like: cria when it has calvings and
 * the heads sold are mostly calves; recria-engorda when it has no calvings
 * and has compras; ciclo completo otherwise.
 */
export function farmSystem(input: EconomicsInputs, period: Period): FarmSystem {
  const { animals, manejoSessions, movements } = input;
  const calvings = animals.some((a) =>
    (a.reproduction?.calvings ?? []).some((c) => inPeriod(c.date, period))
  );

  const categoryOf = new Map(animals.map((a) => [a.earTag, a.category]));
  let sold = 0;
  let calves = 0;
  for (const session of manejoSessions) {
    if (session.kind !== "sale" || !inPeriod(session.date, period)) continue;
    for (const entry of session.animals) {
      if (entry.outcome !== "done") continue;
      sold++;
      if (categoryOf.get(entry.earTag) === "calf") calves++;
    }
  }
  if (calvings && sold > 0 && calves / sold >= 0.5) return "cria";

  const bought =
    arrobasBought(manejoSessions, animals, period).heads > 0 ||
    movements.some((m) => m.type === "purchase" && inPeriod(m.date, period));
  if (!calvings && bought) return "recria_engorda";
  return "ciclo_completo";
}

/** Heads at the window's start and end (as `herdArrobasAt` counts them) and their mean. */
export interface HeadCounts {
  start: number;
  end: number;
  avg: number;
}

/** The Placar of Financeiro for one window. */
export interface Indicators {
  period: Period;
  system: FarmSystem;
  heads: HeadCounts;
  hectares: number;
  revenue: number;
  salesRevenue: number;
  otherRevenue: number;
  coe: number;
  result: number;
  resultPerHa: number | null;
  marginPct: number | null;
  costToRevenuePct: number | null;
  capitalTurnover: number | null;
  produced: ArrobasProduced;
  arrobasPerHa: number | null;
  costPerArroba: number | null;
  /**
   * Sales revenue ÷ carcass arrobas sold (R$/@). Null when a sold head had no
   * weight or a priced sale has no manejo behind it: its revenue would count
   * without its arrobas. Never a fake number; the card shows "—".
   */
  realizedPerArroba: number | null;
  marginPerArroba: number | null;
  outlayPerHeadMonth: number | null;
  adg: { kgPerDay: number | null; animals: number };
  offtakePct: number | null;
  stocking: number | null;
  calfPrice: number | null;
  exchange: { calvesPerSteer: number | null; arrobasPerCalf: number | null };
  herdArrobas: number;
  herdValue: number | null;
  inventoryDeltaBrl: number | null;
}

/** A priced sale in the window without the venda manejo that carries its weights (a legacy movement). */
function hasSaleWithoutManejo(input: EconomicsInputs, period: Period): boolean {
  const sessionIds = new Set(input.manejoSessions.map((s) => s.id));
  return input.movements.some(
    (m) => isPricedSale(m) && inPeriod(m.date, period) && !sessionIds.has(m.id)
  );
}

/** Every figure of the Placar for the window, at today's quote (null when unknown). */
export function indicators(
  input: EconomicsInputs,
  period: Period,
  quote: number | null,
  todayIso: string
): Indicators {
  const { animals, manejoSessions, movements, treatments, expenses, invernadas } = input;

  const startHeads = herdArrobasAt(animals, manejoSessions, addDays(period.start, -1)).heads;
  const endHeads = herdArrobasAt(animals, manejoSessions, closingDate(period, todayIso)).heads;
  const heads = { start: startHeads, end: endHeads, avg: (startHeads + endHeads) / 2 };
  const hectares = invernadas.reduce((sum, i) => sum + i.hectares, 0);

  const revenue = periodRevenue(expenses, movements, period);
  const cost = coe(expenses, treatments, period);
  const result = revenue.total - cost;
  const produced = arrobasProduced(input, period, todayIso);
  const unitCost = costPerArroba(cost, produced.produced);
  const herdArrobas = kgToArroba(totalWeightKg(activeAnimals(animals)));
  const value = quote === null ? null : herdValue(herdArrobas, quote);
  const calfPrice = averageCalfPrice(movements, period);
  const sold: SoldArrobas = {
    arrobas: produced.sold,
    heads: produced.headsSold,
    unweighed: produced.unweighed,
  };

  return {
    period,
    system: farmSystem(input, period),
    heads,
    hectares,
    revenue: revenue.total,
    salesRevenue: revenue.sales,
    otherRevenue: revenue.other,
    coe: cost,
    result,
    resultPerHa: hectares > 0 ? result / hectares : null,
    marginPct: revenue.total > 0 ? (result / revenue.total) * 100 : null,
    costToRevenuePct: revenue.total > 0 ? (cost / revenue.total) * 100 : null,
    capitalTurnover: value ? annualise(revenue.total, period) / value : null,
    produced,
    arrobasPerHa:
      hectares > 0 && produced.produced > 0
        ? annualise(produced.produced, period) / hectares
        : null,
    costPerArroba: unitCost,
    realizedPerArroba:
      produced.sold > 0 && produced.unweighed === 0 && !hasSaleWithoutManejo(input, period)
        ? revenue.sales / produced.sold
        : null,
    marginPerArroba: quote !== null && unitCost !== null ? quote - unitCost : null,
    outlayPerHeadMonth: outlayPerHeadMonth(cost, heads.avg, period),
    adg: periodAdg(animals, period),
    offtakePct: offtakeRate(produced.headsSold, heads.avg, period),
    stocking: hectares > 0 ? herdStockingRateAuPerHa(animals, invernadas) : null,
    calfPrice,
    exchange: exchangeRatio(sold, quote, calfPrice),
    herdArrobas,
    herdValue: value,
    inventoryDeltaBrl: quote === null ? null : produced.delta * quote,
  };
}

/** Indicators the Placar shows a change for, against the prior window. */
export type DeltaKey =
  | "result"
  | "costPerArroba"
  | "arrobasPerHa"
  | "outlayPerHeadMonth"
  | "adg"
  | "offtakePct"
  | "exchange";

/** The figure each delta compares. */
const deltaValue = (ind: Indicators, key: DeltaKey): number | null => {
  if (key === "adg") return ind.adg.kgPerDay;
  if (key === "exchange") return ind.exchange.calvesPerSteer;
  return ind[key];
};

/**
 * Change of each Placar figure against the prior window: `pct` relative to
 * the prior's magnitude, `pts` the plain difference (percentage points for
 * the % figures). Both null when either side has no data; `pct` also null when the prior is 0.
 */
export function indicatorDeltas(
  current: Indicators,
  prior: Indicators
): Record<DeltaKey, { pct: number | null; pts: number | null }> {
  const keys: DeltaKey[] = [
    "result",
    "costPerArroba",
    "arrobasPerHa",
    "outlayPerHeadMonth",
    "adg",
    "offtakePct",
    "exchange",
  ];
  const deltas = {} as Record<DeltaKey, { pct: number | null; pts: number | null }>;
  for (const key of keys) {
    const cur = deltaValue(current, key);
    const pre = deltaValue(prior, key);
    deltas[key] =
      cur === null || pre === null
        ? { pct: null, pts: null }
        : { pct: pre === 0 ? null : ((cur - pre) / Math.abs(pre)) * 100, pts: cur - pre };
  }
  return deltas;
}
