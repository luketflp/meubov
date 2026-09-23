/** Request schemas for manejo sessions — the curral working sessions. */

import { t } from "elysia";

import {
  DateString,
  CategoryModel,
  SexModel,
  TreatmentTypeModel,
} from "@/lib/api/schemas/shared.schema";

/**
 * What a manejo session does at the chute. `transfer`, `sale` and `entry` are
 * the compras, vendas e transferências of the farm — there is no separate
 * movement endpoint anymore. `insemination` records an IATF cobertura per cow.
 */
export const ManejoKindModel = t.Union([
  t.Literal("health"),
  t.Literal("weighing"),
  t.Literal("transfer"),
  t.Literal("sale"),
  t.Literal("entry"),
  t.Literal("insemination"),
]);

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
  /** Rendimento de carcaça (%) of a sale priced per arroba. */
  carcassYieldPct: t.Optional(t.Number({ exclusiveMinimum: 0, maximum: 100 })),
  /** Closed price of the batch, or the purchase total of an entry. */
  totalAmountBrl: t.Optional(t.Number({ exclusiveMinimum: 0 })),
  /** Touros of an inseminação, in the order picked; the route requires at least one for that kind. */
  semenBullIds: t.Optional(t.Array(t.String({ minLength: 1 }))),
  notes: t.Optional(t.String()),
});

/**
 * Body of POST /manejo/:id/carcass-yield — the rendimento chosen on the modal
 * shown before a venda per arroba opens its chute.
 */
export const SaleYieldBody = t.Object({
  carcassYieldPct: t.Number({ exclusiveMinimum: 0, maximum: 100 }),
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

/** Body of POST /manejo/:id/animals/:animalId/complete (ManejoPassData). */
export const ManejoPassBody = t.Object({
  weightKg: t.Optional(t.Number({ exclusiveMinimum: 0 })),
  /** Bull whose dose an inseminação pass uses; the session's first touro when absent. */
  semenBullId: t.Optional(t.String({ minLength: 1 })),
  notes: t.Optional(t.String()),
  /** Rendimento (%) of this boiada, set at the brete of a venda per arroba. */
  carcassYieldPct: t.Optional(t.Number({ exclusiveMinimum: 0, maximum: 100 })),
});

/**
 * Body of POST /manejo/:id/animals/:animalId/set-aside — a venda's animal sent
 * to the refugo (stays on the farm) or to the dúvida (decided before closing).
 */
export const SetAsideBody = t.Object({
  list: t.Union([t.Literal("rejected"), t.Literal("held")]),
  weightKg: t.Optional(t.Number({ exclusiveMinimum: 0 })),
  notes: t.Optional(t.String()),
});

/** Body of POST /manejo/:id/animals/:animalId/skip. */
export const ManejoSkipBody = t.Object({
  notes: t.Optional(t.String()),
});
