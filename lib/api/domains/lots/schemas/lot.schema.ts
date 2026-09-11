/** Request schemas for logical lots and their placements. */

import { t } from "elysia";

import {
  DateString,
  NonBlankString,
} from "@/lib/api/schemas/shared.schema";

/** Body of POST /lots. The initial placement starts today. */
export const NewLotBody = t.Object({
  name: NonBlankString,
  invernadaId: NonBlankString,
});

/** Body of PATCH /lots/:id (logical-group registration only). */
export const LotPatchBody = t.Object({
  name: t.Optional(NonBlankString),
  needsReview: t.Optional(t.Boolean()),
});

/** Body of POST /lots/:id/placements (moves the whole lot atomically). */
export const MoveLotBody = t.Object({
  invernadaId: t.String({ minLength: 1 }),
  startedOn: DateString,
  notes: t.Optional(t.String()),
});

/** Body of POST /lots/:id/archive (closes the current placement). */
export const ArchiveLotBody = t.Object({
  endedOn: DateString,
});
