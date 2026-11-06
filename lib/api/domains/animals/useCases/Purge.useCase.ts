import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  animals,
  calvings,
  manejoSessionAnimals,
  manejoSessions,
  statementLines,
} from "@/lib/db/schema";
import { hasMoney } from "@/lib/domain/moneyRedaction";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

/**
 * An open manejo still holds one of the animals; a purge that would empty a
 * manejo with money also needs Financeiro edit.
 */
export type PurgeAnimalsError = "animal_in_open_manejo" | "finance_required";

/** What the purge took. */
export interface PurgeAnimalsResult {
  /** Ear tags of the animals deleted. */
  deleted: string[];
  /** Partos taken off dams that stay. */
  calvings: number;
  /** Manejos left without any animal, gone from the history. */
  manejos: number;
}

interface PurgeAnimalsUseCaseProps {
  farmId: number;
  ids: string[];
  /** False for a member without Financeiro edit. */
  canEditFinance: boolean;
}

type PurgeAnimalsUseCaseResponse = PurgeAnimalsResult | PurgeAnimalsError;

type CurrUseCase = _UseCase<PurgeAnimalsUseCaseProps, PurgeAnimalsUseCaseResponse>;

/**
 * Deletes animals entered by mistake for good — "Excluir" on the herd's
 * selection. Their weighings, treatments, coberturas, partos and passes go
 * with them by cascade, and so does the parto that brought each one in: the
 * dam's calving naming the calf on its birth date, written with it by an
 * import or "Registrar nascimento", so entering the calf again does not give
 * the dam a second parto. A manejo left without any animal is deleted the way
 * "Excluir manejo" does it.
 *
 * Only active animals of this farm go; an id of another farm, of an animal
 * that left the herd or of one already deleted is skipped. Refused while an
 * open manejo holds one of them. Every refusal comes before the first write,
 * since a transaction that returns one still commits.
 */
export class PurgeAnimalsUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("PurgeAnimalsUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, ids, canEditFinance }) => {
    return this.repository.transaction(async (tx) => {
      // Locked, so a pass or a weighing on one of them waits for the purge
      // and then finds no animal.
      const herd = await tx
        .select({ id: animals.id, earTag: animals.earTag, birthDate: animals.birthDate })
        .from(animals)
        .where(
          and(eq(animals.farmId, farmId), inArray(animals.id, ids), eq(animals.active, true))
        )
        .for("update");
      if (herd.length === 0) return { deleted: [], calvings: 0, manejos: 0 };
      const herdIds = herd.map((animal) => animal.id);

      // One row per pass, so a manejo comes once per animal it holds.
      const touched = new Map(
        (
          await tx
            .select({
              id: manejoSessions.id,
              status: manejoSessions.status,
              pricePerArroba: manejoSessions.pricePerArroba,
              totalAmountBrl: manejoSessions.totalAmountBrl,
              planCostBrl: manejoSessions.planCostBrl,
            })
            .from(manejoSessionAnimals)
            .innerJoin(manejoSessions, eq(manejoSessionAnimals.sessionId, manejoSessions.id))
            .where(
              and(
                inArray(manejoSessionAnimals.animalId, herdIds),
                isNull(manejoSessions.deletedAt)
              )
            )
        ).map((session) => [session.id, session])
      );
      if ([...touched.values()].some((session) => session.status === "open")) {
        return "animal_in_open_manejo";
      }
      // What is left once the manejos with another animal drop out is what
      // the purge empties.
      if (touched.size > 0) {
        const kept = await tx
          .select({ id: manejoSessionAnimals.sessionId })
          .from(manejoSessionAnimals)
          .where(
            and(
              inArray(manejoSessionAnimals.sessionId, [...touched.keys()]),
              notInArray(manejoSessionAnimals.animalId, herdIds)
            )
          );
        for (const session of kept) touched.delete(session.id);
      }
      if (!canEditFinance && [...touched.values()].some(hasMoney)) {
        return "finance_required";
      }

      // A dam deleted here takes her partos by cascade; the others lose the one
      // that names the calf on its birth date. The date tells it from an older
      // calf that carried the same brinco.
      const birthByTag = new Map(herd.map((animal) => [animal.earTag, animal.birthDate]));
      const purged = new Set(herdIds);
      const partoIds = (
        await tx
          .select({
            id: calvings.id,
            damId: calvings.animalId,
            calfEarTag: calvings.calfEarTag,
            date: calvings.date,
          })
          .from(calvings)
          .innerJoin(animals, eq(calvings.animalId, animals.id))
          .where(
            and(eq(animals.farmId, farmId), inArray(calvings.calfEarTag, [...birthByTag.keys()]))
          )
      )
        .filter(
          (parto) => !purged.has(parto.damId) && birthByTag.get(parto.calfEarTag) === parto.date
        )
        .map((parto) => parto.id);
      if (partoIds.length > 0) await tx.delete(calvings).where(inArray(calvings.id, partoIds));

      await tx.delete(animals).where(inArray(animals.id, herdIds));
      const emptiedIds = [...touched.keys()];
      if (emptiedIds.length > 0) {
        await tx
          .update(manejoSessions)
          .set({ deletedAt: new Date() })
          .where(inArray(manejoSessions.id, emptiedIds));
        // The linha do extrato a venda or entrada confirmed goes back to
        // pending (a trigger resets the status).
        await tx
          .update(statementLines)
          .set({ movementId: null })
          .where(
            and(
              eq(statementLines.farmId, farmId),
              inArray(statementLines.movementId, emptiedIds)
            )
          );
      }

      return {
        deleted: herd.map((animal) => animal.earTag),
        calvings: partoIds.length,
        manejos: emptiedIds.length,
      };
    });
  };
}
