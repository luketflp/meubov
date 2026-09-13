/**
 * Semen bulls — the bulls a farm buys semen from, and each purchase of doses.
 *
 * Stock is not a column: it derives from the purchases and the coberturas that
 * used a dose, so there is no route to set it. Every purchase also writes a
 * Reprodução expense, returned alongside so the client can merge Financeiro.
 * That makes a purchase money: the purchase routes ask Financeiro edit in the
 * route table, a new bull asks it here when it brings its first purchase, and
 * a member who does not see Financeiro gets the bull back without the totals.
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";
import { redactSemenBull } from "@/lib/domain/moneyRedaction";
import { can } from "@/lib/domain/permissions";

import { AddBullUseCase } from "./useCases/AddBull.useCase";
import { AddPurchaseUseCase } from "./useCases/AddPurchase.useCase";
import { DeletePurchaseUseCase } from "./useCases/DeletePurchase.useCase";
import { UpdateBullUseCase } from "./useCases/UpdateBull.useCase";
import {
  NewSemenBullBody,
  SemenBullPatchBody,
  SemenPurchaseBody,
} from "./schemas/semen.schema";

export const semenController = new Elysia({ prefix: "/semen-bulls" })
  .use(farmPlugin)
  .post(
    "/",
    async ({ farmId, permissions, body, status }) => {
      // The first purchase writes an expense, as a purchase of its own would.
      if (body.firstPurchase !== undefined && !can(permissions, "finance", "edit")) {
        return status(403, { error: "forbidden", area: "finance" });
      }
      const result = await new AddBullUseCase().run({ farmId, input: body });
      if (result === "duplicate_name") return status(409, { error: result });
      return can(permissions, "finance", "view")
        ? result
        : { ...result, bull: redactSemenBull(result.bull) };
    },
    { farm: true, body: NewSemenBullBody }
  )
  .patch(
    "/:id",
    async ({ farmId, permissions, params, body, status }) => {
      const result = await new UpdateBullUseCase().run({
        farmId,
        id: params.id,
        patch: body,
      });
      if (result === "not_found") return status(404, { error: result });
      if (result === "duplicate_name") return status(409, { error: result });
      return can(permissions, "finance", "view") ? result : redactSemenBull(result);
    },
    { farm: true, body: SemenBullPatchBody }
  )
  .post(
    "/:id/purchases",
    async ({ farmId, params, body, status }) => {
      const result = await new AddPurchaseUseCase().run({
        farmId,
        bullId: params.id,
        input: body,
      });
      if (result === "not_found") return status(404, { error: result });
      return result;
    },
    { farm: true, body: SemenPurchaseBody }
  )
  .delete(
    "/:id/purchases/:purchaseId",
    async ({ farmId, params, status }) => {
      const result = await new DeletePurchaseUseCase().run({
        farmId,
        bullId: params.id,
        purchaseId: params.purchaseId,
      });
      if (result === "not_found") return status(404, { error: result });
      if (result === "stock_negative") return status(409, { error: result });
      return result;
    },
    { farm: true }
  );
