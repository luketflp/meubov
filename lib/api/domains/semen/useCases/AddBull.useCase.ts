import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { semenBulls } from "@/lib/db/schema";
import { isUniqueViolation } from "@/lib/api/dbErrors";
import { toSemenBull } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import { textOrNull } from "../_shared/text";
import {
  writeSemenPurchase,
  type NewSemenPurchaseInput,
} from "./AddPurchase.useCase";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { SemenBullRow } from "@/lib/db/schema";
import type { Expense, SemenBull } from "@/lib/types";

/** A new bull as the client sends it ("Novo touro"). */
export interface NewSemenBullInput {
  name: string;
  code?: string;
  breed?: string;
  central?: string;
  /** "Primeira compra (opcional)": becomes the bull's first purchase and expense. */
  firstPurchase?: NewSemenPurchaseInput;
}

interface AddBullUseCaseProps {
  farmId: number;
  input: NewSemenBullInput;
}

type AddBullUseCaseResponse = { bull: SemenBull; expense?: Expense } | "duplicate_name";

type CurrUseCase = _UseCase<AddBullUseCaseProps, AddBullUseCaseResponse>;

/**
 * Registers a bull the farm buys semen from. The name is unique per farm
 * (`duplicate_name`); blank optional texts are stored as null. A first purchase
 * is written with its expense in the same transaction as the bull.
 */
export class AddBullUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("AddBullUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, input }) => {
    return this.repository.transaction(async (tx) => {
      let row: SemenBullRow;
      try {
        [row] = await tx
          .insert(semenBulls)
          .values({
            id: randomUUID(),
            farmId,
            name: input.name.trim(),
            code: textOrNull(input.code),
            breed: textOrNull(input.breed),
            central: textOrNull(input.central),
          })
          .returning();
      } catch (error) {
        // The first write failed, so nothing is lost with the aborted transaction.
        if (isUniqueViolation(error)) return "duplicate_name";
        throw error;
      }

      if (!input.firstPurchase) return { bull: toSemenBull(row, []) };

      const { purchase, expense } = await writeSemenPurchase(
        tx,
        farmId,
        row,
        input.firstPurchase
      );
      return { bull: toSemenBull(row, [purchase]), expense };
    });
  };
}
