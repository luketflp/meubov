/**
 * The farm itself — its registration data and saved map view, plus the list of
 * farms the caller may switch between.
 *
 * Both routes keep their original paths: the singular /farm is the active
 * farm's record, the plural /farms is the picker's list.
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";

import { BrowseFarmsUseCase } from "./useCases/Browse.useCase";
import { SaveFarmUseCase } from "./useCases/Save.useCase";
import { FarmDataBody } from "./schemas/farm.schema";

export const farmController = new Elysia()
  .use(farmPlugin)
  .put(
    "/farm",
    ({ farmId, body }) => new SaveFarmUseCase().run({ farmId, data: body }),
    { farm: true, body: FarmDataBody }
  )
  .get(
    "/farms",
    async ({ user, farmId, superuser }) => ({
      farms: await new BrowseFarmsUseCase().run({ userId: user.id, superuser }),
      activeFarmId: farmId,
    }),
    { farm: true }
  );
