/**
 * Farm expenses — the costs that do not arrive through a sanitary treatment,
 * and the other half (with sales) of the finance screen's result.
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";

import { AddExpenseUseCase } from "./useCases/Add.useCase";
import { DeleteExpenseUseCase } from "./useCases/Delete.useCase";
import { NewExpenseBody } from "./schemas/expense.schema";

export const expensesController = new Elysia({ prefix: "/expenses" })
  .use(farmPlugin)
  .post(
    "/",
    ({ farmId, body }) => new AddExpenseUseCase().run({ farmId, ...body }),
    { farm: true, body: NewExpenseBody }
  )
  .delete(
    "/:id",
    async ({ farmId, params, status }) => {
      const removed = await new DeleteExpenseUseCase().run({ farmId, id: params.id });
      if (!removed) return status(404, { error: "not_found" });
      return { id: params.id };
    },
    { farm: true }
  );
