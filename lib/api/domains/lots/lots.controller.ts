/**
 * Logical lots — the groups animals belong to — and their placements, which
 * are where a lot physically sits over time.
 *
 * A lot is never "in" an invernada by a column: the open placement row is the
 * current location, so moving and archiving are placement writes.
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";

import { AddLotUseCase } from "./useCases/Add.useCase";
import { ArchiveLotUseCase } from "./useCases/Archive.useCase";
import { MoveLotUseCase } from "./useCases/Move.useCase";
import { RemoveLotUseCase } from "./useCases/Delete.useCase";
import { UpdateLotUseCase } from "./useCases/Edit.useCase";
import {
  ArchiveLotBody,
  LotPatchBody,
  MoveLotBody,
  NewLotBody,
} from "./schemas/lot.schema";

export const lotsController = new Elysia({ prefix: "/lots" })
  .use(farmPlugin)
  .post(
    "/",
    async ({ farmId, body, status }) => {
      const result = await new AddLotUseCase().run({ farmId, input: body });
      if (result === "invernada_not_found") return status(404, { error: result });
      if (result === "duplicate_name") return status(409, { error: result });
      if (result === "invalid_name") return status(422, { error: result });
      return result;
    },
    { farm: true, body: NewLotBody }
  )
  .patch(
    "/:id",
    async ({ farmId, params, body, status }) => {
      const result = await new UpdateLotUseCase().run({
        farmId,
        id: params.id,
        patch: body,
      });
      if (result === "duplicate_name") return status(409, { error: result });
      if (result === "empty_patch") return status(422, { error: result });
      if (result === "invalid_name") return status(422, { error: result });
      if (result === null) return status(404, { error: "not_found" });
      return result;
    },
    { farm: true, body: LotPatchBody }
  )
  .delete(
    "/:id",
    async ({ farmId, params, status }) => {
      const result = await new RemoveLotUseCase().run({ farmId, id: params.id });
      if (result === "lot_not_found") return status(404, { error: result });
      if (result === "lot_occupied") return status(409, { error: result });
      return result;
    },
    { farm: true }
  )
  .post(
    "/:id/archive",
    async ({ farmId, params, body, status }) => {
      const result = await new ArchiveLotUseCase().run({
        farmId,
        id: params.id,
        endedOn: body.endedOn,
      });
      if (result === "lot_not_found") return status(404, { error: result });
      if (result === "lot_occupied" || result === "placement_not_found") {
        return status(409, { error: result });
      }
      if (result === "future_date" || result === "nonmonotonic_date") {
        return status(422, { error: result });
      }
      return result;
    },
    { farm: true, body: ArchiveLotBody }
  )
  .post(
    "/:id/placements",
    async ({ farmId, params, body, status }) => {
      const result = await new MoveLotUseCase().run({
        farmId,
        id: params.id,
        input: body,
      });
      if (result === "lot_not_found" || result === "invernada_not_found") {
        return status(404, { error: result });
      }
      if (result === "future_date" || result === "nonmonotonic_date") {
        return status(422, { error: result });
      }
      if (result === "placement_not_found" || result === "same_destination") {
        return status(409, { error: result });
      }
      return result;
    },
    { farm: true, body: MoveLotBody }
  );
