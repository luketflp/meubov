/**
 * The Ultrassom list: the coberturas waiting for the vet, grouped by the lote
 * each cow is in today — the lote the vet works through at the brete, and the
 * same split as the Coberturas tab.
 *
 * A cobertura awaits diagnosis while it is the dam's latest one, the dam is
 * still in the herd, nothing but "pending" was recorded for it and no calving
 * came after it. A cow an inseminação recorded stays on the list once
 * diagnosed while another cow of that inseminação still waits, so the vet sees
 * the result filling in as the exams go; the coberturas no inseminação
 * recorded (monta natural, a single IATF) show only while they wait. A lote
 * shows while one of its cows waits.
 *
 * Pure: the tab hands in the herd, the manejos, the bulls and the lotes from
 * the store.
 */
import type {
  Animal,
  Breeding,
  DiagnosisResult,
  Lot,
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

/** One cobertura on the Ultrassom list. */
export interface UltrasoundRow {
  dam: Animal;
  breeding: Breeding;
  /** The registered semen bull whose dose it used. */
  bull: SemenBull | null;
  /** "pending" while it awaits diagnosis. */
  result: DiagnosisResult;
  /** The vet's observação at the exam, when the diagnosis has one. */
  notes?: string;
  /** Days since the cobertura. */
  days: number;
}

/** One lote of the Ultrassom list. */
export interface UltrasoundGroup {
  /** The lote id, or "sem-lote" for the dams whose lote resolves to nothing. */
  key: string;
  /** The lote the cows are in today; null gathers the dams whose lote resolves to nothing. */
  lotId: string | null;
  /** The lote's name, a deleted one included; null with the null lote. */
  name: string | null;
  /** Awaiting diagnosis first, then the diagnosed ones; each by ear tag. */
  rows: UltrasoundRow[];
  pending: number;
  pregnant: number;
  open: number;
}

/** The key of the dams whose lote resolves to nothing. */
export const NO_LOT_KEY = "sem-lote";

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

/** The row of one cobertura, with its result now. */
function ultrasoundRow(
  dam: Animal,
  record: ReproductionRecord,
  breeding: Breeding,
  bullsById: Map<string, SemenBull>,
  todayIso: string
): UltrasoundRow {
  const { result, diagnosis } = breedingOutcome(record, breeding);
  return {
    dam,
    breeding,
    bull:
      breeding.semenBullId === undefined ? null : (bullsById.get(breeding.semenBullId) ?? null),
    result,
    ...(diagnosis?.notes ? { notes: diagnosis.notes } : {}),
    days: daysBetween(breeding.date, todayIso),
  };
}

/**
 * The Ultrassom lotes, by name the way a person numbers them ("Lote 2" before
 * "Lote 10"), the unknown lote last. A cobertura belongs to the inseminação
 * whose pass recorded it (a session entry's `breedingId`).
 */
export function ultrasoundGroups(
  animals: Animal[],
  sessions: ManejoSession[],
  bulls: SemenBull[],
  lots: Lot[],
  todayIso: string
): UltrasoundGroup[] {
  const bullsById = new Map(bulls.map((bull) => [bull.id, bull]));
  const nameById = new Map(lots.map((lot) => [lot.id, lot.name]));
  const sessionOf = new Map<string, string>();
  for (const session of sessions) {
    for (const entry of session.animals) {
      if (entry.breedingId !== undefined) sessionOf.set(entry.breedingId, session.id);
    }
  }

  const waiting: UltrasoundRow[] = [];
  const diagnosed: UltrasoundRow[] = [];
  for (const dam of animals) {
    const record = dam.reproduction;
    if (!record) continue;
    for (const breeding of record.breedings) {
      const awaiting = awaitsDiagnosis(record, breeding, dam.active);
      const row = ultrasoundRow(dam, record, breeding, bullsById, todayIso);
      if (awaiting) waiting.push(row);
      else if (sessionOf.has(breeding.id) && isDiagnosed(row.result)) diagnosed.push(row);
    }
  }

  // An inseminação's diagnosed cows show only while one of its cows still waits.
  const goingSessions = new Set(
    waiting.flatMap((row) => sessionOf.get(row.breeding.id) ?? [])
  );
  const listed = [
    ...waiting,
    ...diagnosed.filter((row) => goingSessions.has(sessionOf.get(row.breeding.id) ?? "")),
  ];

  const byLot = new Map<string | null, UltrasoundRow[]>();
  for (const row of listed) {
    const lotId = nameById.has(row.dam.lotId) ? row.dam.lotId : null;
    const rows = byLot.get(lotId);
    if (rows) rows.push(row);
    else byLot.set(lotId, [row]);
  }

  return [...byLot]
    .map(([lotId, rows]): UltrasoundGroup => {
      const sorted = sortRows(rows);
      return {
        key: lotId ?? NO_LOT_KEY,
        lotId,
        name: lotId === null ? null : (nameById.get(lotId) ?? null),
        rows: sorted,
        ...counts(sorted),
      };
    })
    .filter((group) => group.pending > 0)
    .sort((a, b) => {
      if (a.name === null || b.name === null) return a.name === null ? 1 : -1;
      return a.name.localeCompare(b.name, "pt-BR", { numeric: true });
    });
}

/**
 * The cows of a brete: the coberturas it started with, in that order, each
 * with its result now. A cobertura no longer found, or whose dam left the
 * herd, drops out.
 */
export function breteRows(
  breedingIds: string[],
  animals: Animal[],
  bulls: SemenBull[],
  todayIso: string
): UltrasoundRow[] {
  const bullsById = new Map(bulls.map((bull) => [bull.id, bull]));
  const found = new Map<string, { dam: Animal; record: ReproductionRecord; breeding: Breeding }>();
  for (const dam of animals) {
    const record = dam.reproduction;
    if (!record || !dam.active) continue;
    for (const breeding of record.breedings) found.set(breeding.id, { dam, record, breeding });
  }
  return breedingIds.flatMap((id) => {
    const hit = found.get(id);
    return hit === undefined
      ? []
      : [ultrasoundRow(hit.dam, hit.record, hit.breeding, bullsById, todayIso)];
  });
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
