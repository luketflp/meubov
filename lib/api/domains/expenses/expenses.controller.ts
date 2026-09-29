/**
 * Farm lançamentos — the despesas that do not arrive through a sanitary
 * treatment and the receitas that do not come from a venda, with their
 * vencimento, pagamento, conta and lote. A lançamento may repeat: POST with
 * `repeat` creates a parcelamento or a recorrência, and PATCH/DELETE on one
 * of its rows take a `scope` ("one" · "following" · "all").
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";
import { todayISO } from "@/lib/domain/dates";

import { AddExpenseUseCase } from "./useCases/Add.useCase";
import { AddSeriesUseCase } from "./useCases/AddSeries.useCase";
import { DeleteExpenseUseCase } from "./useCases/Delete.useCase";
import { GetExpenseUseCase } from "./useCases/Get.useCase";
import { UpdateExpenseUseCase } from "./useCases/Update.useCase";
import { UpdateSeriesUseCase } from "./useCases/UpdateSeries.useCase";
import { DeleteExpenseQuery, NewExpenseBody, UpdateExpenseBody } from "./schemas/expense.schema";

export const expensesController = new Elysia({ prefix: "/expenses" })
  .use(farmPlugin)
  .post(
    "/",
    async ({ farmId, body, status }) => {
      const { repeat, ...entry } = body;
      // Every created row: one, or the whole série.
      const result = repeat
        ? await new AddSeriesUseCase().run({ farmId, todayIso: todayISO(), ...entry, repeat })
        : await new AddExpenseUseCase().run({ farmId, ...entry });
      if (result === "due_before_date" || result === "invalid_repeat" || result === "starts_too_old") {
        return status(400, { error: result });
      }
      return Array.isArray(result) ? result : [result];
    },
    { farm: true, body: NewExpenseBody }
  )
  .patch(
    "/:id",
    async ({ farmId, params, body, status }) => {
      const { scope = "one", ...patch } = body;
      const result =
        scope === "one"
          ? await new UpdateExpenseUseCase().run({ farmId, id: params.id, patch })
          : await new UpdateSeriesUseCase().run({ farmId, id: params.id, patch, scope });
      if (result === null) return status(404, { error: "not_found" });
      if (result === "due_before_date") return status(400, { error: result });
      // The row as the load shows it: its série's fields and its anexos' count.
      return (await new GetExpenseUseCase().run({ farmId, id: params.id })) ?? result;
    },
    { farm: true, body: UpdateExpenseBody }
  )
  .delete(
    "/:id",
    async ({ farmId, params, query, status }) => {
      const removed = await new DeleteExpenseUseCase().run({
        farmId,
        id: params.id,
        scope: query.scope,
      });
      if (!removed) return status(404, { error: "not_found" });
      return { id: params.id };
    },
    { farm: true, query: DeleteExpenseQuery }
  );
