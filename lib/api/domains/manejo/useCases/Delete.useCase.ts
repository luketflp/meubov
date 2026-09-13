import { and, eq, inArray, isNull, ne } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  animals,
  breedings,
  lots,
  manejoSessionAnimals,
  manejoSessions,
  treatments,
  weighings,
} from "@/lib/db/schema";
import {
  revertDecision,
  type AnimalFacts,
  type BlockedAnimal,
  type RevertSession,
} from "@/lib/domain/manejoRevert";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { hasMoney } from "@/lib/domain/moneyRedaction";

import { lockDiagnosedBreedings } from "../_shared/session";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

/** What a delete reverted, as the client must merge it into its snapshot. */
export interface DeletedManejo {
  id: string;
  treatmentIds: string[];
  weighedEarTags: string[];
  restored: { earTag: string; lotId: string | null; active: boolean }[];
  removedEarTags: string[];
  /** Coberturas an inseminação wrote, deleted with it; their doses are back in stock. */
  removedBreedings: { earTag: string; breedingId: string }[];
}

interface DeleteSessionUseCaseProps {
  farmId: number;
  id: string;
  /** False for a member without Financeiro edit: a session with values stays. */
  canEditFinance: boolean;
}

type DeleteSessionUseCaseResponse =
  | DeletedManejo
  | { blocked: BlockedAnimal[] }
  | "session_not_found"
  | "finance_required";

type CurrUseCase = _UseCase<DeleteSessionUseCaseProps, DeleteSessionUseCaseResponse>;

/**
 * Deletes a manejo — descartar while it runs, excluir once closed — undoing
 * what it did to the herd. The session row and the effects it wrote are stamped
 * with deleted_at rather than removed; only an entrada's own animals go, since
 * they were born with the session and have no history apart from it, and so do
 * an inseminação's coberturas, whose doses count as used for as long as they
 * exist. A guard that refuses stops the whole delete: the transaction returns
 * the blocked animals before the first write. The session row is locked first,
 * so a delete waits for a pass in flight, and a pass that was waiting for it
 * finds no session once it commits.
 */
export class DeleteSessionUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("DeleteSessionUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id, canEditFinance }) => {
    return this.repository.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(manejoSessions)
        .where(
          and(
            eq(manejoSessions.id, id),
            eq(manejoSessions.farmId, farmId),
            isNull(manejoSessions.deletedAt)
          )
        )
        .for("update");
      if (!row) return "session_not_found";
      // Deleting a priced venda, entrada or costed treatment takes money out of
      // the financeiro, which only Financeiro edit may do.
      if (
        !canEditFinance &&
        hasMoney({
          pricePerArroba: row.pricePerArroba,
          totalAmountBrl: row.totalAmountBrl,
          planCostBrl: row.planCostBrl,
        })
      ) {
        return "finance_required";
      }

      const entries = await tx
        .select({
          earTag: animals.earTag,
          animalId: animals.id,
          outcome: manejoSessionAnimals.outcome,
          previousLotId: manejoSessionAnimals.previousLotId,
          createdAnimal: manejoSessionAnimals.createdAnimal,
          treatmentId: manejoSessionAnimals.treatmentId,
          boosterId: manejoSessionAnimals.boosterId,
          weighingId: manejoSessionAnimals.weighingId,
          breedingId: manejoSessionAnimals.breedingId,
          lotId: animals.lotId,
          active: animals.active,
        })
        .from(manejoSessionAnimals)
        .innerJoin(animals, eq(manejoSessionAnimals.animalId, animals.id))
        .where(eq(manejoSessionAnimals.sessionId, id));

      // A lote of origin that was soft-deleted has nowhere to put the animal back.
      const originIds = [
        ...new Set(entries.map((e) => e.previousLotId).filter((l): l is string => l !== null)),
      ];
      const liveOrigins = new Set(
        originIds.length === 0
          ? []
          : (
              await tx
                .select({ id: lots.id })
                .from(lots)
                .where(
                  and(eq(lots.farmId, farmId), inArray(lots.id, originIds), isNull(lots.deletedAt))
                )
            ).map((l) => l.id)
      );

      // A cobertura that was already diagnosed keeps its inseminação: deleting it
      // would take the ultrassom result down with it.
      const diagnosed = await lockDiagnosedBreedings(
        tx,
        entries.map((e) => e.breedingId).filter((b): b is string => b !== null)
      );

      // Only an entrada asks whether the animal carries history from elsewhere: a
      // weighing or a treatment this session did not write, or another pass.
      const foreign = new Set<string>();
      if (row.kind === "entry") {
        const created = entries.filter((e) => e.createdAnimal).map((e) => e.animalId);
        if (created.length > 0) {
          const [otherPasses, otherTreatments, otherWeighings] = await Promise.all([
            tx
              .select({ animalId: manejoSessionAnimals.animalId })
              .from(manejoSessionAnimals)
              .where(
                and(
                  inArray(manejoSessionAnimals.animalId, created),
                  ne(manejoSessionAnimals.sessionId, id)
                )
              ),
            tx
              .select({ animalId: treatments.animalId })
              .from(treatments)
              .where(and(inArray(treatments.animalId, created), isNull(treatments.deletedAt))),
            tx
              .select({ id: weighings.id, animalId: weighings.animalId })
              .from(weighings)
              .where(and(inArray(weighings.animalId, created), isNull(weighings.deletedAt))),
          ]);
          // A reading this very session took is not foreign history: compare the
          // WEIGHING ids, never the animal ids.
          const ownWeighingIds = new Set(
            entries.map((e) => e.weighingId).filter((w): w is number => w !== null)
          );
          for (const r of otherPasses) foreign.add(r.animalId);
          for (const r of otherTreatments) foreign.add(r.animalId);
          for (const r of otherWeighings) {
            if (!ownWeighingIds.has(r.id)) foreign.add(r.animalId);
          }
        }
      }

      const byEarTag = new Map(entries.map((e) => [e.earTag, e]));
      // RevertSession asks for three fields, so the rows go in as they came out
      // of the query — no mapper, no cast, no session rebuilt to be thrown away.
      const session: RevertSession = {
        kind: row.kind,
        destinationLotId: row.destinationLotId ?? undefined,
        animals: entries.map((e) => ({
          earTag: e.earTag,
          outcome: e.outcome,
          previousLotId: e.previousLotId ?? undefined,
          createdAnimal: e.createdAnimal,
          treatmentId: e.treatmentId ?? undefined,
          boosterId: e.boosterId ?? undefined,
          weighingId: e.weighingId ?? undefined,
          breedingId: e.breedingId ?? undefined,
        })),
      };

      const facts: AnimalFacts[] = entries.map((e) => ({
        earTag: e.earTag,
        lotId: e.lotId,
        active: e.active,
        hasForeignHistory: foreign.has(e.animalId),
        originLotMissing: e.previousLotId !== null && !liveOrigins.has(e.previousLotId),
        hasDiagnosis: e.breedingId !== null && diagnosed.has(e.breedingId),
      }));

      const { plan, blocked } = revertDecision(session, facts);
      if (blocked.length > 0) return { blocked };

      const stamp = new Date();

      if (plan.treatmentIds.length > 0) {
        await tx
          .update(treatments)
          .set({ deletedAt: stamp })
          .where(inArray(treatments.id, plan.treatmentIds));
      }
      if (plan.weighingIds.length > 0) {
        await tx
          .update(weighings)
          .set({ deletedAt: stamp })
          .where(inArray(weighings.id, plan.weighingIds));
      }
      for (const item of plan.restore) {
        const entry = byEarTag.get(item.earTag);
        if (!entry) continue;
        await tx
          .update(animals)
          .set({
            ...(item.lotId !== undefined ? { lotId: item.lotId } : {}),
            ...(item.reactivate
              ? { active: true, inactiveReason: null, inactiveDate: null }
              : {}),
          })
          .where(eq(animals.id, entry.animalId));
      }
      // Clear the entries' refs BEFORE deleting the coberturas (the FK is set-null
      // and would race the delete otherwise), then delete them.
      if (plan.breedingIds.length > 0) {
        await tx
          .update(manejoSessionAnimals)
          .set({ breedingId: null })
          .where(
            and(
              eq(manejoSessionAnimals.sessionId, id),
              inArray(manejoSessionAnimals.breedingId, plan.breedingIds)
            )
          );
        await tx.delete(breedings).where(inArray(breedings.id, plan.breedingIds));
      }
      const removedIds = plan.removeEarTags
        .map((earTag) => byEarTag.get(earTag)?.animalId)
        .filter((animalId): animalId is string => animalId !== undefined);
      if (removedIds.length > 0) {
        await tx.delete(animals).where(inArray(animals.id, removedIds));
      }

      await tx.update(manejoSessions).set({ deletedAt: stamp }).where(eq(manejoSessions.id, id));

      return {
        id,
        treatmentIds: plan.treatmentIds,
        weighedEarTags: entries
          .filter((e) => e.weighingId !== null && plan.weighingIds.includes(e.weighingId))
          .map((e) => e.earTag),
        restored: plan.restore.map((item) => ({
          earTag: item.earTag,
          lotId: item.lotId ?? null,
          active: item.reactivate,
        })),
        removedEarTags: plan.removeEarTags,
        removedBreedings: entries.flatMap((e) =>
          e.breedingId !== null && plan.breedingIds.includes(e.breedingId)
            ? [{ earTag: e.earTag, breedingId: e.breedingId }]
            : []
        ),
      };
    });
  };
}
