/**
 * Animals — registration (one or a batch), bulk import, edits and the baixa.
 *
 * Every route is farm-scoped and addresses an existing animal by its stable
 * id, never by ear tag: the tag is an editable identifier.
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";
import { todayISO } from "@/lib/domain/dates";

import { AddAnimalUseCase } from "./useCases/Add.useCase";
import { AddAnimalsUseCase } from "./useCases/AddBatch.useCase";
import { DeactivateAnimalUseCase } from "./useCases/Deactivate.useCase";
import { ImportAnimalsUseCase } from "./useCases/Import.useCase";
import { RecordWeighingUseCase } from "./useCases/RecordWeighing.useCase";
import { UpdateAnimalUseCase } from "./useCases/Edit.useCase";
import {
  AnimalPatchBody,
  DeactivateAnimalBody,
  ImportAnimalsBody,
  NewAnimalBody,
  NewAnimalsBody,
  WeighingBody,
} from "./schemas/animal.schema";

export const animalsController = new Elysia({ prefix: "/animals" })
  .use(farmPlugin)
  .post(
    "/",
    async ({ farmId, body, status }) => {
      const animal = await new AddAnimalUseCase().run({ farmId, input: body });
      if (animal === "lot_not_found") return status(404, { error: animal });
      if (animal === null) return status(409, { error: "duplicate_ear_tag" });
      return animal;
    },
    { farm: true, body: NewAnimalBody }
  )
  .post(
    "/batch",
    async ({ farmId, body, status }) => {
      const result = await new AddAnimalsUseCase().run({ farmId, inputs: body.animals });
      if (result === "lot_not_found") return status(404, { error: result });
      if ("error" in result) return status(409, result);
      return result;
    },
    { farm: true, body: NewAnimalsBody }
  )
  .post(
    "/import",
    async ({ farmId, body, status }) => {
      const result = await new ImportAnimalsUseCase().run({ farmId, rows: body.animals });
      if ("error" in result) {
        return status(422, result);
      }
      return result;
    },
    { farm: true, body: ImportAnimalsBody }
  )
  .patch(
    "/:id",
    async ({ farmId, params, body, status }) => {
      const result = await new UpdateAnimalUseCase().run({
        farmId,
        animalId: params.id,
        patch: body,
      });
      if (result === "animal_not_found") return status(404, { error: result });
      if (result === "category_not_found") return status(404, { error: result });
      if (result === "lot_not_found") return status(404, { error: result });
      if (result === "duplicate_ear_tag") return status(409, { error: result });
      if (result === "invalid_ear_tag") return status(422, { error: result });
      return result;
    },
    { farm: true, body: AnimalPatchBody }
  )
  .post(
    "/:id/deactivate",
    async ({ farmId, params, body, status }) => {
      // A baixa is history: it can be backdated, never postdated.
      if (body.date > todayISO()) return status(422, { error: "future_date" });
      const done = await new DeactivateAnimalUseCase().run({
        farmId,
        animalId: params.id,
        input: body,
      });
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
    "/:id/weighings",
    async ({ farmId, params, body, status }) => {
      const weighing = await new RecordWeighingUseCase().run({
        farmId,
        animalId: params.id,
        input: body,
      });
      if (weighing === null) return status(404, { error: "animal_not_found" });
      return weighing;
    },
    { farm: true, body: WeighingBody }
  );
