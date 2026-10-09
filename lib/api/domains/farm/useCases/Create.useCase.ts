import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { breeds, customCategories, farm, farmUsers, planGroups } from "@/lib/db/schema";
import { validateNewFarm, type NewFarmProblem } from "@/lib/domain/farms";
import { seedPlanGroups } from "@/lib/api/domains/planGroups/seed";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface CreateFarmUseCaseProps {
  userId: string;
  name: string;
  municipality: string;
  /** The open farm whose raças, categorias and grupos the new farm starts with. */
  copyFromFarmId?: number;
}

type CreateFarmUseCaseResponse =
  | { farmId: number }
  | { invalid: NewFarmProblem }
  | "not_a_member";

type CurrUseCase = _UseCase<CreateFarmUseCaseProps, CreateFarmUseCaseResponse>;

/**
 * A new farm owned by the caller, named at creation, with the eleven default
 * grupos of the plano. With a source farm it starts instead with that farm's
 * raças, categorias and active grupos under fresh ids — never its animals,
 * lotes, invernadas, touros, contas or equipe. The
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
      else await seedPlanGroups(tx, created.id);
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

  const groupRows = await tx
    .select({ kind: planGroups.kind, name: planGroups.name })
    .from(planGroups)
    .where(and(eq(planGroups.farmId, from), isNull(planGroups.archivedAt)))
    .orderBy(asc(planGroups.name));
  await seedPlanGroups(tx, to, groupRows);
}
