/**
 * The Painel's derived views: what needs a hand, lote by lote; the herd's flow
 * over 12 months; the breeding season in numbers; and the calvings ahead.
 * Pure functions of the store's data and today's date.
 */
import type {
  Animal,
  Invernada,
  Lot,
  LotPlacement,
  Movement,
  Treatment,
  TreatmentType,
} from "@/lib/types";
import type { MonthlyAdgPoint } from "@/lib/domain/adg";
import { addDays, daysBetween, parseISODate, toISO } from "@/lib/domain/dates";
import { compareEarTags } from "@/lib/domain/earTags";
import {
  currentDiagnosis,
  expectedCalvingDate,
  hasCalvedSince,
  isDiagnosed,
  isPregnantNow,
} from "@/lib/domain/reproduction";
import { deriveTreatmentStatus } from "@/lib/domain/status";
import { awaitsDiagnosis } from "@/lib/domain/ultrasound";
import { activeAnimals, currentPlacementForLot } from "@/lib/store/selectors";

/** Days ahead the agenda looks for scheduled work. */
export const AGENDA_DAYS_AHEAD = 7;

/** Days after a cobertura when the ultrassom can tell. */
export const DIAGNOSIS_AFTER_DAYS = 30;

/** Days back the reproduction card looks for coberturas. */
export const SEASON_DAYS = 365;

/** How soon an item asks for a hand: 0 overdue, 1 today, 2 coming up. */
export type AgendaUrgency = 0 | 1 | 2;

/** The treatments of one date, type and name in one lote. */
export interface AgendaTreatment {
  kind: "treatment";
  key: string;
  urgency: AgendaUrgency;
  date: string;
  type: TreatmentType;
  name: string;
  treatmentIds: string[];
  earTags: string[];
}

/** The dams of one lote with a calving, or a diagnosis, to see to. */
export interface AgendaDams {
  kind: "overdueCalvings" | "upcomingCalvings" | "pendingDiagnosis";
  key: string;
  urgency: AgendaUrgency;
  /** The earliest date of the group: the expected calving, or the cobertura. */
  date: string;
  /** The latest of those dates. */
  until: string;
  earTags: string[];
}

export type AgendaItem = AgendaTreatment | AgendaDams;

/** One lote of the agenda with what it asks for, most urgent first. */
export interface AgendaLot {
  /** null gathers the animals whose lote no longer resolves ("Sem lote"). */
  lotId: string | null;
  name: string | null;
  /** The invernada the lote stands on today. */
  invernada: Invernada | null;
  /** Active animals in the lote today. */
  heads: number;
  items: AgendaItem[];
}

export interface AgendaInput {
  animals: Animal[];
  treatments: Treatment[];
  lots: Lot[];
  invernadas: Invernada[];
  lotPlacements: LotPlacement[];
}

const DAM_URGENCY: Record<AgendaDams["kind"], AgendaUrgency> = {
  overdueCalvings: 0,
  pendingDiagnosis: 1,
  upcomingCalvings: 2,
};

const compareDates = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const compareItems = (a: AgendaItem, b: AgendaItem): number =>
  a.urgency - b.urgency || compareDates(a.date, b.date);

/**
 * What needs a hand, lote by lote: the treatments not done that are overdue,
 * due today or due within {@link AGENDA_DAYS_AHEAD} days, grouped like the
 * Manejo activities; the calvings expected before today with no parto
 * recorded; the calvings expected in the next days; and the coberturas that
 * wait for the ultrassom {@link DIAGNOSIS_AFTER_DAYS} days on. Each item sits
 * in the lote its animals stand in today, so one activity spread over two
 * lotes shows in both. Inactive animals and ear tags that resolve to none drop
 * out. Lotes run by their most urgent item (the oldest date first at the same
 * urgency), then by name; "Sem lote" comes last.
 */
export function farmAgenda(input: AgendaInput, todayIso: string): AgendaLot[] {
  const active = activeAnimals(input.animals);
  const byEarTag = new Map(active.map((animal) => [animal.earTag, animal]));
  const lotById = new Map(input.lots.map((lot) => [lot.id, lot]));
  const invernadaById = new Map(input.invernadas.map((item) => [item.id, item]));
  const horizon = addDays(todayIso, AGENDA_DAYS_AHEAD);
  const lotKey = (lotId: string): string | null => (lotById.has(lotId) ? lotId : null);

  const heads = new Map<string | null, number>();
  for (const animal of active) {
    const key = lotKey(animal.lotId);
    heads.set(key, (heads.get(key) ?? 0) + 1);
  }

  const groups = new Map<string | null, AgendaLot>();
  const groupOf = (key: string | null): AgendaLot => {
    let group = groups.get(key);
    if (!group) {
      const placement = key === null ? null : currentPlacementForLot(key, input.lotPlacements);
      group = {
        lotId: key,
        name: key === null ? null : (lotById.get(key)?.name ?? null),
        invernada: placement ? (invernadaById.get(placement.invernadaId) ?? null) : null,
        heads: heads.get(key) ?? 0,
        items: [],
      };
      groups.set(key, group);
    }
    return group;
  };

  const activities = new Map<string, AgendaTreatment>();
  for (const treatment of input.treatments) {
    if (deriveTreatmentStatus(treatment, todayIso) === "done" || treatment.date > horizon) continue;
    const animal = byEarTag.get(treatment.animalEarTag);
    if (!animal) continue;
    const group = groupOf(lotKey(animal.lotId));
    const key = `${group.lotId ?? ""}|${treatment.date}|${treatment.type}|${treatment.name}`;
    let activity = activities.get(key);
    if (!activity) {
      activity = {
        kind: "treatment",
        key,
        urgency: treatment.date < todayIso ? 0 : treatment.date === todayIso ? 1 : 2,
        date: treatment.date,
        type: treatment.type,
        name: treatment.name,
        treatmentIds: [],
        earTags: [],
      };
      activities.set(key, activity);
      group.items.push(activity);
    }
    activity.treatmentIds.push(treatment.id);
    activity.earTags.push(treatment.animalEarTag);
  }

  const dams = new Map<
    string,
    { kind: AgendaDams["kind"]; lot: string | null; dated: { earTag: string; date: string }[] }
  >();
  const addDam = (kind: AgendaDams["kind"], animal: Animal, date: string) => {
    const lot = lotKey(animal.lotId);
    const key = `${lot ?? ""}|${kind}`;
    const entry = dams.get(key) ?? { kind, lot, dated: [] };
    entry.dated.push({ earTag: animal.earTag, date });
    dams.set(key, entry);
  };
  for (const animal of active) {
    const record = animal.reproduction;
    const current = record ? currentDiagnosis(record) : null;
    if (!record || !current) continue;
    if (isPregnantNow(record)) {
      const expected = expectedCalvingDate(current.breeding.date);
      if (expected < todayIso) addDam("overdueCalvings", animal, expected);
      else if (expected <= horizon) addDam("upcomingCalvings", animal, expected);
    } else if (
      awaitsDiagnosis(record, current.breeding, true) &&
      daysBetween(current.breeding.date, todayIso) >= DIAGNOSIS_AFTER_DAYS
    ) {
      addDam("pendingDiagnosis", animal, current.breeding.date);
    }
  }
  for (const [key, entry] of dams) {
    const dated = entry.dated.sort(
      (a, b) => compareDates(a.date, b.date) || compareEarTags(a.earTag, b.earTag)
    );
    groupOf(entry.lot).items.push({
      kind: entry.kind,
      key,
      urgency: DAM_URGENCY[entry.kind],
      date: dated[0].date,
      until: dated[dated.length - 1].date,
      earTags: dated.map((item) => item.earTag),
    });
  }

  const agenda = [...groups.values()];
  for (const group of agenda) group.items.sort(compareItems);
  return agenda.sort((a, b) => {
    if (a.lotId === null) return 1;
    if (b.lotId === null) return -1;
    return (
      compareItems(a.items[0], b.items[0]) ||
      (a.name ?? "").localeCompare(b.name ?? "", "pt-BR", { numeric: true })
    );
  });
}

/** The herd's flow over the 12-month window, from its start to today. */
export interface HerdFlow {
  /** First day of the window: the first of the month 11 months before today's. */
  since: string;
  /** Today's herd with the window's movements undone, floored at 0. */
  start: number;
  births: number;
  purchases: number;
  sales: number;
  /** Mortes and perdas. */
  deaths: number;
  /** Animals that left for any other reason. */
  others: number;
  /** Active animals today. */
  end: number;
}

/**
 * How the herd got from the start of the window to today: calvings recorded,
 * head bought (purchase movements, the entradas included), and animals that
 * left by reason. The start is derived, so an animal registered by hand with no
 * entrada counts as already there.
 */
export function herdFlow(animals: Animal[], movements: Movement[], todayIso: string): HerdFlow {
  const today = parseISODate(todayIso);
  const since = toISO(new Date(today.getFullYear(), today.getMonth() - 11, 1));
  const inWindow = (iso: string | undefined): boolean =>
    iso !== undefined && iso >= since && iso <= todayIso;

  let births = 0;
  let sales = 0;
  let deaths = 0;
  let others = 0;
  for (const animal of animals) {
    births += (animal.reproduction?.calvings ?? []).filter((c) => inWindow(c.date)).length;
    if (animal.active || !inWindow(animal.inactiveDate)) continue;
    if (animal.inactiveReason === "sale") sales += 1;
    else if (animal.inactiveReason === "death" || animal.inactiveReason === "loss") deaths += 1;
    else others += 1;
  }
  const purchases = movements
    .filter((movement) => movement.type === "purchase" && inWindow(movement.date))
    .reduce((sum, movement) => sum + (movement.quantity ?? 0), 0);
  const end = activeAnimals(animals).length;
  const start = Math.max(0, end - births - purchases + sales + deaths + others);
  return { since, start, births, purchases, sales, deaths, others, end };
}

/** The breeding season in numbers, over the active females. */
export interface SeasonReproduction {
  /** Females whose latest cobertura falls in the last {@link SEASON_DAYS} days. */
  exposed: number;
  /** Of those, diagnosed pregnant or open, or already calved. */
  diagnosed: number;
  /** Diagnosed pregnant, or calved since the cobertura. */
  pregnant: number;
  /** Calved since the cobertura. */
  calved: number;
  /** Still waiting for the ultrassom. */
  awaiting: number;
  /** pregnant / diagnosed in %, or null before the first diagnosis. */
  ratePct: number | null;
}

/**
 * The season of the last {@link SEASON_DAYS} days: each active female's latest
 * cobertura in the window counts once. A calving recorded since the cobertura
 * proves the pregnancy, diagnosed or not.
 */
export function seasonReproduction(animals: Animal[], todayIso: string): SeasonReproduction {
  const since = addDays(todayIso, -SEASON_DAYS);
  const totals = { exposed: 0, diagnosed: 0, pregnant: 0, calved: 0, awaiting: 0 };
  for (const animal of activeAnimals(animals)) {
    const record = animal.reproduction;
    const current = record ? currentDiagnosis(record) : null;
    if (!record || !current) continue;
    const date = current.breeding.date;
    if (date < since || date > todayIso) continue;
    const calved = hasCalvedSince(record, date);
    totals.exposed += 1;
    if (calved) totals.calved += 1;
    if (calved || isDiagnosed(current.result)) totals.diagnosed += 1;
    if (calved || current.result === "pregnant") totals.pregnant += 1;
    if (awaitsDiagnosis(record, current.breeding, true)) totals.awaiting += 1;
  }
  return {
    ...totals,
    ratePct: totals.diagnosed === 0 ? null : (totals.pregnant / totals.diagnosed) * 100,
  };
}

/** One month of the parição chart. */
export interface CalvingMonth {
  /** First day of the month. */
  date: string;
  /** Calvings recorded in the month. */
  born: number;
  /** Calvings expected from today on in the month. */
  due: number;
}

/** A calving the herd still expects: an active dam pregnant now. */
export interface ExpectedCalving {
  dam: Animal;
  date: string;
}

function expectedCalvings(animals: Animal[]): ExpectedCalving[] {
  return activeAnimals(animals).flatMap((dam) => {
    const current = dam.reproduction ? currentDiagnosis(dam.reproduction) : null;
    return current && isPregnantNow(dam.reproduction)
      ? [{ dam, date: expectedCalvingDate(current.breeding.date) }]
      : [];
  });
}

/**
 * The parição month by month, `before` months back to `after` ahead of
 * today's: the calvings recorded, and the ones still expected from today on.
 * An expected date already past is the agenda's "sem registro", not a month's.
 */
export function calvingCalendar(
  animals: Animal[],
  todayIso: string,
  before = 2,
  after = 3
): CalvingMonth[] {
  const today = parseISODate(todayIso);
  const months: CalvingMonth[] = [];
  for (let offset = -before; offset <= after; offset += 1) {
    const first = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    months.push({ date: toISO(first), born: 0, due: 0 });
  }
  const byMonth = new Map(months.map((month) => [month.date.slice(0, 7), month]));
  for (const animal of animals) {
    for (const calving of animal.reproduction?.calvings ?? []) {
      const month = byMonth.get(calving.date.slice(0, 7));
      if (month) month.born += 1;
    }
  }
  for (const { date } of expectedCalvings(animals)) {
    if (date < todayIso) continue;
    const month = byMonth.get(date.slice(0, 7));
    if (month) month.due += 1;
  }
  return months;
}

/** The next calvings from today on, nearest first. */
export function nextCalvings(animals: Animal[], todayIso: string, limit = 4): ExpectedCalving[] {
  return expectedCalvings(animals)
    .filter((calving) => calving.date >= todayIso)
    .sort((a, b) => compareDates(a.date, b.date) || compareEarTags(a.dam.earTag, b.dam.earTag))
    .slice(0, limit);
}

/** The last month's GMD minus the month before's, or null without both. */
export function adgChange(series: MonthlyAdgPoint[]): number | null {
  if (series.length < 2) return null;
  const last = series[series.length - 1].averageAdg;
  const previous = series[series.length - 2].averageAdg;
  return last === null || previous === null ? null : last - previous;
}
