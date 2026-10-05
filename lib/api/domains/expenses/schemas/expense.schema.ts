/** Request schemas for the farm's lançamentos (every kind typed by hand). */

import { t } from "elysia";

import { DateString } from "@/lib/api/schemas/shared.schema";

/** A built-in grupo key or a farm grupo id; the use cases check it belongs to the farm. */
export const ExpenseCategoryModel = t.String({ minLength: 1, maxLength: 64 });

/** Despesa, receita, the three kinds fora do resultado, and rendimento. */
export const EntryKindModel = t.Union([
  t.Literal("expense"),
  t.Literal("revenue"),
  t.Literal("investment"),
  t.Literal("financing"),
  t.Literal("partners"),
  t.Literal("yield"),
]);

/** Movimento of an investimento, financiamento or sócios lançamento: entrada or saída. */
export const EntryFlowModel = t.Union([t.Literal("in"), t.Literal("out")]);

/** "Só esta" · "Esta e as próximas" · "Todas" (as não pagas). */
export const SeriesScopeModel = t.Union([t.Literal("one"), t.Literal("following"), t.Literal("all")]);

const Frequency = t.Union([t.Literal("monthly"), t.Literal("weekly")]);
const InstallmentCount = t.Integer({ minimum: 2, maximum: 48 });

/** How a new lançamento repeats: N parcelas, or the same bill every week or month. */
export const RepeatModel = t.Object({
  mode: t.Union([t.Literal("installments"), t.Literal("recurring")]),
  count: t.Optional(InstallmentCount),
  frequency: Frequency,
  dayOfMonth: t.Optional(t.Integer({ minimum: 1, maximum: 31 })),
  startsOn: DateString,
  endsOn: t.Optional(DateString),
});

const Counterparty = t.String({ maxLength: 120 });
const Document = t.String({ maxLength: 120 });

/**
 * Body of POST /expenses.
 *
 * A receita and the kinds fora do resultado send `category: "other"`.
 * investment, financing and partners send a conta of their group and `flow`
 * (absent is a saída). A yield sends its aplicação as `bankAccountId` and no
 * `repeat`.
 *
 * With `repeat` it creates the whole série; `amountBrl` is then the total of
 * a parcelamento or the value of each ocorrência of a recorrência.
 */
export const NewExpenseBody = t.Object({
  date: DateString,
  category: ExpenseCategoryModel,
  amountBrl: t.Number({ exclusiveMinimum: 0 }),
  notes: t.Optional(t.String()),
  kind: t.Optional(EntryKindModel),
  flow: t.Optional(EntryFlowModel),
  dueDate: t.Optional(DateString),
  paidAt: t.Optional(DateString),
  counterparty: t.Optional(Counterparty),
  document: t.Optional(Document),
  accountId: t.Optional(t.String()),
  lotId: t.Optional(t.String()),
  /** "Pago por"; kept only with `paidAt` (a yield is paid on its `date`). */
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
  flow: t.Optional(EntryFlowModel),
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

/** Body of POST /expenses/:id/split ("Parcelar"): the lançamento's value is the total, split as a new parcelamento. */
export const SplitExpenseBody = t.Object({
  count: InstallmentCount,
  frequency: Frequency,
  /** Vencimento of the first parcela. */
  startsOn: DateString,
});

/** Query of DELETE /expenses/:id; absent scope = "one". */
export const DeleteExpenseQuery = t.Object({ scope: t.Optional(SeriesScopeModel) });
