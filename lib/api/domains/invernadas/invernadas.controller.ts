/**
 * Invernadas — the farm's physical pastures, each with a drawn outline.
 *
 * The code is the invernada's stable identity on the map, which is why it
 * cannot be edited once lots have been placed against it.
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";

import { AddInvernadaUseCase } from "./useCases/Add.useCase";
import { RemoveInvernadaUseCase } from "./useCases/Delete.useCase";
import { UpdateInvernadaUseCase } from "./useCases/Edit.useCase";
import {
  InvernadaPatchBody,
  NewInvernadaBody,
} from "./schemas/invernada.schema";

export const invernadasController = new Elysia({ prefix: "/invernadas" })
  .use(farmPlugin)
  .post(
    "/",
    async ({ farmId, body, status }) => {
      const result = await new AddInvernadaUseCase().run({ farmId, input: body });
      if (result === "duplicate_code") return status(409, { error: result });
      if (
        result === "invalid_boundary" ||
        result === "invalid_code" ||
        result === "invalid_grass" ||
        result === "invalid_name"
      ) {
        return status(422, { error: result });
      }
      return result;
    },
    { farm: true, body: NewInvernadaBody }
  )
  .patch(
    "/:id",
    async ({ farmId, params, body, status }) => {
      const result = await new UpdateInvernadaUseCase().run({
        farmId,
        id: params.id,
        patch: body,
      });
      if (result === "not_found") return status(404, { error: result });
      if (result === "duplicate_code") return status(409, { error: result });
      if (result === "immutable_code") return status(409, { error: result });
      if (
        result === "empty_patch" ||
        result === "invalid_boundary" ||
        result === "invalid_code" ||
        result === "invalid_grass" ||
        result === "invalid_name"
      ) {
        return status(422, { error: result });
      }
      return result;
    },
    { farm: true, body: InvernadaPatchBody }
  )
  .delete(
    "/:id",
    async ({ farmId, params, status }) => {
      const result = await new RemoveInvernadaUseCase().run({ farmId, id: params.id });
      if (result === "not_found") return status(404, { error: result });
      if (result === "in_use") return status(409, { error: result });
      return result;
    },
    { farm: true }
  );
