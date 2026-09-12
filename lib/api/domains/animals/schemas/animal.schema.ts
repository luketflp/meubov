/** Request schemas for animals and their weighings. */

import { t } from "elysia";

import {
  DateString,
  NonBlankString,
  CategoryModel,
  SexModel,
} from "@/lib/api/schemas/shared.schema";

/** Body of POST /animals (NewAnimal in the store). */
export const NewAnimalBody = t.Object({
  earTag: t.String({ minLength: 1 }),
  category: CategoryModel,
  customCategoryId: t.Optional(t.String()),
  breed: t.String({ minLength: 1 }),
  sex: SexModel,
  birthDate: DateString,
  lotId: t.String({ minLength: 1 }),
  initialWeightKg: t.Optional(t.Number({ exclusiveMinimum: 0 })),
});

/** Body of POST /animals/batch ("Cadastrar vários animais"). */
export const NewAnimalsBody = t.Object({
  animals: t.Array(NewAnimalBody, { minItems: 1, maxItems: 500 }),
});

/**
 * One row of POST /animals/import. Mirrors NewAnimalBody but carries the lot
 * as a NAME (`lot`) instead of a lot id. `invernada` is the fixed code where
 * that logical group currently lives; the server never invents physical areas.
 */
export const ImportAnimalRow = t.Object({
  earTag: NonBlankString,
  category: CategoryModel,
  customCategoryId: t.Optional(t.String()),
  breed: NonBlankString,
  sex: SexModel,
  birthDate: DateString,
  lot: NonBlankString,
  invernada: NonBlankString,
  weightKg: t.Optional(t.Number({ exclusiveMinimum: 0 })),
});

/** Body of POST /animals/import (bulk herd import). */
export const ImportAnimalsBody = t.Object({
  animals: t.Array(ImportAnimalRow, { minItems: 1, maxItems: 2000 }),
});

/** Body of POST /animals/:id/weighings. */
export const WeighingBody = t.Object({
  date: DateString,
  weightKg: t.Number({ exclusiveMinimum: 0 }),
});

/** Body of DELETE /weighings: the day and whose readings of it fall. */
export const DeleteWeighingsBody = t.Object({
  date: DateString,
  earTags: t.Array(t.String({ minLength: 1 }), { minItems: 1 }),
});

/** Body of PATCH /animals/:id (all fields optional). */
export const AnimalPatchBody = t.Object({
  /** New ear tag; must stay unique within the farm (409 on conflict). */
  earTag: t.Optional(t.String({ minLength: 1 })),
  category: t.Optional(CategoryModel),
  customCategoryId: t.Optional(t.Union([t.String(), t.Null()])),
  breed: t.Optional(t.String({ minLength: 1 })),
  birthDate: t.Optional(DateString),
  lotId: t.Optional(t.String({ minLength: 1 })),
});

/**
 * Body of POST /animals/:id/deactivate — the baixa of an animal: why it
 * left, when, and what happened. A sale never comes through here; it is a
 * manejo de venda, which also carries the price.
 */
export const DeactivateAnimalBody = t.Object({
  reason: t.Union([t.Literal("death"), t.Literal("loss"), t.Literal("other")]),
  /** The day the animal left the herd; the route rejects a future date (422). */
  date: DateString,
  /** What happened, in the farmer's words. */
  notes: t.Optional(t.String()),
});
