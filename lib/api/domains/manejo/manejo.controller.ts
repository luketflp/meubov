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
import { todayISO } from "@/lib/domain/dates";
import { can } from "@/lib/domain/permissions";
import {
  redactManejoSession,
  redactPass,
  startNeedsFinance,
} from "@/lib/domain/moneyRedaction";

import { BaixaAnimalUseCase } from "./useCases/BaixaAnimal.useCase";
import { CloseSessionUseCase } from "./useCases/Close.useCase";
import { CompleteAnimalUseCase } from "./useCases/CompleteAnimal.useCase";
import { DeleteSessionUseCase } from "./useCases/Delete.useCase";
import { RegisterEntryAnimalUseCase } from "./useCases/RegisterEntryAnimal.useCase";
import { ReopenAnimalUseCase } from "./useCases/ReopenAnimal.useCase";
import { SetAsideAnimalUseCase } from "./useCases/SetAsideAnimal.useCase";
import { SetCarcassYieldUseCase } from "./useCases/SetCarcassYield.useCase";
import { SkipAnimalUseCase } from "./useCases/SkipAnimal.useCase";
import { StartSessionUseCase } from "./useCases/Start.useCase";
import type { PassConflict } from "./_shared/session";
import {
  EntryAnimalBody,
  ManejoBaixaBody,
  ManejoPassBody,
  ManejoSkipBody,
  NewManejoSessionBody,
  SaleYieldBody,
  SetAsideBody,
} from "./schemas/manejo.schema";

/**
 * A pass route's 409: `{ error }`, plus the server's entry when the refusal
 * names one, without money for a caller without Financeiro view.
 */
function passConflict(result: PassConflict, showMoney: boolean) {
  const { entry } = result;
  if (!entry) return { error: result.conflict };
  return {
    error: result.conflict,
    entry: showMoney ? entry : redactPass({ entry, treatments: [] }).entry,
  };
}

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
      // An inseminação is opened with the touros the brete will offer.
      if (body.kind === "insemination" && (body.semenBullIds?.length ?? 0) === 0) {
        return status(422, { error: "semen_bulls_required" });
      }
      // A venda or entrada is opened with its price by whoever holds the money.
      if (startNeedsFinance(body) && !can(permissions, "finance", "edit")) {
        return status(403, { error: "forbidden", area: "finance" });
      }
      const session = await new StartSessionUseCase().run({ farmId, input: body });
      // A phone's offline id that another farm (or a discarded manejo) holds.
      if (session === "id_taken") return status(409, { error: session });
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
        // The rendimento reprices money: only Financeiro edit may set it.
        data: can(permissions, "finance", "edit") ? body : { ...body, carcassYieldPct: undefined },
        force: body.force,
      });
      if (result === "lot_not_found") return status(404, { error: result });
      if (result === "bull_not_found") return status(404, { error: result });
      if (result === null) return status(404, { error: "not_found" });
      if ("conflict" in result) {
        return status(409, passConflict(result, can(permissions, "finance", "view")));
      }
      return can(permissions, "finance", "view") ? result : redactPass(result);
    },
    { farm: true, body: ManejoPassBody }
  )
  .post(
    "/:id/animals/:animalId/set-aside",
    async ({ farmId, permissions, params, body, status }) => {
      const result = await new SetAsideAnimalUseCase().run({
        farmId,
        sessionId: params.id,
        animalId: params.animalId,
        input: body,
        force: body.force,
      });
      if (result === "lot_not_found") return status(404, { error: result });
      if (result === null) return status(404, { error: "not_found" });
      if ("conflict" in result) {
        return status(409, passConflict(result, can(permissions, "finance", "view")));
      }
      return result;
    },
    { farm: true, body: SetAsideBody }
  )
  .post(
    "/:id/animals/:animalId/skip",
    async ({ farmId, permissions, params, body, status }) => {
      const result = await new SkipAnimalUseCase().run({
        farmId,
        sessionId: params.id,
        animalId: params.animalId,
        notes: body.notes,
        force: body.force,
      });
      if (result === "lot_not_found") return status(404, { error: result });
      if (result === null) return status(404, { error: "not_found" });
      if ("conflict" in result) {
        return status(409, passConflict(result, can(permissions, "finance", "view")));
      }
      return result;
    },
    { farm: true, body: ManejoSkipBody }
  )
  .post(
    "/:id/animals/:animalId/baixa",
    async ({ farmId, permissions, params, body, status }) => {
      // A baixa is history: it can be backdated, never postdated.
      if (body.date > todayISO()) return status(422, { error: "future_date" });
      const result = await new BaixaAnimalUseCase().run({
        farmId,
        sessionId: params.id,
        animalId: params.animalId,
        input: body,
        force: body.force,
      });
      if (result === "lot_not_found") return status(404, { error: result });
      if (result === null) return status(404, { error: "not_found" });
      if ("conflict" in result) {
        return status(409, passConflict(result, can(permissions, "finance", "view")));
      }
      return result;
    },
    { farm: true, body: ManejoBaixaBody }
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
      if (typeof closed === "object") return status(409, { error: closed.conflict });
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
