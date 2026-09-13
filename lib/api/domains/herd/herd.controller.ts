/**
 * The herd read path — the single GET the client hydrates its whole store
 * from, plus a health probe that confirms the session resolved to a farm.
 *
 * A member without Financeiro gets the herd with every BRL value stripped: the
 * payload is the whole farm, so hiding money in the UI alone would still ship
 * it to the browser.
 *
 * Neither route takes a prefix: "/" is the API root.
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";
import { can } from "@/lib/domain/permissions";
import { redactHerdMoney } from "@/lib/domain/moneyRedaction";

import { LoadHerdUseCase } from "./useCases/Load.useCase";

export const herdController = new Elysia()
  .use(farmPlugin)
  .get("/health", ({ farmId }) => ({ ok: true, farmId }), { farm: true })
  .get(
    "/",
    async ({ farmId, permissions }) => {
      const data = await new LoadHerdUseCase().run({ farmId });
      return can(permissions, "finance", "view") ? data : redactHerdMoney(data);
    },
    { farm: true }
  );
