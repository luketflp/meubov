/**
 * Relatório técnico: the season, prenhez by bull, the calvings, GMD by lote
 * and sanidade over a period, optionally for one lote.
 *
 * The season counts like the Painel's (seasonReproduction): each female once,
 * by her latest cobertura of the period, a calving since it proving the
 * pregnancy. Unlike the Painel it keeps the females that have left the herd
 * since, so selling the vazias does not lift the taxa de prenhez.
 */
import type { Animal, Breeding, HerdData, ReproductionRecord, TreatmentType } from "@/lib/types";
import { addDays, daysBetween } from "@/lib/domain/dates";
import { calculateAdg } from "@/lib/domain/adg";
import { breedingOutcome, expectedCalvingDate, isDiagnosed } from "@/lib/domain/reproduction";
import { awaitsDiagnosis } from "@/lib/domain/ultrasound";
import { activeLots } from "@/lib/store/selectors";

/** What the farmer sets on the report's parameters card. */
export interface TechnicalParams {
  from: string;
  to: string;
  /** Only the animals of this lote when set. */
  lotId: string | null;
}

/** The relatório técnico. */
export interface TechnicalReport {
  season: {
    /** Females with a cobertura in the period. */
    exposed: number;
    /** Of those, diagnosed pregnant or open, or calved since. */
    diagnosed: number;
    pregnant: number;
    open: number;
    /** Still waiting for the ultrassom. */
    awaiting: number;
    /** pregnant / diagnosed in %, null before the first diagnosis. */
    ratePct: number | null;
  };
  /** Every cobertura of the period by bull, most covered first. */
  byBull: {
    name: string;
    type: "IATF" | "Monta natural";
    covered: number;
    diagnosed: number;
    pregnant: number;
    ratePct: number | null;
  }[];
  /** The season's pregnancies: all, calved, due in 30 days, past due (dams in the herd). */
  calvings: { expected: number; born: number; next30: number; overdue: number };
  /** Lotes with an animal weighed twice in the period, by name. */
  lots: { lotName: string; weighed: number; startKg: number; endKg: number; days: number; adg: number }[];
  /** Types with an application in the period or an animal in carência today. */
  sanitary: { type: TreatmentType; sessions: number; applications: number; inWithdrawal: number }[];
}

/** Bull name of a cobertura with none on record. */
export const UNKNOWN_BULL = "Não informado";

/** Days ahead a calving counts as coming up. */
const NEXT_CALVINGS_DAYS = 30;

const TREATMENT_TYPES: readonly TreatmentType[] = ["vaccine", "deworming", "medication", "exam"];

const mean = (values: number[]): number =>
  values.reduce((sum, v) => sum + v, 0) / values.length;

const rate = (pregnant: number, diagnosed: number): number | null =>
  diagnosed === 0 ? null : (pregnant / diagnosed) * 100;

/**
 * True when a calving came of this cobertura: one recorded on or after it and
 * before the dam's next cobertura.
 */
function calvedFrom(record: ReproductionRecord, breeding: Breeding): boolean {
  const next = record.breedings
    .filter((b) => b.date > breeding.date)
    .reduce<string | null>((min, b) => (min === null || b.date < min ? b.date : min), null);
  return record.calvings.some((c) => c.date >= breeding.date && (next === null || c.date < next));
}

/** What became of a cobertura, a calving proving the pregnancy. */
function outcomeOf(record: ReproductionRecord, breeding: Breeding) {
  const { result } = breedingOutcome(record, breeding);
  const calved = calvedFrom(record, breeding);
  return {
    calved,
    diagnosed: calved || isDiagnosed(result),
    pregnant: calved || result === "pregnant",
  };
}

/**
 * The relatório técnico over [from, to] for the lote picked (by the lote each
 * animal names today) or the whole farm, with today's calvings due and
 * carências.
 */
export function technicalReport(
  data: HerdData,
  params: TechnicalParams,
  todayIso: string
): TechnicalReport {
  const { from, to, lotId } = params;
  const inPeriod = (iso: string): boolean => iso >= from && iso <= to;
  const animals = lotId === null ? data.animals : data.animals.filter((a) => a.lotId === lotId);
  const bullNames = new Map(data.semenBulls.map((bull) => [bull.id, bull.name]));

  const season = { exposed: 0, diagnosed: 0, pregnant: 0, open: 0, awaiting: 0 };
  const calvings = { expected: 0, born: 0, next30: 0, overdue: 0 };
  const bulls = new Map<string, TechnicalReport["byBull"][number]>();
  const horizon = addDays(todayIso, NEXT_CALVINGS_DAYS);

  for (const animal of animals) {
    const record = animal.reproduction;
    if (animal.sex !== "female" || !record) continue;
    const covered = record.breedings.filter((b) => inPeriod(b.date));
    if (covered.length === 0) continue;

    for (const breeding of covered) {
      const name = breeding.semenBullId
        ? (bullNames.get(breeding.semenBullId) ?? UNKNOWN_BULL)
        : breeding.bullEarTag.trim() || UNKNOWN_BULL;
      const type = breeding.type === "timedAI" ? "IATF" : "Monta natural";
      const key = `${type}|${name}`;
      const row = bulls.get(key) ?? { name, type, covered: 0, diagnosed: 0, pregnant: 0, ratePct: null };
      const bred = outcomeOf(record, breeding);
      row.covered += 1;
      if (bred.diagnosed) row.diagnosed += 1;
      if (bred.pregnant) row.pregnant += 1;
      bulls.set(key, row);
    }

    const latest = covered.reduce((a, b) => (b.date > a.date ? b : a));
    const outcome = outcomeOf(record, latest);
    season.exposed += 1;
    if (outcome.diagnosed) season.diagnosed += 1;
    if (outcome.pregnant) season.pregnant += 1;
    if (outcome.diagnosed && !outcome.pregnant) season.open += 1;
    if (awaitsDiagnosis(record, latest, animal.active)) season.awaiting += 1;

    if (!outcome.pregnant) continue;
    calvings.expected += 1;
    if (outcome.calved) {
      calvings.born += 1;
    } else if (animal.active) {
      const due = expectedCalvingDate(latest.date);
      if (due < todayIso) calvings.overdue += 1;
      else if (due <= horizon) calvings.next30 += 1;
    }
  }

  const byBull = [...bulls.values()]
    .map((row) => ({ ...row, ratePct: rate(row.pregnant, row.diagnosed) }))
    .sort(
      (a, b) =>
        b.covered - a.covered || a.name.localeCompare(b.name, "pt-BR", { numeric: true })
    );

  return {
    season: { ...season, ratePct: rate(season.pregnant, season.diagnosed) },
    byBull,
    calvings,
    lots: lotGains(data, animals, params),
    sanitary: sanitary(data, animals, params, todayIso),
  };
}

/** GMD of each lote between each animal's first and last weighing of the period. */
function lotGains(
  data: HerdData,
  animals: Animal[],
  { from, to, lotId }: TechnicalParams
): TechnicalReport["lots"] {
  const lots = lotId === null ? activeLots(data.lots) : data.lots.filter((lot) => lot.id === lotId);
  const rows: TechnicalReport["lots"] = [];
  for (const lot of lots) {
    const gains: { start: number; end: number; days: number; adg: number }[] = [];
    for (const animal of animals) {
      if (animal.lotId !== lot.id) continue;
      const weighings = animal.weighings.filter((w) => w.date >= from && w.date <= to);
      const adg = calculateAdg(weighings);
      if (adg === null) continue;
      const first = weighings[0];
      const last = weighings[weighings.length - 1];
      gains.push({
        start: first.weightKg,
        end: last.weightKg,
        days: daysBetween(first.date, last.date),
        adg,
      });
    }
    if (gains.length === 0) continue;
    rows.push({
      lotName: lot.name,
      weighed: gains.length,
      startKg: mean(gains.map((g) => g.start)),
      endKg: mean(gains.map((g) => g.end)),
      days: Math.round(mean(gains.map((g) => g.days))),
      adg: mean(gains.map((g) => g.adg)),
    });
  }
  return rows.sort((a, b) => a.lotName.localeCompare(b.lotName, "pt-BR", { numeric: true }));
}

/**
 * Sanidade by type: applications done in the period, the manejos they came in
 * (one per date and product) and the animals in the herd in carência today.
 */
function sanitary(
  data: HerdData,
  animals: Animal[],
  { from, to, lotId }: TechnicalParams,
  todayIso: string
): TechnicalReport["sanitary"] {
  const earTags = new Set(animals.map((a) => a.earTag));
  const activeEarTags = new Set(animals.filter((a) => a.active).map((a) => a.earTag));
  const treatments = data.treatments.filter(
    (t) => t.status === "done" && (lotId === null || earTags.has(t.animalEarTag))
  );

  return TREATMENT_TYPES.map((type) => {
    const ofType = treatments.filter((t) => t.type === type);
    const applied = ofType.filter((t) => t.date >= from && t.date <= to);
    const inWithdrawal = new Set(
      ofType
        .filter(
          (t) =>
            activeEarTags.has(t.animalEarTag) &&
            t.withdrawalDays > 0 &&
            t.date <= todayIso &&
            addDays(t.date, t.withdrawalDays) >= todayIso
        )
        .map((t) => t.animalEarTag)
    );
    return {
      type,
      sessions: new Set(applied.map((t) => `${t.date}|${t.name}`)).size,
      applications: applied.length,
      inWithdrawal: inWithdrawal.size,
    };
  }).filter((row) => row.applications > 0 || row.inWithdrawal > 0);
}
