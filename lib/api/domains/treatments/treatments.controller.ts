/**
 * The sanitary calendar — scheduling treatments onto animals, marking them
 * done, and undoing a scheduling mistake.
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";

import { CompleteTreatmentsUseCase } from "./useCases/Complete.useCase";
import { DeleteTreatmentsUseCase } from "./useCases/Delete.useCase";
import { ScheduleTreatmentsUseCase } from "./useCases/Schedule.useCase";
import {
  CompleteTreatmentsBody,
  DeleteTreatmentQuery,
  ScheduleTreatmentsBody,
} from "./schemas/treatment.schema";

export const treatmentsController = new Elysia({ prefix: "/treatments" })
  .use(farmPlugin)
  .post(
    "/schedule",
    async ({ farmId, body, status }) => {
      const result = await new ScheduleTreatmentsUseCase().run({ farmId, input: body });
      if (result === "animals_not_found") return status(404, { error: result });
      return result;
    },
    { farm: true, body: ScheduleTreatmentsBody }
  )
  .post(
    "/complete",
    async ({ farmId, body }) => ({
      ids: await new CompleteTreatmentsUseCase().run({ farmId, ids: body.ids }),
    }),
    { farm: true, body: CompleteTreatmentsBody }
  )
  .delete(
    "/:id",
    async ({ farmId, params, query, status }) => {
      const result = await new DeleteTreatmentsUseCase().run({
        farmId,
        id: params.id,
        scope: query.scope ?? "batch",
      });
      if (result === "treatment_not_found") return status(404, { error: result });
      return result;
    },
    { farm: true, query: DeleteTreatmentQuery }
  );
