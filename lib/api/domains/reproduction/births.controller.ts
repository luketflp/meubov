/**
 * Births of the farm as a collection — today only the caderno import.
 *
 * Recording one parto stays on /animals/:id/calvings, under its dam. An import
 * spans many dams, and some of its calves have none, so it lives here.
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";

import { ImportBirthsUseCase } from "./useCases/ImportBirths.useCase";
import { ImportBirthsBody } from "./schemas/reproduction.schema";

export const birthsController = new Elysia({ prefix: "/births" })
  .use(farmPlugin)
  .post(
    "/import",
    async ({ farmId, body, status }) => {
      const result = await new ImportBirthsUseCase().run({ farmId, rows: body.births });
      if (result === "future_date") return status(422, { error: result });
      if (result === "lot_not_found") return status(404, { error: result });
      return result;
    },
    { farm: true, body: ImportBirthsBody }
  );
