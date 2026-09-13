/**
 * The farm itself — its registration data and saved map view, the list of
 * farms the caller may switch between, and a first farm of one's own.
 *
 * The singular /farm is the active farm's record and /farm/headquarters its
 * sede; the plural /farms is the picker's list, and POST /farms runs before the
 * caller belongs to any farm ("Criar minha fazenda" on /convites).
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";
import { sessionPlugin } from "@/lib/api/plugins/session";

import { BrowseFarmsUseCase } from "./useCases/Browse.useCase";
import { EnsureFarmForUserUseCase } from "./useCases/EnsureForUser.useCase";
import { SaveFarmUseCase } from "./useCases/Save.useCase";
import { SaveHeadquartersUseCase } from "./useCases/SaveHeadquarters.useCase";
import { FarmDataBody, HeadquartersBody } from "./schemas/farm.schema";

export const farmController = new Elysia()
  .use(farmPlugin)
  .use(sessionPlugin)
  .put(
    "/farm",
    ({ farmId, body }) => new SaveFarmUseCase().run({ farmId, data: body }),
    { farm: true, body: FarmDataBody }
  )
  .put(
    "/farm/headquarters",
    ({ farmId, body }) =>
      new SaveHeadquartersUseCase().run({ farmId, headquarters: body.headquarters }),
    { farm: true, body: HeadquartersBody }
  )
  .get(
    "/farms",
    async ({ user, farmId, superuser }) => ({
      farms: await new BrowseFarmsUseCase().run({ userId: user.id, superuser }),
      activeFarmId: farmId,
    }),
    { farm: true }
  )
  .post(
    "/farms",
    async ({ user }) => ({
      farmId: await new EnsureFarmForUserUseCase().run({ userId: user.id }),
    }),
    { session: true }
  );
