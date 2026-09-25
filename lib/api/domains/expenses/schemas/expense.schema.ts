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

const Counterparty = t.String({ maxLength: 120 });
const Document = t.String({ maxLength: 120 });

/** Body of POST /expenses. A receita sends `kind: "revenue"` and `category: "other"`. */
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
});
