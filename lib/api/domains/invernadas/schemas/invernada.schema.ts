/** Request schemas for physical invernadas (pastures) and their outlines. */

import { t } from "elysia";

import {
  NonBlankString,
} from "@/lib/api/schemas/shared.schema";

/**
 * Ceiling on the vertices of one pasture outline. A hand-drawn invernada is a
 * couple of dozen points; anything near this came from an import and must be
 * simplified before it bloats the jsonb column and the request payload.
 */
const MAX_BOUNDARY_VERTICES = 2000;

/**
 * Pasture outline: open ring of [lng, lat] pairs (GeoJSON axis order, first
 * point not repeated), matching `Invernada.boundary` and the
 * `invernadas.boundary` column.
 * Three vertices is the minimum that encloses an area. What JSON Schema cannot
 * express — self-intersection, zero area, swapped axes — is not checked here.
 */
export const BoundaryModel = t.Array(
  t.Tuple([
    t.Number({ minimum: -180, maximum: 180 }),
    t.Number({ minimum: -90, maximum: 90 }),
  ]),
  { minItems: 3, maxItems: MAX_BOUNDARY_VERTICES }
);

/** Body shared by POST /invernadas and its domain contract minus id. */
export const NewInvernadaBody = t.Object({
  code: NonBlankString,
  name: t.Optional(NonBlankString),
  grass: NonBlankString,
  hectares: t.Number({ exclusiveMinimum: 0 }),
  boundary: t.Optional(BoundaryModel),
});

/**
 * Body of PATCH /invernadas/:id. `name` and `boundary` are three-valued:
 * absent leaves the value untouched and null clears it.
 */
export const InvernadaPatchBody = t.Object({
  /** Accepted only while the stored code has the migration-only LEGACY- prefix. */
  code: t.Optional(NonBlankString),
  name: t.Optional(t.Union([NonBlankString, t.Null()])),
  grass: t.Optional(NonBlankString),
  hectares: t.Optional(t.Number({ exclusiveMinimum: 0 })),
  boundary: t.Optional(t.Union([BoundaryModel, t.Null()])),
});
