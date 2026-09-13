/**
 * Manejo sessions — the curral working sessions, and the transactional core of
 * the herd API.
 *
 * A manejo takes hours, not one click: the session opens with every selected
 * animal pending and each one is completed, skipped or reopened as it passes
 * the chute. Transfers, sales and entries are manejo sessions too, which is
 * why there is no separate movement endpoint. So is an inseminação: each pass
 * records an IATF cobertura and takes one dose of semen.
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";
import { can } from "@/lib/domain/permissions";
import {
  redactManejoSession,
  redactPass,
  startNeedsFinance,
} from "@/lib/domain/moneyRedaction";

import { CloseSessionUseCase } from "./useCases/Close.useCase";
import { CompleteAnimalUseCase } from "./useCases/CompleteAnimal.useCase";
import { DeleteSessionUseCase } from "./useCases/Delete.useCase";
import { RegisterEntryAnimalUseCase } from "./useCases/RegisterEntryAnimal.useCase";
import { ReopenAnimalUseCase } from "./useCases/ReopenAnimal.useCase";
import { SetCarcassYieldUseCase } from "./useCases/SetCarcassYield.useCase";
import { SkipAnimalUseCase } from "./useCases/SkipAnimal.useCase";
import { StartSessionUseCase } from "./useCases/Start.useCase";
import {
  EntryAnimalBody,
  ManejoPassBody,
  ManejoSkipBody,
  NewManejoSessionBody,
  SaleYieldBody,
} from "./schemas/manejo.schema";

export const manejoController = new Elysia({ prefix: "/manejo" })
  .use(farmPlugin)
  .post(
    "/",
    async ({ farmId, permissions, body, status }) => {
      // Only an entry (compra) starts with no animals: they are registered as
      // they arrive. Transfers need somewhere to land.
      if (body.earTags.length === 0 && body.kind !== "entry") {
        return status(422, { error: "animals_required" });
      }
      if (
        (body.kind === "transfer" || body.kind === "entry") &&
        body.destinationLotId === undefined
      ) {
        return status(422, { error: "destination_required" });
      }
      // The touro principal is what every cow of an inseminação starts with.
      if (body.kind === "insemination" && body.semenBullId === undefined) {
        return status(422, { error: "semen_bull_required" });
      }
      // A venda or entrada is opened with its price by whoever holds the money.
      if (startNeedsFinance(body) && !can(permissions, "finance", "edit")) {
        return status(403, { error: "forbidden", area: "finance" });
      }
      const session = await new StartSessionUseCase().run({ farmId, input: body });
      if (session === "lot_not_found") return status(404, { error: session });
      if (session === "bull_not_found") return status(404, { error: session });
      if (session === "not_female") return status(422, { error: session });
      if (session === null) return status(404, { error: "animal_not_found" });
      return can(permissions, "finance", "view") ? session : redactManejoSession(session);
    },
    { farm: true, body: NewManejoSessionBody }
  )
  .post(
    "/:id/animals",
    async ({ farmId, params, body, status }) => {
      const result = await new RegisterEntryAnimalUseCase().run({
        farmId,
        sessionId: params.id,
        input: body,
      });
      if (result === "lot_not_found") return status(404, { error: result });
      if (result === null) return status(404, { error: "not_found" });
      if (result === "duplicate") return status(409, { error: "duplicate_ear_tag" });
      if ("conflict" in result) return status(409, { error: result.conflict });
      return result;
    },
    { farm: true, body: EntryAnimalBody }
  )
  .post(
    "/:id/animals/:animalId/complete",
    async ({ farmId, permissions, params, body, status }) => {
      const result = await new CompleteAnimalUseCase().run({
        farmId,
        sessionId: params.id,
        animalId: params.animalId,
        data: body,
      });
      if (result === "lot_not_found") return status(404, { error: result });
      if (result === "bull_not_found") return status(404, { error: result });
      if (result === null) return status(404, { error: "not_found" });
      if ("conflict" in result) return status(409, { error: result.conflict });
      return can(permissions, "finance", "view") ? result : redactPass(result);
    },
    { farm: true, body: ManejoPassBody }
  )
  .post(
    "/:id/animals/:animalId/skip",
    async ({ farmId, params, body, status }) => {
      const result = await new SkipAnimalUseCase().run({
        farmId,
        sessionId: params.id,
        animalId: params.animalId,
        notes: body.notes,
      });
      if (result === null) return status(404, { error: "not_found" });
      if ("conflict" in result) return status(409, { error: result.conflict });
      return result;
    },
    { farm: true, body: ManejoSkipBody }
  )
  .post(
    "/:id/animals/:animalId/reopen",
    async ({ farmId, params, status }) => {
      const result = await new ReopenAnimalUseCase().run({
        farmId,
        sessionId: params.id,
        animalId: params.animalId,
      });
      if (result === "lot_not_found") return status(404, { error: result });
      if (result === null) return status(404, { error: "not_found" });
      if ("conflict" in result) {
        // A diagnosed cobertura names itself, so the client can offer to clear it.
        return "breedingId" in result
          ? status(409, { error: result.conflict, breedingId: result.breedingId })
          : status(409, { error: result.conflict });
      }
      return result;
    },
    { farm: true }
  )
  .post(
    "/:id/carcass-yield",
    async ({ farmId, params, body, status }) => {
      const result = await new SetCarcassYieldUseCase().run({
        farmId,
        sessionId: params.id,
        carcassYieldPct: body.carcassYieldPct,
      });
      if (result === null) return status(404, { error: "not_found" });
      if ("conflict" in result) return status(409, { error: result.conflict });
      return result;
    },
    { farm: true, body: SaleYieldBody }
  )
  .post(
    "/:id/close",
    async ({ farmId, params, status }) => {
      const closed = await new CloseSessionUseCase().run({
        farmId,
        sessionId: params.id,
      });
      if (!closed) return status(404, { error: "not_found" });
      return { id: params.id, status: "closed" as const };
    },
    { farm: true }
  )
  .delete(
    "/:id",
    async ({ farmId, permissions, params, status }) => {
      const result = await new DeleteSessionUseCase().run({
        farmId,
        id: params.id,
        canEditFinance: can(permissions, "finance", "edit"),
      });
      if (result === "session_not_found") return status(404, { error: result });
      if (result === "finance_required") {
        return status(403, { error: "forbidden", area: "finance" });
      }
      if ("blocked" in result) return status(409, result);
      return result;
    },
    { farm: true }
  );
