/**
 * Lines and totals of the manejo details pages: a pesagem, a sanitary manejo,
 * a troca de lote or a compra opened from the history, plus the two records no
 * session wrote — the weighings saved on a day and the treatments marked feito
 * on the calendar.
 *
 * Pure: the pages hand in the session and the herd from the store and render
 * what comes back. A pass records the weighing and the treatment it wrote
 * (`weighingId`, `treatmentId`), which is how a session's records are told
 * apart from the rest.
 */
import type {
  Animal,
  ManejoOutcome,
  ManejoSession,
  Treatment,
  TreatmentType,
} from "@/lib/types";
import { addDays, daysBetween } from "@/lib/domain/dates";

/* -------------------------------------------------------------------------- */
/* Scope and search                                                           */
/* -------------------------------------------------------------------------- */

/** Which animals a page lists: the ones that passed, or the whole lot. */
export type DetailScope = "passed" | "lot";

/** What every line of a details page carries. */
export interface DetailLine {
  earTag: string;
  outcome: ManejoOutcome;
  notes?: string;
}

/**
 * Lines for a scope and a search term, in that order: the search looks inside
 * the scope, so narrowing to the animals that passed never turns up a skipped
 * one by its brinco.
 */
export function visibleLines<T extends DetailLine>(
  lines: T[],
  scope: DetailScope,
  search: string
): T[] {
  const inScope = scope === "passed" ? lines.filter((line) => line.outcome === "done") : lines;
  const term = search.trim().toLowerCase();
  if (term === "") return inScope;
  return inScope.filter((line) => line.earTag.toLowerCase().includes(term));
}

/** A line's note, prefixed by "pulado" or "não passou" when the animal did not pass. */
export function outcomeNote(line: DetailLine): string {
  if (line.outcome === "done") return line.notes ?? "";
  const label = line.outcome === "skipped" ? "pulado" : "não passou";
  return line.notes ? `${label} · ${line.notes}` : label;
}

/** What happened to the animals that passed, for the resumo's lead line. */
export function passedLabel(session: ManejoSession): string {
  switch (session.kind) {
    case "weighing":
      return "pesadas";
    case "transfer":
      return "transferidas";
    case "entry":
      return "recebidas";
    case "sale":
      return "vendidas";
    case "health":
      return TREATED_LABEL[session.treatment?.type ?? "medication"];
  }
}

const TREATED_LABEL: Record<TreatmentType, string> = {
  vaccine: "vacinadas",
  deworming: "vermifugadas",
  medication: "medicadas",
  exam: "examinadas",
};

/* -------------------------------------------------------------------------- */
/* Weighings                                                                  */
/* -------------------------------------------------------------------------- */

export interface PreviousWeighing {
  date: string;
  weightKg: number;
}

/** The animal's last weighing dated strictly before `beforeIso`. */
export function previousWeighing(
  animal: Animal | undefined,
  beforeIso: string
): PreviousWeighing | null {
  let best: PreviousWeighing | null = null;
  for (const w of animal?.weighings ?? []) {
    if (w.date < beforeIso && (best === null || w.date >= best.date)) {
      best = { date: w.date, weightKg: w.weightKg };
    }
  }
  return best;
}

export interface Gain {
  gainKg: number;
  /** Ganho médio diário over the days since the previous weighing. */
  adgKgDay: number;
}

/** Gain since the previous weighing; null without one or when no day went by. */
export function gainSince(
  weightKg: number,
  dateIso: string,
  previous: PreviousWeighing | null
): Gain | null {
  if (previous === null) return null;
  const days = daysBetween(previous.date, dateIso);
  if (days <= 0) return null;
  const gainKg = weightKg - previous.weightKg;
  return { gainKg, adgKgDay: gainKg / days };
}

export interface WeighingLine extends DetailLine {
  /** Weight read that day; null for an animal that did not pass. */
  weightKg: number | null;
  previous: PreviousWeighing | null;
  gain: Gain | null;
  /** The weight was taken on the animal's birth date: a peso ao nascer. */
  atBirth: boolean;
}

function weighingLine(
  base: DetailLine,
  animal: Animal | undefined,
  dateIso: string,
  weightKg: number | null
): WeighingLine {
  const previous = previousWeighing(animal, dateIso);
  return {
    ...base,
    weightKg,
    previous,
    gain: weightKg === null ? null : gainSince(weightKg, dateIso, previous),
    atBirth: weightKg !== null && animal?.birthDate === dateIso,
  };
}

/** One line per animal of a session, in the session's order. */
export function sessionWeighingLines(session: ManejoSession, animals: Animal[]): WeighingLine[] {
  const byTag = new Map(animals.map((animal) => [animal.earTag, animal]));
  return session.animals.map((entry) =>
    weighingLine(
      { earTag: entry.earTag, outcome: entry.outcome, notes: entry.notes },
      byTag.get(entry.earTag),
      session.date,
      entry.outcome === "done" ? (entry.weightKg ?? null) : null
    )
  );
}

/** The weighings saved on a day that no session wrote (ficha, cadastro, nascimento). */
export function looseWeighingLines(
  dateIso: string,
  animals: Animal[],
  sessions: ManejoSession[]
): WeighingLine[] {
  const sessionWeighings = new Set<number>();
  for (const session of sessions) {
    for (const entry of session.animals) {
      if (entry.weighingId !== undefined) sessionWeighings.add(entry.weighingId);
    }
  }
  return animals.flatMap((animal) =>
    animal.weighings
      .filter((w) => w.date === dateIso && (w.id === undefined || !sessionWeighings.has(w.id)))
      .map((w) =>
        weighingLine({ earTag: animal.earTag, outcome: "done" }, animal, dateIso, w.weightKg)
      )
  );
}

export interface WeighingTotals {
  total: number;
  passed: number;
  skipped: number;
  weighed: number;
  totalKg: number | null;
  avgKg: number | null;
  /** Weighed animals that had a weighing before. */
  withPrevious: number;
  totalGainKg: number | null;
  avgGainKg: number | null;
  avgAdgKgDay: number | null;
  atBirth: number;
  avgAtBirthKg: number | null;
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const mean = (values: number[]) => (values.length === 0 ? null : sum(values) / values.length);

export function weighingTotals(lines: WeighingLine[]): WeighingTotals {
  const weights = lines.flatMap((line) => (line.weightKg === null ? [] : [line.weightKg]));
  const gains = lines.flatMap((line) => (line.gain === null ? [] : [line.gain]));
  const births = lines.flatMap((line) =>
    line.atBirth && line.weightKg !== null ? [line.weightKg] : []
  );
  return {
    total: lines.length,
    passed: lines.filter((line) => line.outcome === "done").length,
    skipped: lines.filter((line) => line.outcome === "skipped").length,
    weighed: weights.length,
    totalKg: weights.length === 0 ? null : sum(weights),
    avgKg: mean(weights),
    withPrevious: gains.length,
    totalGainKg: gains.length === 0 ? null : sum(gains.map((gain) => gain.gainKg)),
    avgGainKg: mean(gains.map((gain) => gain.gainKg)),
    avgAdgKgDay: mean(gains.map((gain) => gain.adgKgDay)),
    atBirth: births.length,
    avgAtBirthKg: mean(births),
  };
}

/* -------------------------------------------------------------------------- */
/* Sanitary sessions                                                          */
/* -------------------------------------------------------------------------- */

export interface TreatmentLine extends DetailLine {
  /** Weight taken in the same pass, when the manejo also weighed. */
  weightKg: number | null;
  /** The plan's cost for this animal; null when it did not pass or there is none. */
  costBrl: number | null;
}

export function treatmentLines(session: ManejoSession): TreatmentLine[] {
  const cost = session.treatment?.costBrl;
  return session.animals.map((entry) => {
    const passed = entry.outcome === "done";
    return {
      earTag: entry.earTag,
      outcome: entry.outcome,
      notes: entry.notes,
      weightKg: passed ? (entry.weightKg ?? null) : null,
      costBrl: passed && cost !== undefined ? cost : null,
    };
  });
}

export interface TreatmentTotals {
  total: number;
  passed: number;
  skipped: number;
  /** Last day of the carência; null without one. */
  withdrawalUntil: string | null;
  costTotalBrl: number | null;
  costPerHeadBrl: number | null;
  boosterDate: string | null;
  /** Boosters this manejo scheduled. */
  boosters: number;
  weighed: number;
  avgKg: number | null;
}

export function treatmentTotals(session: ManejoSession): TreatmentTotals {
  const plan = session.treatment;
  const done = session.animals.filter((entry) => entry.outcome === "done");
  const weights = done.flatMap((entry) => (entry.weightKg === undefined ? [] : [entry.weightKg]));
  const cost = plan?.costBrl;
  return {
    total: session.animals.length,
    passed: done.length,
    skipped: session.animals.filter((entry) => entry.outcome === "skipped").length,
    withdrawalUntil:
      plan && plan.withdrawalDays > 0 ? addDays(session.date, plan.withdrawalDays) : null,
    costTotalBrl: cost === undefined ? null : cost * done.length,
    costPerHeadBrl: cost ?? null,
    boosterDate: plan?.nextDate ?? null,
    boosters: done.filter((entry) => entry.boosterId !== undefined).length,
    weighed: weights.length,
    avgKg: mean(weights),
  };
}

/* -------------------------------------------------------------------------- */
/* Treatments marked feito on the calendar                                    */
/* -------------------------------------------------------------------------- */

export interface CalendarTreatmentGroup {
  date: string;
  type: TreatmentType;
  name: string;
  treatments: Treatment[];
}

/**
 * The done treatments sharing the day, type and name of `treatmentId` that no
 * session wrote. Null when the treatment is unknown, not done, or a session's.
 */
export function calendarTreatmentGroup(
  treatmentId: string,
  treatments: Treatment[],
  sessions: ManejoSession[]
): CalendarTreatmentGroup | null {
  const sessionTreatments = new Set<string>();
  for (const session of sessions) {
    for (const entry of session.animals) {
      if (entry.treatmentId !== undefined) sessionTreatments.add(entry.treatmentId);
    }
  }
  const outside = (t: Treatment) => t.status === "done" && !sessionTreatments.has(t.id);
  const target = treatments.find((t) => t.id === treatmentId);
  if (!target || !outside(target)) return null;
  return {
    date: target.date,
    type: target.type,
    name: target.name,
    treatments: treatments.filter(
      (t) => outside(t) && t.date === target.date && t.type === target.type && t.name === target.name
    ),
  };
}

export interface CalendarTotals {
  heads: number;
  /** Last day of the longest carência in the group; null without one. */
  withdrawalUntil: string | null;
  costTotalBrl: number | null;
  costPerHeadBrl: number | null;
}

export function calendarTotals(group: CalendarTreatmentGroup): CalendarTotals {
  const longest = Math.max(0, ...group.treatments.map((t) => t.withdrawalDays));
  const costs = group.treatments.flatMap((t) => (t.costBrl === undefined ? [] : [t.costBrl]));
  const total = costs.length === 0 ? null : sum(costs);
  const heads = group.treatments.length;
  return {
    heads,
    withdrawalUntil: longest > 0 ? addDays(group.date, longest) : null,
    costTotalBrl: total,
    costPerHeadBrl: total === null || heads === 0 ? null : total / heads,
  };
}

/* -------------------------------------------------------------------------- */
/* Troca de lote and entrada                                                  */
/* -------------------------------------------------------------------------- */

export interface MovementLine extends DetailLine {
  weightKg: number | null;
  /** Lote the animal left, on a troca de lote. */
  previousLotId?: string;
}

export function movementLines(session: ManejoSession): MovementLine[] {
  return session.animals.map((entry) => ({
    earTag: entry.earTag,
    outcome: entry.outcome,
    notes: entry.notes,
    weightKg: entry.outcome === "done" ? (entry.weightKg ?? null) : null,
    previousLotId: entry.previousLotId,
  }));
}

/** Where the animals of a troca de lote came from, most heads first. */
export function transferOrigins(session: ManejoSession): { lotId: string | null; heads: number }[] {
  const heads = new Map<string | null, number>();
  for (const entry of session.animals) {
    if (entry.outcome !== "done") continue;
    const lotId = entry.previousLotId ?? null;
    heads.set(lotId, (heads.get(lotId) ?? 0) + 1);
  }
  return [...heads]
    .map(([lotId, count]) => ({ lotId, heads: count }))
    .sort((a, b) => b.heads - a.heads);
}

export interface EntryTotals {
  heads: number;
  weighed: number;
  avgKg: number | null;
  totalBrl: number | null;
  perHeadBrl: number | null;
  /** Value per arroba viva (kg ÷ 30); only when every animal received was weighed. */
  perArrobaBrl: number | null;
}

export function entryTotals(session: ManejoSession): EntryTotals {
  const done = session.animals.filter((entry) => entry.outcome === "done");
  const weights = done.flatMap((entry) => (entry.weightKg === undefined ? [] : [entry.weightKg]));
  const total = session.totalAmountBrl ?? null;
  const allWeighed = done.length > 0 && weights.length === done.length;
  return {
    heads: done.length,
    weighed: weights.length,
    avgKg: mean(weights),
    totalBrl: total,
    perHeadBrl: total === null || done.length === 0 ? null : total / done.length,
    perArrobaBrl: total === null || !allWeighed ? null : total / (sum(weights) / 30),
  };
}
