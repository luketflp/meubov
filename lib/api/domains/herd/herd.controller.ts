/**
 * The herd read path — the single GET the client hydrates its whole store
 * from, plus a health probe that confirms the session resolved to a farm.
 *
 * Neither route takes a prefix: "/" is the API root.
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";

import { LoadHerdUseCase } from "./useCases/Load.useCase";

export const herdController = new Elysia()
  .use(farmPlugin)
  .get("/health", ({ farmId }) => ({ ok: true, farmId }), { farm: true })
  .get("/", ({ farmId }) => new LoadHerdUseCase().run({ farmId }), { farm: true });
