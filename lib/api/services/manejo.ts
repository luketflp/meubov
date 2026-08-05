/**
 * Write path — manejo sessions (the transactional core of the herd API).
 *
 * Effects (treatments, weighings, lot changes, sales) are applied incrementally
 * per animal, never as one atomic batch — a manejo takes hours. Each pass runs
 * in a transaction with the session-animal row locked (FOR UPDATE), so two
 * devices at the same chute cannot double-fire an animal. What a pass produces
 * comes from the pure domain rules in lib/domain/manejo.ts.
 *
 * Sessions of kind transfer/sale/entry are the farm's compras, vendas e
 * transferências: they move the herd here, and the ledger reads them back as
 * movements (lib/domain/movements.ts).
 */
import { randomUUID } from "node:crypto";
import { and, count, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  animals,
  manejoSessionAnimals,
  manejoSessions,
  treatments,
  weighings,
} from "@/lib/db/schema";
import type {
  Animal,
  ManejoSession,
  ManejoSessionAnimal,
  ManejoTreatmentPlan,
  Treatment,
  Weighing,
} from "@/lib/types";
import type { ManejoPassData, NewManejoSession } from "@/lib/store/useHerdStore";
import { buildPassEffects, sessionName } from "@/lib/domain/manejo";
import { insertAnimal, type NewAnimalInput } from "@/lib/api/services/animals";
import {
  toManejoPlan,
  toManejoSession,
  toManejoSessionAnimal,
  toTreatment,
} from "@/lib/api/services/mappers";

/** Herd change a pass applied to one animal (for the client-side merge). */
export interface AnimalPatch {
  earTag: string;
  active: boolean;
  lotId: string;
}

/** Result of one completed pass (for the client-side merge). */
export interface CompleteResult {
  entry: ManejoSessionAnimal;
  treatments: Treatment[];
  weighing?: Weighing;
  /** Present when the pass moved or sold the animal. */
  animal?: AnimalPatch;
}

/** Result of undoing one pass. */
export interface ReopenResult {
  entry: ManejoSessionAnimal;
  removedTreatmentIds: string[];
  removedWeighing?: Weighing;
  /** Present when the undo put the animal back in its lot or in the herd. */
  animal?: AnimalPatch;
  /** Ear tag of the animal deleted by undoing an entry pass. */
  removedEarTag?: string;
}

/** Result of registering one animal that arrived in an entry session. */
export interface EntryResult {
  entry: ManejoSessionAnimal;
  animal: Animal;
}

/** Conflict outcomes a pass can hit; routes map these to 409. */
export type ManejoConflict = "session_not_open" | "entry_not_actionable";

const conflict = (code: ManejoConflict): { conflict: ManejoConflict } => ({
  conflict: code,
});

/**
 * Opens a session with every selected animal pending, in chute-line order.
 *
 * An entry session opens EMPTY on purpose: the animals it registers do not
 * exist yet and join the herd one by one, as the truck unloads at the curral
 * (see `registerEntryAnimal`).
 */
export async function startSession(
  farmId: number,
  input: NewManejoSession
): Promise<ManejoSession | null> {
  return db.transaction(async (tx) => {
    const herd =
      input.earTags.length === 0
        ? []
        : await tx
            .select({ id: animals.id, earTag: animals.earTag })
            .from(animals)
            .where(and(eq(animals.farmId, farmId), inArray(animals.earTag, input.earTags)));
    const idByEarTag = new Map(herd.map((a) => [a.earTag, a.id]));
    if (input.earTags.some((earTag) => !idByEarTag.has(earTag))) return null;

    const plan: ManejoTreatmentPlan | undefined = input.treatment;
    const [sessionRow] = await tx
      .insert(manejoSessions)
      .values({
        id: randomUUID(),
        farmId,
        name: sessionName(plan, input.kind),
        date: input.date,
        status: "open",
        kind: input.kind,
        weighing: input.weighing,
        notes: input.notes,
        destinationLotId: input.destinationLotId,
        counterparty: input.counterparty,
        pricePerArroba: input.pricePerArroba,
        totalAmountBrl: input.totalAmountBrl,
        planType: plan?.type,
        planName: plan?.name,
        planWithdrawalDays: plan?.withdrawalDays,
        planDose: plan?.dose,
        planResponsible: plan?.responsible,
        planCostBrl: plan?.costBrl,
        planNextDate: plan?.nextDate,
        planNotes: plan?.notes,
      })
      .returning();

    if (input.earTags.length === 0) return toManejoSession(sessionRow, []);

    const entryRows = await tx
      .insert(manejoSessionAnimals)
      .values(
        input.earTags.map((earTag, position) => ({
          sessionId: sessionRow.id,
          animalId: idByEarTag.get(earTag)!,
          position,
          outcome: "pending" as const,
        }))
      )
      .returning();

    const earTagByAnimal = new Map(herd.map((a) => [a.id, a.earTag]));
    return toManejoSession(
      sessionRow,
      entryRows
        .sort((a, b) => a.position - b.position)
        .map((row) => toManejoSessionAnimal(row, earTagByAnimal.get(row.animalId)!))
    );
  });
}

/** Loads and locks one session + one entry by the animal's stable id. */
async function lockEntry(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  farmId: number,
  sessionId: string,
  animalId: string
) {
  const [session] = await tx
    .select()
    .from(manejoSessions)
    .where(and(eq(manejoSessions.id, sessionId), eq(manejoSessions.farmId, farmId)))
    .for("update");
  if (!session) return { session: undefined, entry: undefined, animal: undefined };
  const [animal] = await tx
    .select({ id: animals.id, earTag: animals.earTag, lotId: animals.lotId })
    .from(animals)
    .where(and(eq(animals.farmId, farmId), eq(animals.id, animalId)))
    .limit(1);
  if (!animal) return { session, entry: undefined, animal: undefined };
  const [entry] = await tx
    .select()
    .from(manejoSessionAnimals)
    .where(
      and(
        eq(manejoSessionAnimals.sessionId, session.id),
        eq(manejoSessionAnimals.animalId, animal.id)
      )
    )
    .for("update");
  return { session, entry, animal };
}

/** Columns the client merges back into its herd after a pass. */
const ANIMAL_PATCH_COLUMNS = {
  earTag: animals.earTag,
  active: animals.active,
  lotId: animals.lotId,
} as const;

/** Applies the session's effects to one animal and marks it done. */
export async function completeAnimal(
  farmId: number,
  sessionId: string,
  animalId: string,
  data: ManejoPassData
): Promise<CompleteResult | { conflict: ManejoConflict } | null> {
  return db.transaction(async (tx) => {
    const { session, entry, animal } = await lockEntry(tx, farmId, sessionId, animalId);
    if (!session || !entry || !animal) return null;
    if (session.status !== "open") return conflict("session_not_open");
    if (entry.outcome !== "pending") return conflict("entry_not_actionable");
    const earTag = animal.earTag;

    const effects = buildPassEffects(
      {
        date: session.date,
        kind: session.kind,
        weighing: session.weighing,
        treatment: toManejoPlan(session),
        destinationLotId: session.destinationLotId ?? undefined,
        pricePerArroba: session.pricePerArroba ?? undefined,
      },
      data
    );

    const createdTreatments: Treatment[] = [];
    let treatmentId: string | undefined;
    let boosterId: string | undefined;
    if (effects.treatment) {
      const [row] = await tx
        .insert(treatments)
        .values({ id: randomUUID(), animalId, ...effects.treatment })
        .returning();
      treatmentId = row.id;
      createdTreatments.push(toTreatment(row, earTag));
    }
    if (effects.booster) {
      const [row] = await tx
        .insert(treatments)
        .values({ id: randomUUID(), animalId, ...effects.booster })
        .returning();
      boosterId = row.id;
      createdTreatments.push(toTreatment(row, earTag));
    }

    let weighingId: number | undefined;
    if (effects.weighing) {
      const [row] = await tx
        .insert(weighings)
        .values({ animalId, ...effects.weighing })
        .returning();
      weighingId = row.id;
    }

    // A transferência lands the animal in the destination lot and a venda takes
    // it out of the herd; the lot it came from is kept on the entry so undoing
    // the pass can put it back exactly where it was.
    let patch: AnimalPatch | undefined;
    const moves = effects.lotId !== undefined || effects.sold === true;
    if (moves) {
      const [row] = await tx
        .update(animals)
        .set({
          ...(effects.lotId !== undefined ? { lotId: effects.lotId } : {}),
          ...(effects.sold === true
            ? {
                active: false,
                inactiveReason: "sale" as const,
                inactiveDate: session.date,
              }
            : {}),
        })
        .where(eq(animals.id, animalId))
        .returning(ANIMAL_PATCH_COLUMNS);
      patch = row;
    }

    const notes = data.notes?.trim();
    const [updated] = await tx
      .update(manejoSessionAnimals)
      .set({
        outcome: "done",
        weightKg: effects.weighing?.weightKg ?? null,
        notes: notes ? notes : null,
        amountBrl: effects.amountBrl ?? null,
        previousLotId: moves ? animal.lotId : null,
        treatmentId: treatmentId ?? null,
        boosterId: boosterId ?? null,
        weighingId: weighingId ?? null,
      })
      .where(
        and(
          eq(manejoSessionAnimals.sessionId, session.id),
          eq(manejoSessionAnimals.animalId, animalId)
        )
      )
      .returning();

    return {
      entry: toManejoSessionAnimal(updated, earTag),
      treatments: createdTreatments,
      weighing: effects.weighing,
      animal: patch,
    };
  });
}

/**
 * Registers one animal arriving in an entry session (compra). The animal joins
 * the herd in the session's destination lot and its chute entry is already
 * done — it passed as it was tagged. Returns null when the session is not an
 * open entry, and "duplicate" when the ear tag is already in use on the farm.
 */
export async function registerEntryAnimal(
  farmId: number,
  sessionId: string,
  input: Omit<NewAnimalInput, "lotId"> & { notes?: string }
): Promise<EntryResult | "duplicate" | { conflict: ManejoConflict } | null> {
  return db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(manejoSessions)
      .where(and(eq(manejoSessions.id, sessionId), eq(manejoSessions.farmId, farmId)))
      .for("update");
    if (!session || session.kind !== "entry" || session.destinationLotId === null) {
      return null;
    }
    if (session.status !== "open") return conflict("session_not_open");

    const [duplicate] = await tx
      .select({ id: animals.id })
      .from(animals)
      .where(and(eq(animals.farmId, farmId), eq(animals.earTag, input.earTag)))
      .limit(1);
    if (duplicate) return "duplicate";

    const animal = await insertAnimal(tx, farmId, {
      ...input,
      lotId: session.destinationLotId,
      initialWeightDate: session.date,
    });

    const [animalRow] = await tx
      .select({ id: animals.id })
      .from(animals)
      .where(and(eq(animals.farmId, farmId), eq(animals.earTag, animal.earTag)))
      .limit(1);

    // The chute line grows as the truck unloads: each arrival takes the next spot.
    const [line] = await tx
      .select({ handled: count() })
      .from(manejoSessionAnimals)
      .where(eq(manejoSessionAnimals.sessionId, session.id));

    const notes = input.notes?.trim();
    const [entryRow] = await tx
      .insert(manejoSessionAnimals)
      .values({
        sessionId: session.id,
        animalId: animalRow.id,
        position: line.handled,
        outcome: "done",
        weightKg: input.initialWeightKg ?? null,
        notes: notes ? notes : null,
        createdAnimal: true,
      })
      .returning();

    return { entry: toManejoSessionAnimal(entryRow, animal.earTag), animal };
  });
}

/** Marks one animal as skipped (did not pass the chute). */
export async function skipAnimal(
  farmId: number,
  sessionId: string,
  animalId: string,
  notes: string | undefined
): Promise<ManejoSessionAnimal | { conflict: ManejoConflict } | null> {
  return db.transaction(async (tx) => {
    const { session, entry, animal } = await lockEntry(tx, farmId, sessionId, animalId);
    if (!session || !entry || !animal) return null;
    if (session.status !== "open") return conflict("session_not_open");
    if (entry.outcome !== "pending") return conflict("entry_not_actionable");

    const trimmed = notes?.trim();
    const [updated] = await tx
      .update(manejoSessionAnimals)
      .set({ outcome: "skipped", notes: trimmed ? trimmed : null })
      .where(
        and(
          eq(manejoSessionAnimals.sessionId, session.id),
          eq(manejoSessionAnimals.animalId, animal.id)
        )
      )
      .returning();
    return toManejoSessionAnimal(updated, animal.earTag);
  });
}

/** Undo: reverts one animal to pending, deleting the effects its pass created. */
export async function reopenAnimal(
  farmId: number,
  sessionId: string,
  animalId: string
): Promise<ReopenResult | { conflict: ManejoConflict } | null> {
  return db.transaction(async (tx) => {
    const { session, entry, animal } = await lockEntry(tx, farmId, sessionId, animalId);
    if (!session || !entry || !animal) return null;
    if (session.status !== "open") return conflict("session_not_open");
    if (entry.outcome === "pending") return conflict("entry_not_actionable");
    const earTag = animal.earTag;

    // An entry pass CREATED the animal, so undoing it removes the registration
    // altogether (weighings and the chute entry cascade with it).
    if (entry.createdAnimal) {
      await tx.delete(manejoSessionAnimals).where(
        and(
          eq(manejoSessionAnimals.sessionId, session.id),
          eq(manejoSessionAnimals.animalId, animalId)
        )
      );
      await tx.delete(animals).where(eq(animals.id, animalId));
      return {
        entry: toManejoSessionAnimal(entry, earTag),
        removedTreatmentIds: [],
        removedEarTag: earTag,
      };
    }

    let removedWeighing: Weighing | undefined;
    if (entry.weighingId !== null) {
      const [removed] = await tx
        .delete(weighings)
        .where(eq(weighings.id, entry.weighingId))
        .returning();
      if (removed) {
        removedWeighing = { date: removed.date, weightKg: removed.weightKg };
      }
    }

    // Clear the refs BEFORE deleting the treatments (the FKs are set-null and
    // would race the update otherwise), then delete the pass's treatments.
    const removedTreatmentIds = [entry.treatmentId, entry.boosterId].filter(
      (id): id is string => id !== null
    );
    // Put the animal back where the pass found it: in its old lot after a
    // transferência, and back in the active herd after a venda.
    let patch: AnimalPatch | undefined;
    if (entry.previousLotId !== null || session.kind === "sale") {
      const [row] = await tx
        .update(animals)
        .set({
          ...(entry.previousLotId !== null ? { lotId: entry.previousLotId } : {}),
          ...(session.kind === "sale"
            ? { active: true, inactiveReason: null, inactiveDate: null }
            : {}),
        })
        .where(eq(animals.id, animalId))
        .returning(ANIMAL_PATCH_COLUMNS);
      patch = row;
    }

    const [updated] = await tx
      .update(manejoSessionAnimals)
      .set({
        outcome: "pending",
        weightKg: null,
        notes: null,
        amountBrl: null,
        previousLotId: null,
        treatmentId: null,
        boosterId: null,
        weighingId: null,
      })
      .where(
        and(
          eq(manejoSessionAnimals.sessionId, session.id),
          eq(manejoSessionAnimals.animalId, animalId)
        )
      )
      .returning();
    if (removedTreatmentIds.length > 0) {
      await tx.delete(treatments).where(inArray(treatments.id, removedTreatmentIds));
    }

    return {
      entry: toManejoSessionAnimal(updated, earTag),
      removedTreatmentIds,
      removedWeighing,
      animal: patch,
    };
  });
}

/** Closes the session (remaining animals stay recorded as they are). */
export async function closeSession(
  farmId: number,
  sessionId: string
): Promise<boolean> {
  const rows = await db
    .update(manejoSessions)
    .set({ status: "closed" })
    .where(and(eq(manejoSessions.id, sessionId), eq(manejoSessions.farmId, farmId)))
    .returning({ id: manejoSessions.id });
  return rows.length > 0;
}
