/**
 * Weighings as a collection of their own.
 *
 * Recording a weight belongs to one animal (POST /animals/:id/weighings), but
 * undoing a weighing day is a herd-wide correction: one date, many ear tags.
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";

import { DeleteWeighingsUseCase } from "./useCases/DeleteWeighings.useCase";
import { DeleteWeighingsBody } from "./schemas/animal.schema";

export const weighingsController = new Elysia({ prefix: "/weighings" })
  .use(farmPlugin)
  .delete(
    "/",
    async ({ farmId, body }) =>
      new DeleteWeighingsUseCase().run({
        farmId,
        date: body.date,
        earTags: body.earTags,
      }),
    { farm: true, body: DeleteWeighingsBody }
  );
