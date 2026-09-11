import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  animals,
  manejoSessionAnimals,
  manejoSessions,
} from "@/lib/db/schema";
import { sessionName } from "@/lib/domain/manejo";
import {
  toManejoSession,
  toManejoSessionAnimal,
} from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import {
  ValidateLotAssignmentUseCase,
  type LotAssignmentError,
} from "@/lib/api/domains/animals/useCases/ValidateLotAssignment.useCase";


import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type {
  ManejoSession,
  ManejoTreatmentPlan,
} from "@/lib/types";
import type { NewManejoSession } from "@/lib/store/useHerdStore";

interface StartSessionUseCaseProps {
  farmId: number;
  input: NewManejoSession;
}

type StartSessionUseCaseResponse = ManejoSession | LotAssignmentError | null;

type CurrUseCase = _UseCase<StartSessionUseCaseProps, StartSessionUseCaseResponse>;

/**
 * Opens a session with every selected animal pending, in chute-line order.
 *
 * An entry session opens EMPTY on purpose: the animals it registers do not
 * exist yet and join the herd one by one, as the truck unloads at the curral
 * (see `registerEntryAnimal`). Any destination is resolved inside this farm
 * before the session row is written.
 */
export class StartSessionUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("StartSessionUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, input }) => {
    return this.repository.transaction(async (tx) => {
      const herd =
        input.earTags.length === 0
          ? []
          : await tx
              .select({ id: animals.id, earTag: animals.earTag })
              .from(animals)
              .where(and(eq(animals.farmId, farmId), inArray(animals.earTag, input.earTags)));
      const idByEarTag = new Map(herd.map((a) => [a.earTag, a.id]));
      if (input.earTags.some((earTag) => !idByEarTag.has(earTag))) return null;

      if (input.destinationLotId !== undefined) {
        const lotError = await new ValidateLotAssignmentUseCase(tx).run({ farmId, lotId: input.destinationLotId });
        if (lotError) return lotError;
      }

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
          carcassYieldPct: input.carcassYieldPct,
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
  };
}
