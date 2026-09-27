/**
 * Pure merges of the manejo actions' answers into the herd store's slices. The
 * online actions and the offline sync reconcile through these same functions,
 * so a pass lands in the store the same way whichever path it took.
 */
import type {
  Animal,
  Breeding,
  HerdData,
  ManejoSession,
  ManejoSessionAnimal,
  ReproductionRecord,
  Treatment,
  Weighing,
} from "@/lib/types";

/** The store slices a manejo pass can touch. */
export type HerdSlices = Pick<HerdData, "animals" | "treatments" | "manejoSessions" | "semenBulls">;

/** Herd change a manejo pass applied to one animal (lot, herd membership). */
export interface PassAnimalPatch {
  earTag: string;
  active: boolean;
  lotId: string;
}

/** Answer of a completed pass. */
export interface CompleteResult {
  entry: ManejoSessionAnimal;
  treatments: Treatment[];
  weighing?: Weighing;
  animal?: PassAnimalPatch;
  breeding?: Breeding;
}

/** Answer of a refugo / dúvida. */
export interface SetAsideResult {
  entry: ManejoSessionAnimal;
  weighing?: Weighing;
}

/** What a baixa at the brete changed on the animal. */
export type BaixaAnimalPatch = Pick<Animal, "active" | "inactiveReason" | "inactiveDate" | "inactiveNotes">;

/** Answer of an undone pass. */
export interface ReopenResult {
  entry: ManejoSessionAnimal;
  removedTreatmentIds: string[];
  removedWeighing?: Weighing;
  animal?: PassAnimalPatch;
  removedEarTag?: string;
  removedBreedingId?: string;
}

/** Answer of a new rendimento de carcaça on a venda. */
export interface CarcassYieldResult {
  carcassYieldPct: number;
  amounts: { earTag: string; amountBrl: number }[];
}

export const compareByDate = (a: { date: string }, b: { date: string }): number =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : 0;

/** A female with no reproduction history yet — she can still receive records. */
const EMPTY_REPRODUCTION: ReproductionRecord = {
  breedings: [],
  diagnoses: [],
  calvings: [],
};

/** Immutably updates one female's reproduction record, creating it if absent. */
export function withReproduction(
  animals: Animal[],
  earTag: string,
  update: (record: ReproductionRecord) => ReproductionRecord
): Animal[] {
  return animals.map((a) =>
    a.earTag === earTag
      ? { ...a, reproduction: update(a.reproduction ?? EMPTY_REPRODUCTION) }
      : a
  );
}

/** Immutably replaces one animal entry inside one session. */
function withSessionAnimal(
  sessions: ManejoSession[],
  sessionId: string,
  earTag: string,
  entry: ManejoSessionAnimal
): ManejoSession[] {
  return sessions.map((m) =>
    m.id === sessionId
      ? { ...m, animals: m.animals.map((a) => (a.earTag === earTag ? entry : a)) }
      : m
  );
}

/** Appends one weighing to one animal, keeping the readings sorted by date. */
function withWeighing(animals: Animal[], earTag: string, weighing: Weighing): Animal[] {
  return animals.map((a) =>
    a.earTag === earTag
      ? { ...a, weighings: [...a.weighings, weighing].sort(compareByDate) }
      : a
  );
}

export function mergeCompleteResult(
  s: HerdSlices,
  sessionId: string,
  earTag: string,
  result: CompleteResult
): HerdSlices {
  let animals = s.animals;
  // An inseminação pass recorded an IATF cobertura on the cow.
  const breeding = result.breeding;
  if (breeding) {
    animals = withReproduction(animals, earTag, (r) => ({
      ...r,
      breedings: [...r.breedings, breeding],
    }));
  }
  if (result.weighing) animals = withWeighing(animals, earTag, result.weighing);
  // A transferência/venda pass moved the animal: take the server's word for
  // its lot and herd membership.
  const patch = result.animal;
  if (patch) {
    animals = animals.map((a) =>
      a.earTag === patch.earTag
        ? { ...a, active: patch.active, lotId: patch.lotId }
        : a
    );
  }
  return {
    ...s,
    treatments: [...s.treatments, ...result.treatments],
    animals,
    manejoSessions: withSessionAnimal(s.manejoSessions, sessionId, earTag, result.entry),
  };
}

export function mergeSkipResult(
  s: HerdSlices,
  sessionId: string,
  earTag: string,
  entry: ManejoSessionAnimal
): HerdSlices {
  return { ...s, manejoSessions: withSessionAnimal(s.manejoSessions, sessionId, earTag, entry) };
}

export function mergeSetAsideResult(
  s: HerdSlices,
  sessionId: string,
  earTag: string,
  result: SetAsideResult
): HerdSlices {
  return {
    ...s,
    animals: result.weighing ? withWeighing(s.animals, earTag, result.weighing) : s.animals,
    manejoSessions: withSessionAnimal(s.manejoSessions, sessionId, earTag, result.entry),
  };
}

export function mergeBaixaResult(
  s: HerdSlices,
  sessionId: string,
  earTag: string,
  result: { entry: ManejoSessionAnimal; animal: BaixaAnimalPatch }
): HerdSlices {
  return {
    ...s,
    animals: s.animals.map((a) =>
      a.earTag === earTag
        ? {
            ...a,
            active: result.animal.active,
            inactiveReason: result.animal.inactiveReason,
            inactiveDate: result.animal.inactiveDate,
            inactiveNotes: result.animal.inactiveNotes,
          }
        : a
    ),
    manejoSessions: withSessionAnimal(s.manejoSessions, sessionId, earTag, result.entry),
  };
}

export function mergeReopenResult(
  s: HerdSlices,
  sessionId: string,
  earTag: string,
  result: ReopenResult
): HerdSlices {
  const removedIds = new Set(result.removedTreatmentIds);
  const treatments =
    removedIds.size > 0 ? s.treatments.filter((t) => !removedIds.has(t.id)) : s.treatments;

  // Undoing an entry pass unregisters the animal it created.
  if (result.removedEarTag !== undefined) {
    const gone = result.removedEarTag;
    return {
      ...s,
      treatments,
      animals: s.animals.filter((a) => a.earTag !== gone),
      manejoSessions: s.manejoSessions.map((session) =>
        session.id === sessionId
          ? { ...session, animals: session.animals.filter((a) => a.earTag !== gone) }
          : session
      ),
    };
  }

  let animals = s.animals;
  const removed = result.removedWeighing;
  if (removed) {
    animals = animals.map((a) => {
      if (a.earTag !== earTag) return a;
      // Remove the single weighing the pass appended (last date+value match).
      let index = -1;
      for (let i = a.weighings.length - 1; i >= 0; i--) {
        if (a.weighings[i].date === removed.date && a.weighings[i].weightKg === removed.weightKg) {
          index = i;
          break;
        }
      }
      if (index === -1) return a;
      return { ...a, weighings: a.weighings.filter((_, i) => i !== index) };
    });
  }

  // Undoing an inseminação pass deleted its cobertura; the dose is back in stock.
  const breedingId = result.removedBreedingId;
  if (breedingId !== undefined) {
    animals = withReproduction(animals, earTag, (r) => ({
      ...r,
      breedings: r.breedings.filter((b) => b.id !== breedingId),
    }));
  }

  // The undo put the animal back in its lot / in the active herd.
  const patch = result.animal;
  if (patch) {
    animals = animals.map((a) =>
      a.earTag === patch.earTag
        ? { ...a, active: patch.active, lotId: patch.lotId }
        : a
    );
  }

  return {
    ...s,
    treatments,
    animals,
    manejoSessions: withSessionAnimal(s.manejoSessions, sessionId, earTag, result.entry),
  };
}

export function mergeCarcassYield(
  s: HerdSlices,
  sessionId: string,
  result: CarcassYieldResult
): HerdSlices {
  const amountByEarTag = new Map(result.amounts.map((a) => [a.earTag, a.amountBrl]));
  return {
    ...s,
    manejoSessions: s.manejoSessions.map((m) =>
      m.id === sessionId
        ? {
            ...m,
            carcassYieldPct: result.carcassYieldPct,
            animals: m.animals.map((a) => {
              const amountBrl = amountByEarTag.get(a.earTag);
              return amountBrl === undefined ? a : { ...a, amountBrl };
            }),
          }
        : m
    ),
  };
}

export function mergeClose(s: HerdSlices, sessionId: string): HerdSlices {
  return {
    ...s,
    manejoSessions: s.manejoSessions.map((m) =>
      m.id === sessionId ? { ...m, status: "closed" as const } : m
    ),
  };
}

export function mergeStart(s: HerdSlices, session: ManejoSession): HerdSlices {
  return { ...s, manejoSessions: [...s.manejoSessions, session] };
}

/**
 * Takes back what one queued operation applied on the phone: every treatment,
 * weighing and cobertura carrying its `localOpId`, and the entry it marked,
 * back to pending. A local transfer or sale also puts the animal back the way
 * the server's undo does (old lot, back in the herd). The pending session of
 * an offline start goes when `startedSessionId` names it.
 */
export function stripLocal(
  s: HerdSlices,
  localOpId: string,
  opts: { startedSessionId?: string } = {}
): HerdSlices {
  const mine = (record: { localOpId?: string }) => record.localOpId === localOpId;

  let restore: { earTag: string; lotId?: string; sold: boolean } | undefined;
  for (const m of s.manejoSessions) {
    const entry = m.animals.find(mine);
    if (entry) {
      restore = {
        earTag: entry.earTag,
        lotId: entry.previousLotId,
        sold: m.kind === "sale" && entry.outcome === "done",
      };
    }
  }

  const manejoSessions = s.manejoSessions
    .filter((m) => !(m.pending && m.id === opts.startedSessionId))
    .map((m) =>
      m.animals.some(mine)
        ? {
            ...m,
            animals: m.animals.map((a) =>
              mine(a) ? { earTag: a.earTag, outcome: "pending" as const } : a
            ),
          }
        : m
    );

  const animals = s.animals.map((a) => {
    const weighings = a.weighings.filter((w) => !mine(w));
    const breedings = a.reproduction?.breedings.filter((b) => !mine(b));
    const back = restore?.earTag === a.earTag ? restore : undefined;
    const untouched =
      weighings.length === a.weighings.length &&
      breedings?.length === a.reproduction?.breedings.length &&
      !back;
    if (untouched) return a;
    return {
      ...a,
      weighings,
      ...(a.reproduction && breedings ? { reproduction: { ...a.reproduction, breedings } } : {}),
      ...(back?.lotId !== undefined ? { lotId: back.lotId } : {}),
      ...(back?.sold ? { active: true, inactiveReason: undefined, inactiveDate: undefined } : {}),
    };
  });

  return { ...s, animals, treatments: s.treatments.filter((t) => !mine(t)), manejoSessions };
}
