/**
 * The farm itself — its registration data and saved map view — and the
 * account's farms: the list the switcher shows, a new farm, a deleted one.
 *
 * The singular /farm is the active farm's record and /farm/headquarters its
 * sede; the plural /farms belongs to the account. POST and DELETE /farms run
 * behind the session macro: creating needs no farm yet ("Criar minha fazenda"
 * on /convites), and deleting names its farm in the path, not in x-farm-id.
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";
import { sessionPlugin } from "@/lib/api/plugins/session";

import { BrowseFarmsUseCase } from "./useCases/Browse.useCase";
import { CreateFarmUseCase } from "./useCases/Create.useCase";
import { DeleteFarmUseCase } from "./useCases/Delete.useCase";
import { SaveFarmUseCase } from "./useCases/Save.useCase";
import { SaveHeadquartersUseCase } from "./useCases/SaveHeadquarters.useCase";
import { FarmDataBody, HeadquartersBody, NewFarmBody } from "./schemas/farm.schema";

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
    async ({ user, body, status }) => {
      const result = await new CreateFarmUseCase().run({ userId: user.id, ...body });
      if (result === "not_a_member") return status(403, { error: result });
      if ("invalid" in result) {
        return status(400, { error: "invalid_farm", problem: result.invalid });
      }
      return result;
    },
    { session: true, body: NewFarmBody }
  )
  .delete(
    "/farms/:id",
    async ({ user, params, status }) => {
      const farmId = Number(params.id);
      const result = Number.isInteger(farmId)
        ? await new DeleteFarmUseCase().run({ userId: user.id, farmId, now: new Date() })
        : "farm_not_found";
      if (result === "farm_not_found") return status(404, { error: result });
      if (result === "not_owner") return status(403, { error: result });
      if (result === "last_farm") return status(409, { error: result });
      return { id: farmId };
    },
    { session: true }
  );
