import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  animals,
  manejoSessionAnimals,
  manejoSessions,
} from "@/lib/db/schema";
import { saleAmount } from "@/lib/domain/movements";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import {
  conflict,
  type ManejoConflict,
} from "../_shared/session";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

/** Per-animal value corrected by a rendimento change (client-side merge). */
export interface SaleYieldResult {
  carcassYieldPct: number;
  /** Done passes repriced at the new yield (weight × yield ÷ 15 × R$/@). */
  amounts: { earTag: string; amountBrl: number }[];
}

interface SetCarcassYieldUseCaseProps {
  farmId: number;
  sessionId: string;
  carcassYieldPct: number;
}

type SetCarcassYieldUseCaseResponse = SaleYieldResult | { conflict: ManejoConflict } | null;

type CurrUseCase = _UseCase<SetCarcassYieldUseCaseProps, SetCarcassYieldUseCaseResponse>;

/**
 * Sets the rendimento de carcaça of an open venda per arroba (the modal shown
 * before the chute), repricing any pass already recorded so every animal of the
 * session is worth the same arithmetic.
 */
export class SetCarcassYieldUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("SetCarcassYieldUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, sessionId, carcassYieldPct }) => {
    return this.repository.transaction(async (tx) => {
      const [session] = await tx
        .select()
        .from(manejoSessions)
        .where(and(eq(manejoSessions.id, sessionId), eq(manejoSessions.farmId, farmId)))
        .for("update");
      if (!session || session.kind !== "sale" || session.pricePerArroba === null) {
        return null;
      }
      if (session.status !== "open") return conflict("session_not_open");

      await tx
        .update(manejoSessions)
        .set({ carcassYieldPct })
        .where(eq(manejoSessions.id, session.id));

      const entries = await tx
        .select({
          animalId: manejoSessionAnimals.animalId,
          weightKg: manejoSessionAnimals.weightKg,
          earTag: animals.earTag,
        })
        .from(manejoSessionAnimals)
        .innerJoin(animals, eq(animals.id, manejoSessionAnimals.animalId))
        .where(
          and(
            eq(manejoSessionAnimals.sessionId, session.id),
            eq(manejoSessionAnimals.outcome, "done")
          )
        )
        .for("update", { of: manejoSessionAnimals });

      const amounts: SaleYieldResult["amounts"] = [];
      for (const entry of entries) {
        if (entry.weightKg === null) continue;
        const amountBrl = saleAmount(entry.weightKg, session.pricePerArroba, carcassYieldPct);
        await tx
          .update(manejoSessionAnimals)
          .set({ amountBrl })
          .where(
            and(
              eq(manejoSessionAnimals.sessionId, session.id),
              eq(manejoSessionAnimals.animalId, entry.animalId)
            )
          );
        amounts.push({ earTag: entry.earTag, amountBrl });
      }

      return { carcassYieldPct, amounts };
    });
  };
}
