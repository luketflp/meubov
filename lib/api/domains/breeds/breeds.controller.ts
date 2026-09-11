/**
 * Breeds — the raças a farm registers and assigns to its animals.
 *
 * A breed has no id: the name is its identity within the farm, so it is also
 * the path parameter.
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";

import { AddBreedUseCase } from "./useCases/Add.useCase";
import { DeleteBreedUseCase } from "./useCases/Delete.useCase";
import { BreedBody } from "./schemas/breed.schema";

export const breedsController = new Elysia({ prefix: "/breeds" })
  .use(farmPlugin)
  .post(
    "/",
    async ({ farmId, body }) => {
      await new AddBreedUseCase().run({ farmId, name: body.name });
      return { name: body.name };
    },
    { farm: true, body: BreedBody }
  )
  .delete(
    "/:name",
    async ({ farmId, params, status }) => {
      const removed = await new DeleteBreedUseCase().run({
        farmId,
        name: params.name,
      });
      if (!removed) return status(409, { error: "breed_in_use" });
      return { name: params.name };
    },
    { farm: true }
  );
