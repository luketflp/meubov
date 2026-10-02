/**
 * Plano de contas: farm-named contas inside the fixed grupos — Receitas, the
 * seven despesa grupos, and the three fora do resultado (investimentos,
 * financiamentos, sócios).
 *
 * A conta is archived, never deleted, so its lançamentos keep it. A conta de
 * financiamento may carry its saldo devedor inicial.
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";

import { AddAccountUseCase } from "./useCases/Add.useCase";
import { SeedDefaultAccountsUseCase } from "./useCases/SeedDefaults.useCase";
import { UpdateAccountUseCase } from "./useCases/Update.useCase";
import { NewAccountBody, UpdateAccountBody } from "./schemas/account.schema";

export const accountsController = new Elysia({ prefix: "/accounts" })
  .use(farmPlugin)
  .post(
    "/",
    async ({ farmId, body, status }) => {
      const result = await new AddAccountUseCase().run({ farmId, ...body });
      if (result === "duplicate") return status(409, { error: "duplicate_name" });
      if (result === "invalid_opening") return status(400, { error: result });
      return result;
    },
    { farm: true, body: NewAccountBody }
  )
  .patch(
    "/:id",
    async ({ farmId, params, body, status }) => {
      const result = await new UpdateAccountUseCase().run({
        farmId,
        id: params.id,
        patch: body,
      });
      if (result === null) return status(404, { error: "not_found" });
      if (result === "duplicate") return status(409, { error: "duplicate_name" });
      if (result === "invalid_opening") return status(400, { error: result });
      return result;
    },
    { farm: true, body: UpdateAccountBody }
  )
  .post("/defaults", ({ farmId }) => new SeedDefaultAccountsUseCase().run({ farmId }), {
    farm: true,
  });
