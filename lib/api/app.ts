/**
 * Herd API — single Elysia app mounted under /api/herd by the Next.js
 * catch-all route handler (app/api/herd/[[...slugs]]/route.ts).
 *
 * Every route opts into the `farm` macro, which resolves the authenticated
 * user and the active farm (401 without a session). `HerdApi` is the type the
 * Eden Treaty client derives end-to-end types from — import it with
 * `import type` only, so no server code leaks into the client bundle.
 */
import { Elysia } from "elysia";
import { farmPlugin } from "@/lib/api/plugins/farm";
import { loadHerdData } from "@/lib/api/services/herd";
import {
  AnimalPatchBody,
  BreedBody,
  CompleteTreatmentsBody,
  DeactivateAnimalBody,
  FarmDataBody,
  ManejoPassBody,
  ManejoSkipBody,
  NewAnimalBody,
  NewCustomCategoryBody,
  NewExpenseBody,
  NewLotBody,
  NewManejoSessionBody,
  NewMovementBody,
  NewProtocolBody,
  WeighingBody,
} from "@/lib/api/models";
import * as settings from "@/lib/api/services/settings";
import * as animalsService from "@/lib/api/services/animals";
import * as movementsService from "@/lib/api/services/movements";
import * as manejoService from "@/lib/api/services/manejo";
import * as expensesService from "@/lib/api/services/expenses";
import * as categoriesService from "@/lib/api/services/categories";

export const herdApi = new Elysia({ prefix: "/api/herd" })
  .use(farmPlugin)
  .get("/health", ({ farmId }) => ({ ok: true, farmId }), { farm: true })
  .get("/", ({ farmId }) => loadHerdData(farmId), { farm: true })

  /* ---- Settings: breeds, lots, farm, protocols -------------------------- */
  .post(
    "/breeds",
    async ({ farmId, body }) => {
      await settings.addBreed(farmId, body.name);
      return { name: body.name };
    },
    { farm: true, body: BreedBody }
  )
  .delete(
    "/breeds/:name",
    async ({ farmId, params, status }) => {
      const removed = await settings.removeBreed(farmId, params.name);
      if (!removed) return status(409, { error: "breed_in_use" });
      return { name: params.name };
    },
    { farm: true }
  )
  .post(
    "/lots",
    ({ farmId, body }) => settings.addLot(farmId, body),
    { farm: true, body: NewLotBody }
  )
  .delete(
    "/lots/:id",
    async ({ farmId, params, status }) => {
      const removed = await settings.removeLot(farmId, params.id);
      if (!removed) return status(409, { error: "lot_occupied" });
      return { id: params.id };
    },
    { farm: true }
  )
  .put(
    "/farm",
    ({ farmId, body }) => settings.saveFarm(farmId, body),
    { farm: true, body: FarmDataBody }
  )
  .post(
    "/protocols",
    ({ farmId, body }) =>
      settings.addProtocol(farmId, body.protocol, body.generateSchedule),
    { farm: true, body: NewProtocolBody }
  )
  .delete(
    "/protocols/:id",
    async ({ farmId, params }) => {
      await settings.removeProtocol(farmId, params.id);
      return { id: params.id };
    },
    { farm: true }
  )

  /* ---- Animals, weighings, treatments ----------------------------------- */
  .post(
    "/animals",
    async ({ farmId, body, status }) => {
      const animal = await animalsService.addAnimal(farmId, body);
      if (animal === null) return status(409, { error: "duplicate_ear_tag" });
      return animal;
    },
    { farm: true, body: NewAnimalBody }
  )
  .patch(
    "/animals/:earTag",
    async ({ farmId, params, body, status }) => {
      const result = await animalsService.updateAnimal(farmId, params.earTag, body);
      if (result === "animal_not_found") return status(404, { error: result });
      if (result === "category_not_found") return status(404, { error: result });
      return result;
    },
    { farm: true, body: AnimalPatchBody }
  )
  .post(
    "/animals/:earTag/deactivate",
    async ({ farmId, params, body, status }) => {
      const done = await animalsService.deactivateAnimal(
        farmId,
        params.earTag,
        body.reason
      );
      if (!done) return status(404, { error: "animal_not_found" });
      return { earTag: params.earTag, reason: body.reason };
    },
    { farm: true, body: DeactivateAnimalBody }
  )
  .post(
    "/animals/:earTag/weighings",
    async ({ farmId, params, body, status }) => {
      const weighing = await animalsService.recordWeighing(farmId, params.earTag, body);
      if (weighing === null) return status(404, { error: "animal_not_found" });
      return weighing;
    },
    { farm: true, body: WeighingBody }
  )
  .post(
    "/treatments/complete",
    async ({ farmId, body }) => ({
      ids: await settings.completeTreatments(farmId, body.ids),
    }),
    { farm: true, body: CompleteTreatmentsBody }
  )

  /* ---- Movements --------------------------------------------------------- */
  .post(
    "/movements",
    ({ farmId, body, status }) => {
      if (body.type !== "transfer" && body.amountBrl === undefined) {
        return status(422, { error: "amount_required" });
      }
      return movementsService.recordMovement(farmId, body);
    },
    { farm: true, body: NewMovementBody }
  )

  /* ---- Custom herd categories -------------------------------------------- */
  .post(
    "/categories",
    async ({ farmId, body, status }) => {
      const category = await categoriesService.addCustomCategory(farmId, body);
      if (category === null) return status(409, { error: "duplicate_name" });
      return category;
    },
    { farm: true, body: NewCustomCategoryBody }
  )
  .delete(
    "/categories/:id",
    async ({ farmId, params, status }) => {
      const removed = await categoriesService.removeCustomCategory(farmId, params.id);
      if (!removed) return status(409, { error: "category_in_use" });
      return { id: params.id };
    },
    { farm: true }
  )

  /* ---- Expenses ---------------------------------------------------------- */
  .post(
    "/expenses",
    ({ farmId, body }) => expensesService.addExpense(farmId, body),
    { farm: true, body: NewExpenseBody }
  )
  .delete(
    "/expenses/:id",
    async ({ farmId, params, status }) => {
      const removed = await expensesService.removeExpense(farmId, params.id);
      if (!removed) return status(404, { error: "not_found" });
      return { id: params.id };
    },
    { farm: true }
  )

  /* ---- Manejo sessions --------------------------------------------------- */
  .post(
    "/manejo",
    async ({ farmId, body, status }) => {
      const session = await manejoService.startSession(farmId, body);
      if (session === null) return status(404, { error: "animal_not_found" });
      return session;
    },
    { farm: true, body: NewManejoSessionBody }
  )
  .post(
    "/manejo/:id/animals/:earTag/complete",
    async ({ farmId, params, body, status }) => {
      const result = await manejoService.completeAnimal(
        farmId,
        params.id,
        params.earTag,
        body
      );
      if (result === null) return status(404, { error: "not_found" });
      if ("conflict" in result) return status(409, { error: result.conflict });
      return result;
    },
    { farm: true, body: ManejoPassBody }
  )
  .post(
    "/manejo/:id/animals/:earTag/skip",
    async ({ farmId, params, body, status }) => {
      const result = await manejoService.skipAnimal(
        farmId,
        params.id,
        params.earTag,
        body.notes
      );
      if (result === null) return status(404, { error: "not_found" });
      if ("conflict" in result) return status(409, { error: result.conflict });
      return result;
    },
    { farm: true, body: ManejoSkipBody }
  )
  .post(
    "/manejo/:id/animals/:earTag/reopen",
    async ({ farmId, params, status }) => {
      const result = await manejoService.reopenAnimal(farmId, params.id, params.earTag);
      if (result === null) return status(404, { error: "not_found" });
      if ("conflict" in result) return status(409, { error: result.conflict });
      return result;
    },
    { farm: true }
  )
  .post(
    "/manejo/:id/close",
    async ({ farmId, params, status }) => {
      const closed = await manejoService.closeSession(farmId, params.id);
      if (!closed) return status(404, { error: "not_found" });
      return { id: params.id, status: "closed" as const };
    },
    { farm: true }
  );

export type HerdApi = typeof herdApi;
