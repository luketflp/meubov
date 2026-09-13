/**
 * The Ultrassom list: the coberturas waiting for the vet, grouped the way the
 * cows come back to the brete — by the inseminação that recorded them.
 *
 * A cobertura awaits diagnosis while it is the dam's latest one, the dam is
 * still in the herd, nothing but "pending" was recorded for it and no calving
 * came after it. An inseminação stays on the list while one of its cows still
 * waits, and then shows every cow it inseminated, so the vet sees the lote's
 * result filling in as the exams go. The coberturas no inseminação recorded
 * (monta natural, a single IATF) fall into "Coberturas avulsas", last, and only
 * while they wait.
 *
 * Pure: the tab hands in the herd, the manejos and the bulls from the store.
 */
import type {
  Animal,
  Breeding,
  DiagnosisResult,
  ManejoSession,
  ReproductionRecord,
  SemenBull,
} from "@/lib/types";
import { daysBetween } from "@/lib/domain/dates";
import { compareEarTags } from "@/lib/domain/earTags";
import {
  breedingOutcome,
  currentDiagnosis,
  hasCalvedSince,
  isDiagnosed,
} from "@/lib/domain/reproduction";
import { predominantLotId } from "@/lib/domain/semen";

/** One cobertura on the Ultrassom list. */
export interface UltrasoundRow {
  dam: Animal;
  breeding: Breeding;
  /** The registered semen bull whose dose it used. */
  bull: SemenBull | null;
  /** "pending" while it awaits diagnosis. */
  result: DiagnosisResult;
  /** Days since the cobertura. */
  days: number;
}

/** One card of the Ultrassom list: an inseminação, or the coberturas avulsas. */
export interface UltrasoundGroup {
  /** The session id, or "avulsas". */
  key: string;
  /** The session's date; null for the coberturas avulsas. */
  date: string | null;
  /** The lote most of its cows are in now; null for the coberturas avulsas. */
  lotId: string | null;
  /** Days since the inseminação; null for the coberturas avulsas. */
  days: number | null;
  /** Awaiting diagnosis first, then the diagnosed ones; each by ear tag. */
  rows: UltrasoundRow[];
  pending: number;
  pregnant: number;
  open: number;
}

const LOOSE_KEY = "avulsas";

/**
 * True when the cobertura still waits for the ultrassom: it is the dam's latest,
 * the dam is active, no pregnant or open result was recorded for it and she has
 * not calved on or after its date. A recorded "pending" is an exam that could
 * not tell yet, so the cow stays on the list.
 */
export function awaitsDiagnosis(
  record: ReproductionRecord,
  breeding: Breeding,
  active: boolean
): boolean {
  if (!active) return false;
  if (currentDiagnosis(record)?.breeding.id !== breeding.id) return false;
  if (isDiagnosed(breedingOutcome(record, breeding).result)) return false;
  return !hasCalvedSince(record, breeding.date);
}

/** The rows in list order: awaiting first, then diagnosed, each by ear tag. */
function sortRows(rows: UltrasoundRow[]): UltrasoundRow[] {
  const diagnosed = (row: UltrasoundRow) => (isDiagnosed(row.result) ? 1 : 0);
  return [...rows].sort(
    (a, b) => diagnosed(a) - diagnosed(b) || compareEarTags(a.dam.earTag, b.dam.earTag)
  );
}

/** A group's counts, always of the rows it carries. */
function counts(rows: UltrasoundRow[]): Pick<UltrasoundGroup, "pending" | "pregnant" | "open"> {
  const of = (result: DiagnosisResult) => rows.filter((row) => row.result === result).length;
  return { pending: of("pending"), pregnant: of("pregnant"), open: of("open") };
}

/**
 * The Ultrassom cards: one per inseminação with a cow still awaiting diagnosis,
 * oldest first, then the coberturas avulsas that await. A cobertura belongs to
 * the inseminação whose pass recorded it (a session entry's `breedingId`).
 */
export function ultrasoundGroups(
  animals: Animal[],
  sessions: ManejoSession[],
  bulls: SemenBull[],
  todayIso: string
): UltrasoundGroup[] {
  const bullsById = new Map(bulls.map((bull) => [bull.id, bull]));
  const sessionOf = new Map<string, ManejoSession>();
  for (const session of sessions) {
    for (const entry of session.animals) {
      if (entry.breedingId !== undefined) sessionOf.set(entry.breedingId, session);
    }
  }

  const sessionRows = new Map<string, UltrasoundRow[]>();
  const looseRows: UltrasoundRow[] = [];
  for (const dam of animals) {
    const record = dam.reproduction;
    if (!record) continue;
    for (const breeding of record.breedings) {
      const awaiting = awaitsDiagnosis(record, breeding, dam.active);
      const { result } = breedingOutcome(record, breeding);
      const session = sessionOf.get(breeding.id);
      // An inseminação also shows its diagnosed cows; the avulsas only wait.
      const listed = awaiting || (session !== undefined && isDiagnosed(result));
      if (!listed) continue;

      const bull =
        breeding.semenBullId === undefined ? null : (bullsById.get(breeding.semenBullId) ?? null);
      const row: UltrasoundRow = {
        dam,
        breeding,
        bull,
        result,
        days: daysBetween(breeding.date, todayIso),
      };
      if (session === undefined) {
        looseRows.push(row);
      } else if (sessionRows.has(session.id)) {
        sessionRows.get(session.id)?.push(row);
      } else {
        sessionRows.set(session.id, [row]);
      }
    }
  }

  const groups: UltrasoundGroup[] = sessions
    .filter((session) => sessionRows.get(session.id)?.some((row) => !isDiagnosed(row.result)))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id.localeCompare(b.id)))
    .map((session) => {
      const rows = sortRows(sessionRows.get(session.id) ?? []);
      return {
        key: session.id,
        date: session.date,
        lotId: predominantLotId(rows.map((row) => row.dam.earTag), animals),
        days: daysBetween(session.date, todayIso),
        rows,
        ...counts(rows),
      };
    });

  if (looseRows.length > 0) {
    const rows = sortRows(looseRows);
    groups.push({
      key: LOOSE_KEY,
      date: null,
      lotId: null,
      days: null,
      rows,
      ...counts(rows),
    });
  }
  return groups;
}

/** Every cobertura awaiting diagnosis across the groups: the total on the toolbar. */
export function pendingDiagnosisCount(groups: UltrasoundGroup[]): number {
  return groups.reduce((total, group) => total + group.pending, 0);
}

/**
 * The groups narrowed to the rows whose ear tag contains the search, ignoring
 * case; a group left without rows is dropped and the counts follow the rows
 * that stayed. A blank search keeps everything.
 */
export function searchUltrasound(groups: UltrasoundGroup[], search: string): UltrasoundGroup[] {
  const term = search.trim().toLowerCase();
  if (term === "") return groups;
  return groups.flatMap((group) => {
    const rows = group.rows.filter((row) => row.dam.earTag.toLowerCase().includes(term));
    return rows.length === 0 ? [] : [{ ...group, rows, ...counts(rows) }];
  });
}
