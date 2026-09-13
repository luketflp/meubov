import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { breeds, customCategories, farm, farmUsers, healthProtocols } from "@/lib/db/schema";
import { validateNewFarm, type NewFarmProblem } from "@/lib/domain/farms";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface CreateFarmUseCaseProps {
  userId: string;
  name: string;
  municipality: string;
  /** The open farm whose raças, categorias and protocolos the new farm starts with. */
  copyFromFarmId?: number;
}

type CreateFarmUseCaseResponse =
  | { farmId: number }
  | { invalid: NewFarmProblem }
  | "not_a_member";

type CurrUseCase = _UseCase<CreateFarmUseCaseProps, CreateFarmUseCaseResponse>;

/**
 * A new farm owned by the caller, named at creation. With a source farm it
 * starts with that farm's raças, categorias and protocolos sanitários under
 * fresh ids — never its animals, lotes, invernadas, touros or equipe. The
 * caller must still belong to the live source; any role will do, since every
 * member already sees those lists.
 *
 * The plan's maxFarms cap belongs at the top of this transaction when billing
 * lands, behind the per-user advisory lock EnsureFarmForUserUseCase takes.
 */
export class CreateFarmUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("CreateFarmUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ userId, name, municipality, copyFromFarmId }) => {
    const check = validateNewFarm({ name, municipality });
    if (!check.ok) return { invalid: check.problem };

    return this.repository.transaction(async (tx) => {
      if (copyFromFarmId !== undefined) {
        const [source] = await tx
          .select({ farmId: farmUsers.farmId })
          .from(farmUsers)
          .innerJoin(farm, eq(farm.id, farmUsers.farmId))
          .where(
            and(
              eq(farmUsers.farmId, copyFromFarmId),
              eq(farmUsers.userId, userId),
              isNull(farm.deletedAt)
            )
          )
          .limit(1);
        if (!source) return "not_a_member" as const;
      }

      const [created] = await tx
        .insert(farm)
        .values({
          name: check.name,
          municipality: check.municipality,
          stateRegistration: "",
          manager: "",
        })
        .returning({ id: farm.id });
      await tx.insert(farmUsers).values({ farmId: created.id, userId, role: "owner" });

      if (copyFromFarmId !== undefined) await copySetup(tx, copyFromFarmId, created.id);
      return { farmId: created.id };
    });
  };
}

/** Copies the lists a farm is set up with, one kind after the other on the transaction. */
async function copySetup(tx: RepositoryType, from: number, to: number): Promise<void> {
  const breedRows = await tx
    .select({ name: breeds.name })
    .from(breeds)
    .where(eq(breeds.farmId, from));
  if (breedRows.length > 0) {
    await tx.insert(breeds).values(breedRows.map((row) => ({ farmId: to, name: row.name })));
  }

  const categoryRows = await tx
    .select({ name: customCategories.name, baseCategory: customCategories.baseCategory })
    .from(customCategories)
    .where(eq(customCategories.farmId, from));
  if (categoryRows.length > 0) {
    await tx
      .insert(customCategories)
      .values(categoryRows.map((row) => ({ id: randomUUID(), farmId: to, ...row })));
  }

  const protocolRows = await tx
    .select({
      name: healthProtocols.name,
      type: healthProtocols.type,
      intervalMonths: healthProtocols.intervalMonths,
      withdrawalDays: healthProtocols.withdrawalDays,
      mandatory: healthProtocols.mandatory,
    })
    .from(healthProtocols)
    .where(eq(healthProtocols.farmId, from));
  if (protocolRows.length > 0) {
    await tx
      .insert(healthProtocols)
      .values(protocolRows.map((row) => ({ id: randomUUID(), farmId: to, ...row })));
  }
}
