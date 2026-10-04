/**
 * Orçamento por safra: per grupo of the plano de contas (and, optionally, per
 * conta inside it), twelve months each. Budgets never travel in the herd
 * load: the Orçamento page and the Painel ask for one safra at a time.
 *
 * PUT saves one line whole, DELETE removes one line, POST /copy fills the
 * empty lines of a safra from another one. Each write carries the início da
 * safra the client read its safra with: 409 `start_month_changed` when
 * another session moved it, nothing written.
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";
import { todayISO } from "@/lib/domain/dates";

import { CopyBudgetsUseCase } from "./useCases/CopyBudgets.useCase";
import { DeleteBudgetLineUseCase } from "./useCases/DeleteBudgetLine.useCase";
import { ListBudgetsUseCase } from "./useCases/ListBudgets.useCase";
import { PutBudgetLineUseCase } from "./useCases/PutBudgetLine.useCase";
import {
  BudgetLineBody,
  BudgetLineQuery,
  BudgetsQuery,
  CopyBudgetsBody,
} from "./schemas/budget.schema";

export const budgetsController = new Elysia({ prefix: "/budgets" })
  .use(farmPlugin)
  .get("/", ({ farmId, query }) => new ListBudgetsUseCase().run({ farmId, safra: query.safra }), {
    farm: true,
    query: BudgetsQuery,
  })
  .put(
    "/",
    async ({ farmId, user, body, status }) => {
      // The line's twelve rows as saved.
      const result = await new PutBudgetLineUseCase().run({ farmId, userId: user.id, ...body });
      if (result === "start_month_changed") return status(409, { error: result });
      if (typeof result === "string") return status(400, { error: result });
      return result;
    },
    { farm: true, body: BudgetLineBody }
  )
  .delete(
    "/",
    async ({ farmId, query, status }) => {
      const removed = await new DeleteBudgetLineUseCase().run({ farmId, ...query });
      if (removed === "start_month_changed") return status(409, { error: removed });
      return { removed };
    },
    { farm: true, query: BudgetLineQuery }
  )
  .post(
    "/copy",
    async ({ farmId, user, body, status }) => {
      const result = await new CopyBudgetsUseCase().run({ farmId, userId: user.id, todayIso: todayISO(), ...body });
      if (result === "start_month_changed") return status(409, { error: result });
      return result;
    },
    { farm: true, body: CopyBudgetsBody }
  );
