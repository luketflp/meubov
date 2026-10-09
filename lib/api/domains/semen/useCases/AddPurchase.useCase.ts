import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { semenBulls, semenPurchases } from "@/lib/db/schema";
import { toSemenPurchase } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import { textOrNull } from "../_shared/text";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { SemenPurchase } from "@/lib/types";

/** A purchase of doses as the client sends it. */
export interface NewSemenPurchaseInput {
  date: string;
  doses: number;
  totalBrl: number;
  seller?: string;
}

/**
 * Writes one purchase of doses of a bull. A purchase is stock, not money in the
 * Financeiro: nothing else is written.
 */
export async function writeSemenPurchase(
  repository: RepositoryType,
  bullId: string,
  input: NewSemenPurchaseInput
): Promise<SemenPurchase> {
  const [row] = await repository
    .insert(semenPurchases)
    .values({
      id: randomUUID(),
      bullId,
      date: input.date,
      doses: input.doses,
      totalBrl: input.totalBrl,
      seller: textOrNull(input.seller),
    })
    .returning();
  return toSemenPurchase(row);
}

interface AddPurchaseUseCaseProps {
  farmId: number;
  bullId: string;
  input: NewSemenPurchaseInput;
}

type AddPurchaseUseCaseResponse = { purchase: SemenPurchase } | "not_found";

type CurrUseCase = _UseCase<AddPurchaseUseCaseProps, AddPurchaseUseCaseResponse>;

/**
 * Registers a purchase of doses of a bull of the farm. Buying only adds stock,
 * so no row lock is needed here.
 */
export class AddPurchaseUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("AddPurchaseUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, bullId, input }) => {
    const [bull] = await this.repository
      .select({ id: semenBulls.id })
      .from(semenBulls)
      .where(and(eq(semenBulls.farmId, farmId), eq(semenBulls.id, bullId)))
      .limit(1);
    if (!bull) return "not_found";

    return { purchase: await writeSemenPurchase(this.repository, bull.id, input) };
  };
}
