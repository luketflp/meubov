/** Request schemas for the farm's registration data and saved map view. */

import { t } from "elysia";

/** Body of PUT /farm: the registration fields. The sede has its own route. */
export const FarmDataBody = t.Object({
  name: t.String(),
  municipality: t.String(),
  stateRegistration: t.String(),
  manager: t.String(),
});

/**
 * Body of PUT /farm/headquarters: the saved map view, or null to clear it. It
 * is split from PUT /farm because the sede belongs to Lotes e Mapa and the
 * registration fields to Fazenda.
 */
export const HeadquartersBody = t.Object({
  headquarters: t.Union([
    t.Object({
      lat: t.Number({ minimum: -90, maximum: 90 }),
      lng: t.Number({ minimum: -180, maximum: 180 }),
      zoom: t.Optional(t.Integer({ minimum: 0, maximum: 24 })),
    }),
    t.Null(),
  ]),
});
