/** Request schemas for the farm's lançamentos (despesas and receitas typed by hand). */

import { t } from "elysia";

import { DateString } from "@/lib/api/schemas/shared.schema";

export const ExpenseCategoryModel = t.Union([
  t.Literal("nutrition"),
  t.Literal("pasture"),
  t.Literal("labor"),
  t.Literal("health"),
  t.Literal("breeding"),
  t.Literal("admin"),
  t.Literal("other"),
]);

export const EntryKindModel = t.Union([t.Literal("expense"), t.Literal("revenue")]);

/** "Só esta" · "Esta e as próximas" · "Todas" (as não pagas). */
export const SeriesScopeModel = t.Union([t.Literal("one"), t.Literal("following"), t.Literal("all")]);

/** How a new lançamento repeats: N parcelas, or the same bill every week or month. */
export const RepeatModel = t.Object({
  mode: t.Union([t.Literal("installments"), t.Literal("recurring")]),
  count: t.Optional(t.Integer({ minimum: 2, maximum: 48 })),
  frequency: t.Union([t.Literal("monthly"), t.Literal("weekly")]),
  dayOfMonth: t.Optional(t.Integer({ minimum: 1, maximum: 31 })),
  startsOn: DateString,
  endsOn: t.Optional(DateString),
});

const Counterparty = t.String({ maxLength: 120 });
const Document = t.String({ maxLength: 120 });

/**
 * Body of POST /expenses. A receita sends `kind: "revenue"` and `category: "other"`.
 * With `repeat` it creates the whole série; `amountBrl` is then the total of a
 * parcelamento or the value of each ocorrência of a recorrência.
 */
export const NewExpenseBody = t.Object({
  date: DateString,
  category: ExpenseCategoryModel,
  amountBrl: t.Number({ exclusiveMinimum: 0 }),
  notes: t.Optional(t.String()),
  kind: t.Optional(EntryKindModel),
  dueDate: t.Optional(DateString),
  paidAt: t.Optional(DateString),
  counterparty: t.Optional(Counterparty),
  document: t.Optional(Document),
  accountId: t.Optional(t.String()),
  lotId: t.Optional(t.String()),
  /** "Pago por"; kept only with `paidAt`. */
  bankAccountId: t.Optional(t.String()),
  repeat: t.Optional(RepeatModel),
});

/**
 * Body of PATCH /expenses/:id. Absent leaves a field as it is; null clears the
 * optional ones (`paidAt: null` makes the lançamento pending again).
 */
export const UpdateExpenseBody = t.Object({
  date: t.Optional(DateString),
  category: t.Optional(ExpenseCategoryModel),
  amountBrl: t.Optional(t.Number({ exclusiveMinimum: 0 })),
  kind: t.Optional(EntryKindModel),
  notes: t.Optional(t.Nullable(t.String())),
  dueDate: t.Optional(t.Nullable(DateString)),
  paidAt: t.Optional(t.Nullable(DateString)),
  counterparty: t.Optional(t.Nullable(Counterparty)),
  document: t.Optional(t.Nullable(Document)),
  accountId: t.Optional(t.Nullable(t.String())),
  lotId: t.Optional(t.Nullable(t.String())),
  /** "Pago por"; cleared whenever the row ends up unpaid. */
  bankAccountId: t.Optional(t.Nullable(t.String())),
  /** For a row of a série; absent = "one". */
  scope: t.Optional(SeriesScopeModel),
});

/** Query of DELETE /expenses/:id; absent scope = "one". */
export const DeleteExpenseQuery = t.Object({ scope: t.Optional(SeriesScopeModel) });
