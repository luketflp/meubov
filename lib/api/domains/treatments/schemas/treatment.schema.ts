/** Request schemas for the sanitary calendar. */

import { t } from "elysia";

import {
  DateString,
  NonBlankString,
  TreatmentTypeModel,
} from "@/lib/api/schemas/shared.schema";

/** Body of POST /treatments/complete. */
export const CompleteTreatmentsBody = t.Object({
  ids: t.Array(t.String(), { minItems: 1 }),
});

/** Query of DELETE /treatments/:id: how far the delete reaches. */
export const DeleteTreatmentQuery = t.Object({
  scope: t.Optional(t.Union([t.Literal("one"), t.Literal("batch")])),
});

/** Body of POST /treatments/schedule. */
export const ScheduleTreatmentsBody = t.Object({
  date: DateString,
  animalIds: t.Array(t.String({ minLength: 1 }), { minItems: 1 }),
  source: t.Union([
    t.Object({
      kind: t.Literal("protocol"),
      protocolId: t.String({ minLength: 1 }),
    }),
    t.Object({
      kind: t.Literal("standalone"),
      name: NonBlankString,
      type: TreatmentTypeModel,
      withdrawalDays: t.Integer({ minimum: 0 }),
    }),
  ]),
});
