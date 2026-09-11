import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { animals, healthProtocols, treatments } from "@/lib/db/schema";
import { addDays, todayISO } from "@/lib/domain/dates";
import { toProtocol, toTreatment } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { HealthProtocol, Treatment } from "@/lib/types";

/** Days between today and the scheduled date when generating a protocol schedule. */
const DAYS_UNTIL_SCHEDULE = 14;

interface AddProtocolUseCaseProps {
  farmId: number;
  protocol: Omit<HealthProtocol, "id">;
  generateSchedule: boolean;
}

interface AddProtocolUseCaseResponse {
  protocol: HealthProtocol;
  treatments: Treatment[];
}

type CurrUseCase = _UseCase<AddProtocolUseCaseProps, AddProtocolUseCaseResponse>;

/**
 * Registers a health protocol; when generateSchedule is set, also creates one
 * scheduled treatment per active animal, DAYS_UNTIL_SCHEDULE days from today
 * (farm timezone).
 */
export class AddProtocolUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("AddProtocolUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, protocol, generateSchedule }) => {
    return this.repository.transaction(async (tx) => {
      const [protocolRow] = await tx
        .insert(healthProtocols)
        .values({
          id: randomUUID(),
          farmId,
          name: protocol.name,
          type: protocol.type,
          intervalMonths: protocol.intervalMonths,
          withdrawalDays: protocol.withdrawalDays,
          mandatory: protocol.mandatory,
        })
        .returning();

      if (!generateSchedule) {
        return { protocol: toProtocol(protocolRow), treatments: [] };
      }

      const active = await tx
        .select({ id: animals.id, earTag: animals.earTag })
        .from(animals)
        .where(and(eq(animals.farmId, farmId), eq(animals.active, true)));
      if (active.length === 0) {
        return { protocol: toProtocol(protocolRow), treatments: [] };
      }

      const date = addDays(todayISO(), DAYS_UNTIL_SCHEDULE);
      const rows = await tx
        .insert(treatments)
        .values(
          active.map((a) => ({
            id: randomUUID(),
            animalId: a.id,
            type: protocol.type,
            name: protocol.name,
            date,
            status: "scheduled" as const,
            withdrawalDays: protocol.withdrawalDays,
          }))
        )
        .returning();

      const earTagByAnimal = new Map(active.map((a) => [a.id, a.earTag]));
      return {
        protocol: toProtocol(protocolRow),
        treatments: rows.map((row) => toTreatment(row, earTagByAnimal.get(row.animalId)!)),
      };
    });
  };
}
