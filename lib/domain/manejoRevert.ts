/**
 * What deleting one manejo undoes, and what stops it.
 *
 * A manejo moved the herd, so deleting it has to put the herd back. The rules
 * read the CURRENT state of each animal, never dates: an animal that has moved
 * lote since, or that is active again, is standing on ground this manejo no
 * longer owns, and reverting it would overwrite whatever happened after. The
 * facts come from the service (SQL); the decision lives here, pure.
 *
 * An inseminação is undone by removing the coberturas it recorded, which puts
 * their doses back in stock — unless one of them was diagnosed already.
 */
import type { ManejoKind, ManejoSessionAnimal } from "@/lib/types";

/**
 * What the decision needs of a session: its kind, where a transferência landed
 * the animals, and the passes themselves. A full ManejoSession satisfies it, and
 * so does the row the delete service already has in hand.
 */
export interface RevertSession {
  kind: ManejoKind;
  destinationLotId?: string;
  animals: ManejoSessionAnimal[];
}

/** Why one animal refuses to be reverted. */
export type RevertBlockReason =
  /** Transferência: the animal is no longer in the lote this manejo put it in. */
  | "moved_lot"
  /** Venda: the animal is active again, or left the herd for another reason. */
  | "not_sold"
  /** Entrada: the animal carries effects this manejo did not create. */
  | "has_history"
  /** The lote the pass found it in was deleted, so there is nowhere to put it back. */
  | "origin_lot_gone"
  /** Inseminação: the cobertura this manejo recorded already has a pregnancy diagnosis. */
  | "has_diagnosis";

export interface BlockedAnimal {
  earTag: string;
  reason: RevertBlockReason;
  /**
   * For `has_diagnosis`: the cobertura whose diagnosis blocks, so the client can
   * offer to clear it. Absent for every other reason.
   */
  breedingId?: string;
}

/** Current state of one animal of the session, gathered by the service. */
export interface AnimalFacts {
  earTag: string;
  lotId: string | null;
  active: boolean;
  /** An effect exists on this animal that this session did not create. */
  hasForeignHistory: boolean;
  /** `previousLotId` points at a lote that is deleted or gone. */
  originLotMissing: boolean;
  /** The cobertura this session's pass recorded (`breedingId`) already has a diagnosis. */
  hasDiagnosis: boolean;
}

/** Everything the delete has to write to put the herd back. */
export interface RevertPlan {
  /** Treatments and boosters to stamp with deleted_at. */
  treatmentIds: string[];
  /** Weighings to stamp with deleted_at. */
  weighingIds: number[];
  /** Animals to put back: into a lote, into the active herd, or both. */
  restore: { earTag: string; lotId?: string; reactivate: boolean }[];
  /** Animals an entrada created: removed outright, they have no history of their own. */
  removeEarTags: string[];
  /** Coberturas an inseminação recorded: removed outright, their doses go back to stock. */
  breedingIds: string[];
}

const emptyPlan = (): RevertPlan => ({
  treatmentIds: [],
  weighingIds: [],
  restore: [],
  removeEarTags: [],
  breedingIds: [],
});

/** Only a pass that actually happened produced anything to undo. */
function handled(entry: ManejoSessionAnimal): boolean {
  return entry.outcome === "done";
}

/**
 * Reason this animal cannot be reverted, or null when it can. A sanitária and a
 * pesagem only ever recorded something, so nothing downstream can be standing
 * on them and they are never refused. An inseminação is refused once its
 * cobertura was diagnosed: removing it would take the diagnosis with it.
 */
function blockReason(
  session: RevertSession,
  entry: ManejoSessionAnimal,
  facts: AnimalFacts
): RevertBlockReason | null {
  if (entry.previousLotId !== undefined && facts.originLotMissing) return "origin_lot_gone";
  if (session.kind === "transfer") {
    return facts.lotId === session.destinationLotId ? null : "moved_lot";
  }
  if (session.kind === "sale") {
    return facts.active ? "not_sold" : null;
  }
  if (session.kind === "entry") {
    return facts.hasForeignHistory ? "has_history" : null;
  }
  if (session.kind === "insemination") {
    return facts.hasDiagnosis ? "has_diagnosis" : null;
  }
  return null;
}

/**
 * Decides what one session's delete reverts. A refusal is total: when any
 * animal is blocked the plan comes back empty, because half a reverted venda is
 * worse than none.
 */
export function revertDecision(
  session: RevertSession,
  facts: AnimalFacts[]
): { plan: RevertPlan; blocked: BlockedAnimal[] } {
  const byEarTag = new Map(facts.map((f) => [f.earTag, f]));
  const blocked: BlockedAnimal[] = [];
  const plan = emptyPlan();

  for (const entry of session.animals) {
    if (!handled(entry)) continue;
    const animal = byEarTag.get(entry.earTag);
    if (!animal) continue;

    const reason = blockReason(session, entry, animal);
    if (reason !== null) {
      blocked.push(
        reason === "has_diagnosis" && entry.breedingId !== undefined
          ? { earTag: entry.earTag, reason, breedingId: entry.breedingId }
          : { earTag: entry.earTag, reason }
      );
      continue;
    }

    if (entry.treatmentId !== undefined) plan.treatmentIds.push(entry.treatmentId);
    if (entry.boosterId !== undefined) plan.treatmentIds.push(entry.boosterId);
    if (entry.weighingId !== undefined) plan.weighingIds.push(entry.weighingId);
    if (entry.breedingId !== undefined) plan.breedingIds.push(entry.breedingId);

    if (entry.createdAnimal) {
      plan.removeEarTags.push(entry.earTag);
      continue;
    }
    const reactivate = session.kind === "sale";
    if (entry.previousLotId !== undefined || reactivate) {
      plan.restore.push({
        earTag: entry.earTag,
        ...(entry.previousLotId !== undefined ? { lotId: entry.previousLotId } : {}),
        reactivate,
      });
    }
  }

  return blocked.length > 0 ? { plan: emptyPlan(), blocked } : { plan, blocked };
}
