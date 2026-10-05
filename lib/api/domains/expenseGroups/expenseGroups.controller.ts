/**
 * Grupos de despesa of the farm, next to the seven built-in ones: they count in
 * the COE the same way. A grupo with lançamentos is archived, so they keep it;
 * only an unused one is deleted, with its contas and orçamento lines.
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";

import { AddExpenseGroupUseCase } from "./useCases/Add.useCase";
import { DeleteExpenseGroupUseCase } from "./useCases/Delete.useCase";
import { UpdateExpenseGroupUseCase } from "./useCases/Update.useCase";
import { NewExpenseGroupBody, UpdateExpenseGroupBody } from "./schemas/expenseGroup.schema";

export const expenseGroupsController = new Elysia({ prefix: "/expense-groups" })
  .use(farmPlugin)
  .post(
    "/",
    async ({ farmId, body, status }) => {
      const result = await new AddExpenseGroupUseCase().run({ farmId, name: body.name });
      if (result === "duplicate") return status(409, { error: "duplicate_name" });
      return result;
    },
    { farm: true, body: NewExpenseGroupBody }
  )
  .patch(
    "/:id",
    async ({ farmId, params, body, status }) => {
      const result = await new UpdateExpenseGroupUseCase().run({ farmId, id: params.id, patch: body });
      if (result === null) return status(404, { error: "not_found" });
      if (result === "duplicate") return status(409, { error: "duplicate_name" });
      return result;
    },
    { farm: true, body: UpdateExpenseGroupBody }
  )
  .delete(
    "/:id",
    async ({ farmId, params, status }) => {
      const result = await new DeleteExpenseGroupUseCase().run({ farmId, id: params.id });
      if (result === "not_found") return status(404, { error: result });
      if (result === "in_use") return status(409, { error: result });
      return { id: params.id };
    },
    { farm: true }
  );
