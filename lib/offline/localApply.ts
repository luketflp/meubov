/**
 * Optimistic effects of a queued manejo operation: what the server's use case
 * will write, computed on the phone with the same buildPassEffects and marked
 * provisional (`localOpId`, `local:` ids, negative weighing ids) until the sync
 * reconciles it through the store's merge helpers.
 */
import { baixaPassNote, buildPassEffects, sessionName, type TreatmentEffect } from "@/lib/domain/manejo";
import type { OutboxOp } from "@/lib/offline/types";
import type { CompleteResult } from "@/lib/store/manejoMerge";
import type { ManejoPassData, NewBaixa, NewManejoSession } from "@/lib/store/useHerdStore";
import type {
  Animal,
  Breeding,
  ManejoSession,
  ManejoSessionAnimal,
  SemenBull,
  Treatment,
  Weighing,
} from "@/lib/types";

/** A pass applied on the phone; a baixa also says why and when the animal left. */
export interface LocalApplyResult extends CompleteResult {
  animal?: CompleteResult["animal"] &
    Partial<Pick<Animal, "inactiveReason" | "inactiveDate" | "inactiveNotes">>;
}

export interface LocalApplyContext {
  session: ManejoSession;
  animal: Animal;
  semenBulls: SemenBull[];
  today: string;
}

let weighingsMade = 0;

/** Negative id, so it never meets a server weighing id (serial, positive). */
function provisionalWeighing(weighing: Weighing, localOpId: string): Weighing {
  weighingsMade += 1;
  return { ...weighing, id: -(Date.now() % 1e9) - weighingsMade, localOpId };
}

const localId = () => `local:${crypto.randomUUID()}`;

/** The server keeps a note only when something is left after trimming. */
const trimmed = (notes: string | undefined) => notes?.trim() || undefined;

/**
 * The records one pass, skip, refugo/dúvida or baixa creates, as the server's
 * use case would write them. Null for the kinds the store applies itself
 * (start, reopen, carcass-yield, close).
 */
export function localApply(op: OutboxOp, ctx: LocalApplyContext): LocalApplyResult | null {
  const { session, animal } = ctx;
  const existing: ManejoSessionAnimal = session.animals.find((a) => a.earTag === animal.earTag) ?? {
    earTag: animal.earTag,
    outcome: "pending",
  };
  const mark = { pending: true, localOpId: op.id };

  switch (op.kind) {
    case "complete":
      return completePass(op, ctx, { ...existing, ...mark });
    case "skip": {
      const body = op.body as { notes?: string };
      return {
        entry: { ...existing, outcome: "skipped", notes: trimmed(body.notes), ...mark },
        treatments: [],
      };
    }
    case "set-aside": {
      const body = op.body as { list: "rejected" | "held"; weightKg?: number; notes?: string };
      const weighing =
        session.weighing && body.weightKg !== undefined
          ? provisionalWeighing({ date: session.date, weightKg: body.weightKg }, op.id)
          : undefined;
      return {
        entry: {
          ...existing,
          outcome: body.list,
          weightKg: weighing?.weightKg,
          notes: trimmed(body.notes),
          ...mark,
        },
        treatments: [],
        weighing,
      };
    }
    case "baixa": {
      const body = op.body as unknown as NewBaixa;
      return {
        entry: { ...existing, outcome: "skipped", notes: baixaPassNote(body.reason, body.notes), ...mark },
        treatments: [],
        animal: {
          earTag: animal.earTag,
          active: false,
          lotId: animal.lotId,
          inactiveReason: body.reason,
          inactiveDate: body.date,
          inactiveNotes: trimmed(body.notes),
        },
      };
    }
    default:
      return null;
  }
}

/** CompleteAnimal's writes: treatments, weighing, cobertura, lot/sale, entry. */
function completePass(
  op: OutboxOp,
  { session, animal, semenBulls }: LocalApplyContext,
  entry: ManejoSessionAnimal
): LocalApplyResult {
  const data = op.body as ManejoPassData;
  const effects = buildPassEffects(session, data);

  const treatments: Treatment[] = [effects.treatment, effects.booster]
    .filter((t): t is TreatmentEffect => t !== undefined)
    .map((t) => ({ id: localId(), animalEarTag: animal.earTag, ...t, localOpId: op.id }));

  const weighing = effects.weighing && provisionalWeighing(effects.weighing, op.id);

  // Named like the server's bullEarTagOf: the bull's code, or its name.
  const bull = semenBulls.find((b) => b.id === effects.breeding?.semenBullId);
  const breeding: Breeding | undefined =
    effects.breeding && bull
      ? { id: localId(), ...effects.breeding, bullEarTag: bull.code || bull.name, localOpId: op.id }
      : undefined;

  const moves = effects.lotId !== undefined || effects.sold === true;
  return {
    entry: {
      ...entry,
      outcome: "done",
      weightKg: effects.weighing?.weightKg,
      notes: trimmed(data.notes),
      amountBrl: effects.amountBrl,
      carcassYieldPct: effects.carcassYieldPct,
      previousLotId: moves ? animal.lotId : undefined,
    },
    treatments,
    weighing,
    animal: moves
      ? {
          earTag: animal.earTag,
          active: effects.sold ? false : animal.active,
          lotId: effects.lotId ?? animal.lotId,
        }
      : undefined,
    breeding,
  };
}

/** The session an offline start opens, as StartSessionUseCase would return it. */
export function localStartSession(op: OutboxOp): ManejoSession {
  const body = op.body as unknown as NewManejoSession;
  return {
    id: op.sessionId,
    name: sessionName(body.treatment, body.kind),
    date: body.date,
    status: "open",
    kind: body.kind,
    weighing: body.weighing,
    treatment: body.treatment,
    animals: body.earTags.map((earTag) => ({ earTag, outcome: "pending" })),
    destinationLotId: body.destinationLotId,
    counterparty: body.counterparty,
    pricePerArroba: body.pricePerArroba,
    carcassYieldPct: body.carcassYieldPct,
    totalAmountBrl: body.totalAmountBrl,
    semenBullIds:
      body.kind === "insemination" ? [...new Set(body.semenBullIds ?? [])] : undefined,
    notes: body.notes,
    pending: true,
  };
}
