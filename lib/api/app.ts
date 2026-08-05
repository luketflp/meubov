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
import { todayISO } from "@/lib/domain/dates";
import { loadHerdData } from "@/lib/api/services/herd";
import {
  AnimalPatchBody,
  BreedBody,
  CompleteTreatmentsBody,
  DeactivateAnimalBody,
  EntryAnimalBody,
  FarmDataBody,
  ImportAnimalsBody,
  LotPatchBody,
  ManejoPassBody,
  ManejoSkipBody,
  NewAnimalBody,
  NewBreedingBody,
  NewCalvingBody,
  NewCustomCategoryBody,
  NewDiagnosisBody,
  NewExpenseBody,
  NewLotBody,
  NewManejoSessionBody,
  NewProtocolBody,
  WeighingBody,
} from "@/lib/api/models";
import * as settings from "@/lib/api/services/settings";
import * as animalsService from "@/lib/api/services/animals";
import * as manejoService from "@/lib/api/services/manejo";
import * as expensesService from "@/lib/api/services/expenses";
import * as farmsService from "@/lib/api/services/farms";
import * as categoriesService from "@/lib/api/services/categories";
import * as reproductionService from "@/lib/api/services/reproduction";

/** Postgres `foreign_key_violation`. */
const FOREIGN_KEY_VIOLATION = "23503";

function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === FOREIGN_KEY_VIOLATION
  );
}

export const herdApi = new Elysia({ prefix: "/api/herd" })
  .use(farmPlugin)
  /*
   * A delete can still fail at the database after its own guard passed: the
   * lot guard only looks at ACTIVE animals, while inactive animals and manejo
   * history reference the lot with ON DELETE NO ACTION. Answering 409 keeps
   * the client's "still in use" branch working instead of an opaque 500.
   */
  .onError(({ error, status }) => {
    if (isForeignKeyViolation(error)) return status(409, { error: "in_use" });
  })
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
    async ({ farmId, body, status }) => {
      const lot = await settings.addLot(farmId, body);
      if (lot === "invalid_boundary") return status(422, { error: lot });
      return lot;
    },
    { farm: true, body: NewLotBody }
  )
  .patch(
    "/lots/:id",
    async ({ farmId, params, body, status }) => {
      const result = await settings.updateLot(farmId, params.id, body);
      if (result === "empty_patch") return status(422, { error: result });
      if (result === "invalid_boundary") return status(422, { error: result });
      if (result === null) return status(404, { error: "not_found" });
      return result;
    },
    { farm: true, body: LotPatchBody }
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
  .get(
    "/farms",
    async ({ user, farmId, superuser }) => ({
      farms: await farmsService.listFarmsForUser(user.id, superuser),
      activeFarmId: farmId,
    }),
    { farm: true }
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
  .post(
    "/animals/import",
    ({ farmId, body }) => animalsService.importAnimals(farmId, body.animals),
    { farm: true, body: ImportAnimalsBody }
  )
  .patch(
    "/animals/:id",
    async ({ farmId, params, body, status }) => {
      const result = await animalsService.updateAnimal(farmId, params.id, body);
      if (result === "animal_not_found") return status(404, { error: result });
      if (result === "category_not_found") return status(404, { error: result });
      if (result === "duplicate_ear_tag") return status(409, { error: result });
      if (result === "invalid_ear_tag") return status(422, { error: result });
      return result;
    },
    { farm: true, body: AnimalPatchBody }
  )
  .post(
    "/animals/:id/deactivate",
    async ({ farmId, params, body, status }) => {
      // A baixa is history: it can be backdated, never postdated.
      if (body.date > todayISO()) return status(422, { error: "future_date" });
      const done = await animalsService.deactivateAnimal(farmId, params.id, body);
      if (!done) return status(404, { error: "animal_not_found" });
      return {
        id: params.id,
        reason: body.reason,
        date: body.date,
        notes: body.notes,
      };
    },
    { farm: true, body: DeactivateAnimalBody }
  )
  .post(
    "/animals/:id/weighings",
    async ({ farmId, params, body, status }) => {
      const weighing = await animalsService.recordWeighing(farmId, params.id, body);
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

  /* ---- Reproduction (females) -------------------------------------------- */
  .post(
    "/animals/:id/breedings",
    async ({ farmId, params, body, status }) => {
      const result = await reproductionService.addBreeding(farmId, params.id, body);
      if (result === "animal_not_found") return status(404, { error: result });
      if (result === "not_female") return status(422, { error: result });
      return result;
    },
    { farm: true, body: NewBreedingBody }
  )
  .post(
    "/animals/:id/diagnoses",
    async ({ farmId, params, body, status }) => {
      const result = await reproductionService.setDiagnosis(farmId, params.id, body);
      if (result === "animal_not_found" || result === "breeding_not_found") {
        return status(404, { error: result });
      }
      if (result === "not_female") return status(422, { error: result });
      return result;
    },
    { farm: true, body: NewDiagnosisBody }
  )
  .post(
    "/animals/:id/calvings",
    async ({ farmId, params, body, status }) => {
      const result = await reproductionService.addCalving(farmId, params.id, body);
      if (result === "animal_not_found") return status(404, { error: result });
      if (result === "not_female") return status(422, { error: result });
      if (result === "duplicate_ear_tag") return status(409, { error: result });
      return result;
    },
    { farm: true, body: NewCalvingBody }
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
      const session = await manejoService.startSession(farmId, body);
      if (session === null) return status(404, { error: "animal_not_found" });
      return session;
    },
    { farm: true, body: NewManejoSessionBody }
  )
  .post(
    "/manejo/:id/animals",
    async ({ farmId, params, body, status }) => {
      const result = await manejoService.registerEntryAnimal(farmId, params.id, body);
      if (result === null) return status(404, { error: "not_found" });
      if (result === "duplicate") return status(409, { error: "duplicate_ear_tag" });
      if ("conflict" in result) return status(409, { error: result.conflict });
      return result;
    },
    { farm: true, body: EntryAnimalBody }
  )
  .post(
    "/manejo/:id/animals/:animalId/complete",
    async ({ farmId, params, body, status }) => {
      const result = await manejoService.completeAnimal(
        farmId,
        params.id,
        params.animalId,
        body
      );
      if (result === null) return status(404, { error: "not_found" });
      if ("conflict" in result) return status(409, { error: result.conflict });
      return result;
    },
    { farm: true, body: ManejoPassBody }
  )
  .post(
    "/manejo/:id/animals/:animalId/skip",
    async ({ farmId, params, body, status }) => {
      const result = await manejoService.skipAnimal(
        farmId,
        params.id,
        params.animalId,
        body.notes
      );
      if (result === null) return status(404, { error: "not_found" });
      if ("conflict" in result) return status(409, { error: result.conflict });
      return result;
    },
    { farm: true, body: ManejoSkipBody }
  )
  .post(
    "/manejo/:id/animals/:animalId/reopen",
    async ({ farmId, params, status }) => {
      const result = await manejoService.reopenAnimal(farmId, params.id, params.animalId);
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
