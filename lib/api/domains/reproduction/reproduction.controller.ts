/**
 * Reproduction of the females — breeding, pregnancy diagnosis and calving.
 *
 * The routes hang off /animals/:id because a reproduction record always
 * belongs to one dam; there is no standalone breeding collection.
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";

import { AddBreedingUseCase } from "./useCases/AddBreeding.useCase";
import { AddCalvingUseCase } from "./useCases/AddCalving.useCase";
import { SetDiagnosisUseCase } from "./useCases/SetDiagnosis.useCase";
import {
  NewBreedingBody,
  NewCalvingBody,
  NewDiagnosisBody,
} from "./schemas/reproduction.schema";

export const reproductionController = new Elysia({ prefix: "/animals/:id" })
  .use(farmPlugin)
  .post(
    "/breedings",
    async ({ farmId, params, body, status }) => {
      const result = await new AddBreedingUseCase().run({
        farmId,
        animalId: params.id,
        input: body,
      });
      if (result === "animal_not_found") return status(404, { error: result });
      if (result === "not_female") return status(422, { error: result });
      return result;
    },
    { farm: true, body: NewBreedingBody }
  )
  .post(
    "/diagnoses",
    async ({ farmId, params, body, status }) => {
      const result = await new SetDiagnosisUseCase().run({
        farmId,
        animalId: params.id,
        input: body,
      });
      if (result === "animal_not_found" || result === "breeding_not_found") {
        return status(404, { error: result });
      }
      if (result === "not_female") return status(422, { error: result });
      return result;
    },
    { farm: true, body: NewDiagnosisBody }
  )
  .post(
    "/calvings",
    async ({ farmId, params, body, status }) => {
      const result = await new AddCalvingUseCase().run({
        farmId,
        animalId: params.id,
        input: body,
      });
      if (result === "animal_not_found") return status(404, { error: result });
      if (result === "lot_not_found") return status(404, { error: result });
      if (result === "not_female") return status(422, { error: result });
      if (result === "duplicate_ear_tag") return status(409, { error: result });
      return result;
    },
    { farm: true, body: NewCalvingBody }
  );
