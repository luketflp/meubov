/**
 * Write path — manejo sessions (the transactional core of the herd API).
 *
 * Effects (treatments, weighings) are applied incrementally per animal, never
 * as one atomic batch — a manejo takes hours. Each pass runs in a transaction
 * with the session-animal row locked (FOR UPDATE), so two devices at the same
 * chute cannot double-fire an animal. What a pass produces comes from the pure
 * domain rules in lib/domain/manejo.ts.
 */
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  animals,
  manejoSessionAnimals,
  manejoSessions,
  treatments,
  weighings,
} from "@/lib/db/schema";
import type {
  ManejoSession,
  ManejoSessionAnimal,
  ManejoTreatmentPlan,
  Treatment,
  Weighing,
} from "@/lib/types";
import type { ManejoPassData, NewManejoSession } from "@/lib/store/useHerdStore";
import { buildPassEffects, sessionName } from "@/lib/domain/manejo";
import {
  toManejoPlan,
  toManejoSession,
  toManejoSessionAnimal,
  toTreatment,
} from "@/lib/api/services/mappers";

/** Result of one completed pass (for the client-side merge). */
export interface CompleteResult {
  entry: ManejoSessionAnimal;
  treatments: Treatment[];
  weighing?: Weighing;
}

/** Result of undoing one pass. */
export interface ReopenResult {
  entry: ManejoSessionAnimal;
  removedTreatmentIds: string[];
  removedWeighing?: Weighing;
}

/** Conflict outcomes a pass can hit; routes map these to 409. */
export type ManejoConflict = "session_not_open" | "entry_not_actionable";

const conflict = (code: ManejoConflict): { conflict: ManejoConflict } => ({
  conflict: code,
});

/** Opens a session with every selected animal pending, in chute-line order. */
export async function startSession(
  farmId: number,
  input: NewManejoSession
): Promise<ManejoSession | null> {
  return db.transaction(async (tx) => {
    const herd = await tx
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
        name: sessionName(plan),
        date: input.date,
        status: "open",
        weighing: input.weighing,
        notes: input.notes,
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

/** Loads and locks one session + one entry, resolving the animal by ear tag. */
async function lockEntry(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  farmId: number,
  sessionId: string,
  earTag: string
) {
  const [session] = await tx
    .select()
    .from(manejoSessions)
    .where(and(eq(manejoSessions.id, sessionId), eq(manejoSessions.farmId, farmId)))
    .for("update");
  if (!session) return { session: undefined, entry: undefined, animalId: undefined };
  const [animal] = await tx
    .select({ id: animals.id })
    .from(animals)
    .where(and(eq(animals.farmId, farmId), eq(animals.earTag, earTag)))
    .limit(1);
  if (!animal) return { session, entry: undefined, animalId: undefined };
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
  return { session, entry, animalId: animal.id };
}

/** Applies the session's effects to one animal and marks it done. */
export async function completeAnimal(
  farmId: number,
  sessionId: string,
  earTag: string,
  data: ManejoPassData
): Promise<CompleteResult | { conflict: ManejoConflict } | null> {
  return db.transaction(async (tx) => {
    const { session, entry, animalId } = await lockEntry(tx, farmId, sessionId, earTag);
    if (!session || !entry || !animalId) return null;
    if (session.status !== "open") return conflict("session_not_open");
    if (entry.outcome !== "pending") return conflict("entry_not_actionable");

    const effects = buildPassEffects(
      { date: session.date, weighing: session.weighing, treatment: toManejoPlan(session) },
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

    const notes = data.notes?.trim();
    const [updated] = await tx
      .update(manejoSessionAnimals)
      .set({
        outcome: "done",
        weightKg: effects.weighing?.weightKg ?? null,
        notes: notes ? notes : null,
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
    };
  });
}

/** Marks one animal as skipped (did not pass the chute). */
export async function skipAnimal(
  farmId: number,
  sessionId: string,
  earTag: string,
  notes: string | undefined
): Promise<ManejoSessionAnimal | { conflict: ManejoConflict } | null> {
  return db.transaction(async (tx) => {
    const { session, entry, animalId } = await lockEntry(tx, farmId, sessionId, earTag);
    if (!session || !entry || !animalId) return null;
    if (session.status !== "open") return conflict("session_not_open");
    if (entry.outcome !== "pending") return conflict("entry_not_actionable");

    const trimmed = notes?.trim();
    const [updated] = await tx
      .update(manejoSessionAnimals)
      .set({ outcome: "skipped", notes: trimmed ? trimmed : null })
      .where(
        and(
          eq(manejoSessionAnimals.sessionId, session.id),
          eq(manejoSessionAnimals.animalId, animalId)
        )
      )
      .returning();
    return toManejoSessionAnimal(updated, earTag);
  });
}

/** Undo: reverts one animal to pending, deleting the effects its pass created. */
export async function reopenAnimal(
  farmId: number,
  sessionId: string,
  earTag: string
): Promise<ReopenResult | { conflict: ManejoConflict } | null> {
  return db.transaction(async (tx) => {
    const { session, entry, animalId } = await lockEntry(tx, farmId, sessionId, earTag);
    if (!session || !entry || !animalId) return null;
    if (session.status !== "open") return conflict("session_not_open");
    if (entry.outcome === "pending") return conflict("entry_not_actionable");

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
    const [updated] = await tx
      .update(manejoSessionAnimals)
      .set({
        outcome: "pending",
        weightKg: null,
        notes: null,
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
