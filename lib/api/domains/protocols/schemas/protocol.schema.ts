/** Request schemas for the farm's health protocols. */

import { t } from "elysia";

import {
  TreatmentTypeModel,
} from "@/lib/api/schemas/shared.schema";

/** Body of POST /protocols. */
export const NewProtocolBody = t.Object({
  protocol: t.Object({
    name: t.String({ minLength: 1 }),
    type: TreatmentTypeModel,
    intervalMonths: t.Integer({ minimum: 1 }),
    withdrawalDays: t.Integer({ minimum: 0 }),
    mandatory: t.Boolean(),
  }),
  generateSchedule: t.Boolean(),
});
