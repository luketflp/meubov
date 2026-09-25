/**
 * Farm lançamentos — the despesas that do not arrive through a sanitary
 * treatment and the receitas that do not come from a venda, with their
 * vencimento, pagamento, conta and lote.
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";

import { AddExpenseUseCase } from "./useCases/Add.useCase";
import { DeleteExpenseUseCase } from "./useCases/Delete.useCase";
import { UpdateExpenseUseCase } from "./useCases/Update.useCase";
import { NewExpenseBody, UpdateExpenseBody } from "./schemas/expense.schema";

export const expensesController = new Elysia({ prefix: "/expenses" })
  .use(farmPlugin)
  .post(
    "/",
    async ({ farmId, body, status }) => {
      const result = await new AddExpenseUseCase().run({ farmId, ...body });
      if (result === "due_before_date") return status(400, { error: result });
      return result;
    },
    { farm: true, body: NewExpenseBody }
  )
  .patch(
    "/:id",
    async ({ farmId, params, body, status }) => {
      const result = await new UpdateExpenseUseCase().run({
        farmId,
        id: params.id,
        patch: body,
      });
      if (result === null) return status(404, { error: "not_found" });
      if (result === "due_before_date") return status(400, { error: result });
      return result;
    },
    { farm: true, body: UpdateExpenseBody }
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
