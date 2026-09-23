/**
 * Relatório para banco: the herd on a base date valued by category, the
 * 12-month flow and the lots. A weighed animal is worth its last weight on or
 * before the base date × rendimento ÷ 15 × R$/@; an unweighed one, the
 * R$/cabeça given for its category.
 */
import type { Animal, Category, HerdData, ManejoSession, Weighing } from "@/lib/types";
import { addDays, daysBetween, parseISODate, toISO } from "@/lib/domain/dates";
import { calculateAdg } from "@/lib/domain/adg";
import { carcassArrobas, DEFAULT_CARCASS_YIELD_PCT } from "@/lib/domain/weights";
import { activeLots, currentPlacementForLot } from "@/lib/store/selectors";
import {
  entryDatesByEarTag,
  herdDeclaration,
  presentOn,
  REPORT_CATEGORY_ORDER,
  type DeclarationFlow,
} from "@/lib/reports/declaration";

/** What the farmer sets on the report's parameters card. */
export interface BankParams {
  baseDate: string;
  pricePerArroba: number;
  yieldPct: number;
  /** R$/cabeça of the animals with no weighing on or before the base date. */
  headPrice: Partial<Record<Category, number>>;
}

/** One category of the inventory. */
export interface BankRow {
  category: Category;
  heads: number;
  weighed: number;
  /** Mean last weight of the weighed heads; null when none is. */
  avgKg: number | null;
  /** Carcass arrobas of the weighed heads. */
  arrobas: number;
  unweighed: number;
  /** The R$/cabeça given for the category, null when none was. */
  headPrice: number | null;
  /** Weighed arrobas × R$/@ plus unweighed heads × R$/cabeça. */
  valueBrl: number;
}

/** One lot of the report. */
export interface BankLotRow {
  lotName: string;
  /** Where the lot stands today: "03 · Baixada". */
  invernada: string | null;
  heads: number;
  avgKg: number | null;
  /** Mean GMD (kg/day) of its animals over the 120 days up to the base date. */
  adg: number | null;
}

/** The relatório para banco. */
export interface BankReport {
  /** Category order calf, heifer, cow, steer, bull; rows with heads > 0. */
  rows: BankRow[];
  totals: { heads: number; weighed: number; liveKg: number; arrobas: number; valueBrl: number };
  /** The 12 months ending at the base date, from {@link bankFlowSince}. */
  flow: DeclarationFlow;
  /** Active lots with animals, by heads desc. */
  lots: BankLotRow[];
}

/** Days back the per-lot GMD looks, as the herd's average GMD does. */
const ADG_WINDOW_DAYS = 120;

/**
 * The newest sale priced per arroba that sold at least one animal: its date,
 * R$/@ and carcass yield (the default when it set none). Null without one.
 */
export function lastSalePrice(
  sessions: ManejoSession[]
): { date: string; pricePerArroba: number; yieldPct: number } | null {
  let last: ManejoSession | null = null;
  for (const session of sessions) {
    if (session.kind !== "sale" || session.pricePerArroba === undefined) continue;
    if (!session.animals.some((line) => line.outcome === "done")) continue;
    if (last === null || session.date > last.date) last = session;
  }
  if (last === null || last.pricePerArroba === undefined) return null;
  return {
    date: last.date,
    pricePerArroba: last.pricePerArroba,
    yieldPct: last.carcassYieldPct ?? DEFAULT_CARCASS_YIELD_PCT,
  };
}

/** First day of the report's 12-month flow: the first of the month 11 months before the base date. */
export function bankFlowSince(baseDate: string): string {
  const base = parseISODate(baseDate);
  return toISO(new Date(base.getFullYear(), base.getMonth() - 11, 1));
}

/** The animals in the herd on the date. */
function presentAnimals(data: HerdData, baseDate: string): Animal[] {
  const entryDates = entryDatesByEarTag(data.manejoSessions);
  return data.animals.filter((animal) => presentOn(animal, baseDate, entryDates));
}

/** The weighings up to the date (weighings are sorted asc). */
const weighingsBy = (animal: Animal, iso: string): Weighing[] =>
  animal.weighings.filter((w) => w.date <= iso);

/** Last weight on or before the date, or null. */
function lastWeightBy(animal: Animal, iso: string): number | null {
  const upTo = weighingsBy(animal, iso);
  return upTo.length === 0 ? null : upTo[upTo.length - 1].weightKg;
}

const mean = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;

/**
 * The relatório para banco on the params' base date: the animals present then,
 * valued by their last weighing on or before it (or by head when unweighed),
 * the 12-month flow and the active lots, by the lote each animal names today.
 */
export function bankReport(data: HerdData, params: BankParams): BankReport {
  const { baseDate, pricePerArroba, yieldPct, headPrice } = params;
  const present = presentAnimals(data, baseDate);

  const rows: BankRow[] = [];
  let liveKgTotal = 0;
  for (const category of REPORT_CATEGORY_ORDER) {
    const animals = present.filter((animal) => animal.category === category);
    if (animals.length === 0) continue;
    const weights = animals.flatMap((animal) => lastWeightBy(animal, baseDate) ?? []);
    liveKgTotal += weights.reduce((sum, kg) => sum + kg, 0);
    const arrobas = weights.reduce((sum, kg) => sum + carcassArrobas(kg, yieldPct), 0);
    const unweighed = animals.length - weights.length;
    const price = headPrice[category] ?? null;
    rows.push({
      category,
      heads: animals.length,
      weighed: weights.length,
      avgKg: mean(weights),
      arrobas,
      unweighed,
      headPrice: price,
      valueBrl: arrobas * pricePerArroba + unweighed * (price ?? 0),
    });
  }

  const totals = { heads: 0, weighed: 0, liveKg: liveKgTotal, arrobas: 0, valueBrl: 0 };
  for (const row of rows) {
    totals.heads += row.heads;
    totals.weighed += row.weighed;
    totals.arrobas += row.arrobas;
    totals.valueBrl += row.valueBrl;
  }

  // herdDeclaration's window is (since, base]: start the day before so the
  // first day of the first month is in it.
  const flow = herdDeclaration(data, baseDate, addDays(bankFlowSince(baseDate), -1)).flow;

  return { rows, totals, flow, lots: bankLots(data, present, baseDate) };
}

/** Active lots with present animals, by heads desc then name. */
function bankLots(data: HerdData, present: Animal[], baseDate: string): BankLotRow[] {
  const invernadas = new Map(data.invernadas.map((item) => [item.id, item]));
  const rows: BankLotRow[] = [];
  for (const lot of activeLots(data.lots)) {
    const animals = present.filter((animal) => animal.lotId === lot.id);
    if (animals.length === 0) continue;
    const placement = currentPlacementForLot(lot.id, data.lotPlacements);
    const invernada = placement ? invernadas.get(placement.invernadaId) : undefined;
    const adgs = animals.flatMap(
      (animal) =>
        calculateAdg(
          weighingsBy(animal, baseDate).filter(
            (w) => daysBetween(w.date, baseDate) <= ADG_WINDOW_DAYS
          )
        ) ?? []
    );
    rows.push({
      lotName: lot.name,
      invernada: invernada
        ? invernada.name
          ? `${invernada.code} · ${invernada.name}`
          : invernada.code
        : null,
      heads: animals.length,
      avgKg: mean(animals.flatMap((animal) => lastWeightBy(animal, baseDate) ?? [])),
      adg: mean(adgs),
    });
  }
  return rows.sort(
    (a, b) =>
      b.heads - a.heads || a.lotName.localeCompare(b.lotName, "pt-BR", { numeric: true })
  );
}

/**
 * Present animals with no weighing on or before the date, by category — the
 * heads the R$/cabeça fields price. Categories with none are left out.
 */
export function unweighedByCategory(
  data: HerdData,
  baseDate: string
): Partial<Record<Category, number>> {
  const counts: Partial<Record<Category, number>> = {};
  for (const animal of presentAnimals(data, baseDate)) {
    if (lastWeightBy(animal, baseDate) !== null) continue;
    counts[animal.category] = (counts[animal.category] ?? 0) + 1;
  }
  return counts;
}
