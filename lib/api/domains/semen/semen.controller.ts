/**
 * Semen bulls — the bulls a farm buys semen from, and each purchase of doses.
 *
 * Stock is not a column: it derives from the purchases and the coberturas that
 * used a dose, so there is no route to set it. A purchase is stock, not money
 * in the Financeiro: every route here asks Reprodução edit in the route table
 * and nothing more. A member who does not see Financeiro still gets the bull
 * and the purchase back without their totals.
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";
import { redactSemenBull } from "@/lib/domain/moneyRedaction";
import { can } from "@/lib/domain/permissions";

import { AddBullUseCase } from "./useCases/AddBull.useCase";
import { AddPurchaseUseCase } from "./useCases/AddPurchase.useCase";
import { DeleteBullUseCase } from "./useCases/DeleteBull.useCase";
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
      const result = await new AddBullUseCase().run({ farmId, input: body });
      if (result === "duplicate_name") return status(409, { error: result });
      return can(permissions, "finance", "view")
        ? result
        : { bull: redactSemenBull(result.bull) };
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
  .delete(
    "/:id",
    async ({ farmId, params, status }) => {
      const result = await new DeleteBullUseCase().run({ farmId, id: params.id });
      if (result === "not_found") return status(404, { error: result });
      if (result === "doses_used" || result === "open_insemination") {
        return status(409, { error: result });
      }
      return result;
    },
    { farm: true }
  )
  .post(
    "/:id/purchases",
    async ({ farmId, permissions, params, body, status }) => {
      const result = await new AddPurchaseUseCase().run({
        farmId,
        bullId: params.id,
        input: body,
      });
      if (result === "not_found") return status(404, { error: result });
      if (can(permissions, "finance", "view")) return result;
      // The member typed the total, but it stays out of their store as on load.
      const purchase = { ...result.purchase };
      delete purchase.totalBrl;
      return { purchase };
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
