/**
 * The grupos of the plano de contas, of every tipo. Every one is the farm's:
 * it is renamed, archived (the forms stop offering it, its history stays) or,
 * while nothing uses it, deleted with its contas and orçamento lines. Its tipo
 * is set when it is created and never changes.
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";

import { AddPlanGroupUseCase } from "./useCases/Add.useCase";
import { DeletePlanGroupUseCase } from "./useCases/Delete.useCase";
import { UpdatePlanGroupUseCase } from "./useCases/Update.useCase";
import { NewPlanGroupBody, UpdatePlanGroupBody } from "./schemas/planGroup.schema";

export const planGroupsController = new Elysia({ prefix: "/plan-groups" })
  .use(farmPlugin)
  .post(
    "/",
    async ({ farmId, body, status }) => {
      const result = await new AddPlanGroupUseCase().run({ farmId, kind: body.kind, name: body.name });
      if (result === "duplicate") return status(409, { error: "duplicate_name" });
      return result;
    },
    { farm: true, body: NewPlanGroupBody }
  )
  .patch(
    "/:id",
    async ({ farmId, params, body, status }) => {
      const result = await new UpdatePlanGroupUseCase().run({ farmId, id: params.id, patch: body });
      if (result === null) return status(404, { error: "not_found" });
      if (result === "duplicate") return status(409, { error: "duplicate_name" });
      return result;
    },
    { farm: true, body: UpdatePlanGroupBody }
  )
  .delete(
    "/:id",
    async ({ farmId, params, status }) => {
      const result = await new DeletePlanGroupUseCase().run({ farmId, id: params.id });
      if (result === "not_found") return status(404, { error: result });
      if (result === "in_use") return status(409, { error: result });
      return { id: params.id };
    },
    { farm: true }
  );
