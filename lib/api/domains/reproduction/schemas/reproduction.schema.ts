/** Request schemas for the reproduction record of a female. */

import { t } from "elysia";

import {
  DateString,
  NonBlankString,
  SexModel,
} from "@/lib/api/schemas/shared.schema";

export const BreedingTypeModel = t.Union([
  t.Literal("timedAI"),
  t.Literal("naturalMating"),
]);

export const DiagnosisResultModel = t.Union([
  t.Literal("pregnant"),
  t.Literal("open"),
  t.Literal("pending"),
]);

/**
 * Body of POST /animals/:id/breedings. `bullEarTag` is free text on
 * purpose: natural mating points at a herd bull, timed AI at a semen code from
 * outside the farm.
 */
export const NewBreedingBody = t.Object({
  date: DateString,
  type: BreedingTypeModel,
  bullEarTag: t.String({ minLength: 1 }),
});

/**
 * Body of POST /animals/:id/diagnoses. One diagnosis per breeding, so
 * re-examining the same breeding overwrites the previous result.
 */
export const NewDiagnosisBody = t.Object({
  breedingId: t.String({ minLength: 1 }),
  result: DiagnosisResultModel,
  date: DateString,
});

/**
 * Body of POST /animals/:id/calvings. The calf enters the herd in the same
 * transaction; breed and lot fall back to the dam's when omitted.
 */
export const NewCalvingBody = t.Object({
  date: DateString,
  calfEarTag: t.String({ minLength: 1 }),
  calfSex: SexModel,
  calfBreed: t.Optional(t.String({ minLength: 1 })),
  calfLotId: t.Optional(t.String({ minLength: 1 })),
  calfWeightKg: t.Optional(t.Number({ exclusiveMinimum: 0 })),
});

/**
 * One line of POST /births/import, as the preview matched it: the dam by id
 * (absent when the caderno's brinco found no female), the lot by id and the
 * raça by name. `deathNotes` marks a calf that died, with the caderno's text.
 */
export const ImportBirthRow = t.Object({
  calfEarTag: NonBlankString,
  calfSex: SexModel,
  breed: NonBlankString,
  lotId: t.String({ minLength: 1 }),
  date: DateString,
  damId: t.Optional(t.String({ minLength: 1 })),
  weightKg: t.Optional(t.Number({ exclusiveMinimum: 0 })),
  deathNotes: t.Optional(t.String()),
});

/** Body of POST /births/import ("Importar nascimentos"). */
export const ImportBirthsBody = t.Object({
  births: t.Array(ImportBirthRow, { minItems: 1, maxItems: 2000 }),
});
