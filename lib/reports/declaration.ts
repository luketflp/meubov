/**
 * Declaração de rebanho: the herd on a base date by sex × age band and by
 * category, and how it got there from a "movimentação desde" date.
 *
 * The herd on a date is rebuilt from the animals themselves: an animal is
 * there from its entrada (or birth) until the day it left. The flow window is
 * (since, base]: the since date is the saldo anterior, so what happened on it
 * is already in the start.
 */
import type { Animal, Category, HerdData, ManejoSession } from "@/lib/types";
import { ageInMonths } from "@/lib/domain/dates";

/** One age band of the declaration: heads by sex. */
export interface AgeBand {
  label: string;
  males: number;
  females: number;
}

/** The movimentação between two dates. */
export interface DeclarationFlow {
  /** Present on the since date. */
  start: number;
  /** Calvings recorded in (since, base]. */
  births: number;
  /** Animals an entrada registered in (since, base]. */
  purchases: number;
  sales: number;
  /** Mortes and perdas. */
  deaths: number;
  /** Animals that left for any other reason. */
  others: number;
  /** What makes the lines add up: end − (start + births + purchases − sales − deaths − others). */
  adjustment: number;
  /** Present on the base date. */
  end: number;
}

/** The declaração de rebanho on a base date. */
export interface HerdDeclaration {
  baseDate: string;
  since: string;
  /** 0 a 12 meses, 13 a 24 meses, 25 a 36 meses, Acima de 36 meses. */
  bands: AgeBand[];
  /** calf, heifer, cow, steer, bull order; zero rows kept. */
  byCategory: { category: Category; males: number; females: number }[];
  flow: DeclarationFlow;
  /** Present animals without birthDate, placed in a band by category. */
  undated: number;
}

/** Category order of the declaration and the bank report. */
export const REPORT_CATEGORY_ORDER: readonly Category[] = ["calf", "heifer", "cow", "steer", "bull"];

const BAND_LABELS = ["0 a 12 meses", "13 a 24 meses", "25 a 36 meses", "Acima de 36 meses"] as const;

/** Band an undated animal falls in, by its category. */
const UNDATED_BAND: Record<Category, number> = { calf: 0, heifer: 1, steer: 2, cow: 3, bull: 3 };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True when the animal carries a usable birth date. */
export function hasBirthDate(animal: Pick<Animal, "birthDate">): boolean {
  return ISO_DATE.test(animal.birthDate ?? "");
}

/**
 * The date each animal an entrada registered came in, by ear tag: the date of
 * the entry manejo whose done line has `createdAnimal`.
 */
export function entryDatesByEarTag(sessions: readonly ManejoSession[]): Map<string, string> {
  const dates = new Map<string, string>();
  for (const session of sessions) {
    if (session.kind !== "entry") continue;
    for (const line of session.animals) {
      if (line.outcome !== "done" || !line.createdAnimal) continue;
      const known = dates.get(line.earTag);
      if (known === undefined || session.date < known) dates.set(line.earTag, session.date);
    }
  }
  return dates;
}

/**
 * True when the animal was in the herd on the date: born or entered on or
 * before it, and not left by it. The day it left it is gone. An animal with no
 * birth date and no entrada counts as always there; an inactive one with no
 * exit date counts as already gone.
 */
export function presentOn(
  animal: Animal,
  iso: string,
  entryDates: ReadonlyMap<string, string>
): boolean {
  const arrived = entryDates.get(animal.earTag) ?? (hasBirthDate(animal) ? animal.birthDate : null);
  if (arrived !== null && arrived > iso) return false;
  if (animal.active) return true;
  return animal.inactiveDate !== undefined && animal.inactiveDate > iso;
}

/** Age band index (0–3) of an animal on the date. */
function bandOf(animal: Animal, iso: string): number {
  if (!hasBirthDate(animal)) return UNDATED_BAND[animal.category];
  const months = ageInMonths(animal.birthDate, iso);
  if (months <= 12) return 0;
  if (months <= 24) return 1;
  if (months <= 36) return 2;
  return 3;
}

/**
 * The declaração de rebanho on the base date, with the movimentação since the
 * since date. Births are the calvings recorded on the dams; purchases are the
 * animals an entrada registered; exits go by the reason the animal left.
 * Animals registered by hand with no birth or entrada record show up in the
 * adjustment.
 */
export function herdDeclaration(
  data: Pick<HerdData, "animals" | "manejoSessions" | "movements">,
  baseDate: string,
  since: string
): HerdDeclaration {
  const entryDates = entryDatesByEarTag(data.manejoSessions);
  const inWindow = (iso: string | undefined): boolean =>
    iso !== undefined && iso > since && iso <= baseDate;

  const bands: AgeBand[] = BAND_LABELS.map((label) => ({ label, males: 0, females: 0 }));
  const byCategory = REPORT_CATEGORY_ORDER.map((category) => ({ category, males: 0, females: 0 }));
  const categoryRow = new Map(byCategory.map((row) => [row.category, row]));
  let undated = 0;
  let start = 0;
  let end = 0;
  let births = 0;
  let sales = 0;
  let deaths = 0;
  let others = 0;

  for (const animal of data.animals) {
    if (presentOn(animal, since, entryDates)) start += 1;
    births += (animal.reproduction?.calvings ?? []).filter((c) => inWindow(c.date)).length;
    if (!animal.active && inWindow(animal.inactiveDate)) {
      if (animal.inactiveReason === "sale") sales += 1;
      else if (animal.inactiveReason === "death" || animal.inactiveReason === "loss") deaths += 1;
      else others += 1;
    }

    if (!presentOn(animal, baseDate, entryDates)) continue;
    end += 1;
    if (!hasBirthDate(animal)) undated += 1;
    const sexKey = animal.sex === "male" ? "males" : "females";
    bands[bandOf(animal, baseDate)][sexKey] += 1;
    const row = categoryRow.get(animal.category);
    if (row) row[sexKey] += 1;
  }

  let purchases = 0;
  for (const date of entryDates.values()) if (inWindow(date)) purchases += 1;

  const adjustment = end - (start + births + purchases - sales - deaths - others);
  return {
    baseDate,
    since,
    bands,
    byCategory,
    flow: { start, births, purchases, sales, deaths, others, adjustment, end },
    undated,
  };
}
