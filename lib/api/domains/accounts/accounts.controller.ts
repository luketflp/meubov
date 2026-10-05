/**
 * Plano de contas: farm-named contas inside the fixed grupos — Receitas, the
 * seven despesa grupos, and the three fora do resultado (investimentos,
 * financiamentos, sócios).
 *
 * A conta with lançamentos is archived, so they keep it; only an unused one is
 * deleted. A conta de financiamento may carry its saldo devedor inicial.
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";

import { AddAccountUseCase } from "./useCases/Add.useCase";
import { DeleteAccountUseCase } from "./useCases/Delete.useCase";
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
  .delete(
    "/:id",
    async ({ farmId, params, status }) => {
      const result = await new DeleteAccountUseCase().run({ farmId, id: params.id });
      if (result === "not_found") return status(404, { error: result });
      if (result === "in_use") return status(409, { error: result });
      return { id: params.id };
    },
    { farm: true }
  )
  .post("/defaults", ({ farmId }) => new SeedDefaultAccountsUseCase().run({ farmId }), {
    farm: true,
  });
