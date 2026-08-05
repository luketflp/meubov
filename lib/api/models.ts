/**
 * TypeBox request models for the herd API.
 *
 * Mirrors the domain contracts in `lib/types.ts` (and the store input types in
 * `lib/store/useHerdStore.ts`). Dates always travel as ISO "YYYY-MM-DD"
 * strings, matching the Postgres `date` columns.
 */
import { t } from "elysia";

/** ISO calendar date "YYYY-MM-DD". */
export const DateString = t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });

export const CategoryModel = t.Union([
  t.Literal("calf"),
  t.Literal("heifer"),
  t.Literal("steer"),
  t.Literal("cow"),
  t.Literal("bull"),
]);

export const SexModel = t.Union([t.Literal("male"), t.Literal("female")]);

export const TreatmentTypeModel = t.Union([
  t.Literal("vaccine"),
  t.Literal("deworming"),
  t.Literal("medication"),
  t.Literal("exam"),
]);

/**
 * What a manejo session does at the chute. `transfer`, `sale` and `entry` are
 * the compras, vendas e transferências of the farm — there is no separate
 * movement endpoint anymore.
 */
export const ManejoKindModel = t.Union([
  t.Literal("health"),
  t.Literal("weighing"),
  t.Literal("transfer"),
  t.Literal("sale"),
  t.Literal("entry"),
]);

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

/**
 * One row of POST /animals/import. Mirrors NewAnimalBody but carries the lot
 * as a NAME (`lot`) instead of a lot id: the server resolves it to a lot,
 * creating the lot (and any missing breed) on the fly.
 */
export const ImportAnimalRow = t.Object({
  earTag: t.String({ minLength: 1 }),
  category: CategoryModel,
  customCategoryId: t.Optional(t.String()),
  breed: t.String({ minLength: 1 }),
  sex: SexModel,
  birthDate: DateString,
  lot: t.String({ minLength: 1 }),
  weightKg: t.Optional(t.Number({ exclusiveMinimum: 0 })),
});

/** Body of POST /animals/import (bulk herd import). */
export const ImportAnimalsBody = t.Object({
  animals: t.Array(ImportAnimalRow, { minItems: 1, maxItems: 2000 }),
});

/** Body of POST /animals/:earTag/weighings. */
export const WeighingBody = t.Object({
  date: DateString,
  weightKg: t.Number({ exclusiveMinimum: 0 }),
});

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
 * Body of POST /animals/:earTag/breedings. `bullEarTag` is free text on
 * purpose: natural mating points at a herd bull, timed AI at a semen code from
 * outside the farm.
 */
export const NewBreedingBody = t.Object({
  date: DateString,
  type: BreedingTypeModel,
  bullEarTag: t.String({ minLength: 1 }),
});

/**
 * Body of POST /animals/:earTag/diagnoses. One diagnosis per breeding, so
 * re-examining the same breeding overwrites the previous result.
 */
export const NewDiagnosisBody = t.Object({
  breedingId: t.String({ minLength: 1 }),
  result: DiagnosisResultModel,
  date: DateString,
});

/**
 * Body of POST /animals/:earTag/calvings. The calf enters the herd in the same
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

/** Body of POST /treatments/complete. */
export const CompleteTreatmentsBody = t.Object({
  ids: t.Array(t.String(), { minItems: 1 }),
});

/** Body of POST /breeds. */
export const BreedBody = t.Object({ name: t.String({ minLength: 1 }) });

/**
 * Ceiling on the vertices of one pasture outline. A hand-drawn lot is a
 * couple of dozen points; anything near this came from an import and must be
 * simplified before it bloats the jsonb column and the request payload.
 */
export const MAX_BOUNDARY_VERTICES = 2000;

/**
 * Pasture outline: open ring of [lng, lat] pairs (GeoJSON axis order, first
 * point not repeated), matching `Lot.boundary` and the `lots.boundary` column.
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

/** Body of POST /lots (Lot without the server-generated id). */
export const NewLotBody = t.Object({
  name: t.String({ minLength: 1 }),
  grass: t.String({ minLength: 1 }),
  hectares: t.Number({ exclusiveMinimum: 0 }),
  boundary: t.Optional(BoundaryModel),
});

/**
 * Body of PATCH /lots/:id (all fields optional). `boundary` is three-valued on
 * purpose: absent leaves the outline untouched, `null` erases it, a ring
 * replaces it.
 */
export const LotPatchBody = t.Object({
  name: t.Optional(t.String({ minLength: 1 })),
  grass: t.Optional(t.String({ minLength: 1 })),
  hectares: t.Optional(t.Number({ exclusiveMinimum: 0 })),
  boundary: t.Optional(t.Union([BoundaryModel, t.Null()])),
});

/** Body of PUT /farm (FarmData). */
export const FarmDataBody = t.Object({
  name: t.String(),
  municipality: t.String(),
  stateRegistration: t.String(),
  manager: t.String(),
  headquarters: t.Optional(t.Object({ lat: t.Number(), lng: t.Number() })),
});

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

export const ExpenseCategoryModel = t.Union([
  t.Literal("nutrition"),
  t.Literal("pasture"),
  t.Literal("labor"),
  t.Literal("health"),
  t.Literal("breeding"),
  t.Literal("admin"),
  t.Literal("other"),
]);

/** Body of POST /expenses. */
export const NewExpenseBody = t.Object({
  date: DateString,
  category: ExpenseCategoryModel,
  amountBrl: t.Number({ exclusiveMinimum: 0 }),
  notes: t.Optional(t.String()),
});

/** Body of POST /categories (custom herd category). */
export const NewCustomCategoryBody = t.Object({
  name: t.String({ minLength: 1 }),
  baseCategory: CategoryModel,
});

/** Body of PATCH /animals/:earTag (all fields optional). */
export const AnimalPatchBody = t.Object({
  category: t.Optional(CategoryModel),
  customCategoryId: t.Optional(t.Union([t.String(), t.Null()])),
  breed: t.Optional(t.String({ minLength: 1 })),
  birthDate: t.Optional(DateString),
  lotId: t.Optional(t.String({ minLength: 1 })),
});

/**
 * Body of POST /animals/:earTag/deactivate — the baixa of an animal: why it
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

/** Sanitary plan applied per animal in a manejo session. */
export const ManejoPlanBody = t.Object({
  type: TreatmentTypeModel,
  name: t.String({ minLength: 1 }),
  withdrawalDays: t.Integer({ minimum: 0 }),
  dose: t.Optional(t.String()),
  responsible: t.Optional(t.String()),
  costBrl: t.Optional(t.Number({ minimum: 0 })),
  notes: t.Optional(t.String()),
  nextDate: t.Optional(DateString),
});

/**
 * Body of POST /manejo (NewManejoSession in the store). An entry session opens
 * empty — its animals do not exist yet and are registered one by one as they
 * arrive at the chute — so `earTags` may be empty; the route rejects the other
 * kinds without animals (422).
 */
export const NewManejoSessionBody = t.Object({
  date: DateString,
  kind: ManejoKindModel,
  earTags: t.Array(t.String()),
  weighing: t.Boolean(),
  treatment: t.Optional(ManejoPlanBody),
  /** Destination lot of a transfer/entry session. */
  destinationLotId: t.Optional(t.String({ minLength: 1 })),
  /** Buyer (sale) or seller (entry). */
  counterparty: t.Optional(t.String()),
  /** R$/@ of a sale priced by weight. */
  pricePerArroba: t.Optional(t.Number({ exclusiveMinimum: 0 })),
  /** Closed price of the batch, or the purchase total of an entry. */
  totalAmountBrl: t.Optional(t.Number({ exclusiveMinimum: 0 })),
  notes: t.Optional(t.String()),
});

/**
 * Body of POST /manejo/:id/animals — one animal arriving in an entry session.
 * It joins the herd in the destination lot of the session, already handled.
 */
export const EntryAnimalBody = t.Object({
  earTag: t.String({ minLength: 1 }),
  category: CategoryModel,
  customCategoryId: t.Optional(t.String()),
  breed: t.String({ minLength: 1 }),
  sex: SexModel,
  birthDate: DateString,
  weightKg: t.Optional(t.Number({ exclusiveMinimum: 0 })),
  notes: t.Optional(t.String()),
});

/** Body of POST /manejo/:id/animals/:earTag/complete (ManejoPassData). */
export const ManejoPassBody = t.Object({
  weightKg: t.Optional(t.Number({ exclusiveMinimum: 0 })),
  notes: t.Optional(t.String()),
});

/** Body of POST /manejo/:id/animals/:earTag/skip. */
export const ManejoSkipBody = t.Object({
  notes: t.Optional(t.String()),
});
