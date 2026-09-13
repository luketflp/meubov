/** Request schemas for the semen bulls a farm buys doses from, and their purchases. */

import { t } from "elysia";

import { DateString, NonBlankString } from "@/lib/api/schemas/shared.schema";

/**
 * Body of POST /semen-bulls/:id/purchases, and the optional first purchase of a
 * new bull. Every purchase also becomes a Reprodução expense of `totalBrl`.
 */
export const SemenPurchaseBody = t.Object({
  date: DateString,
  doses: t.Integer({ minimum: 1 }),
  totalBrl: t.Number({ exclusiveMinimum: 0 }),
  seller: t.Optional(t.String()),
});

/** Body of POST /semen-bulls. Blank optional texts are stored as null. */
export const NewSemenBullBody = t.Object({
  name: NonBlankString,
  code: t.Optional(t.String()),
  breed: t.Optional(t.String()),
  central: t.Optional(t.String()),
  firstPurchase: t.Optional(SemenPurchaseBody),
});

/**
 * Body of PATCH /semen-bulls/:id. Only the fields sent change; a blank code,
 * breed or central clears it.
 */
export const SemenBullPatchBody = t.Partial(
  t.Object({
    name: NonBlankString,
    code: t.String(),
    breed: t.String(),
    central: t.String(),
  })
);
