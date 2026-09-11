/** Request schemas for the farm's registration data and saved map view. */

import { t } from "elysia";

/**
 * Body of PUT /farm (FarmData).
 *
 * `headquarters` is three-valued, like `boundary` in {@link InvernadaPatchBody}:
 * absent keeps the saved map view, an object replaces it, and null clears it.
 * A full replace would let any client that does not know about the sede — the
 * registration-data form, for one — silently erase it.
 */
export const FarmDataBody = t.Object({
  name: t.String(),
  municipality: t.String(),
  stateRegistration: t.String(),
  manager: t.String(),
  headquarters: t.Optional(
    t.Union([
      t.Object({
        lat: t.Number({ minimum: -90, maximum: 90 }),
        lng: t.Number({ minimum: -180, maximum: 180 }),
        zoom: t.Optional(t.Integer({ minimum: 0, maximum: 24 })),
      }),
      t.Null(),
    ])
  ),
});
