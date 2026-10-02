/** Request schemas for the plano de contas: farm-named contas inside the fixed grupos. */

import { t } from "elysia";

import { DateString } from "@/lib/api/schemas/shared.schema";
import { ExpenseCategoryModel } from "@/lib/api/domains/expenses/schemas/expense.schema";

/** The seven despesa grupos, "revenue" (Receitas) and the three fora do resultado. */
export const AccountGroupModel = t.Union([
  ExpenseCategoryModel,
  t.Literal("revenue"),
  t.Literal("investment"),
  t.Literal("financing"),
  t.Literal("partners"),
]);

const AccountName = t.String({ minLength: 1, maxLength: 60, pattern: "\\S" });

/** Saldo devedor of a financiamento at the end of its `openingDate`. */
const OpeningBalance = t.Number({ minimum: 0 });

/** Body of POST /accounts. A conta de financiamento may send its saldo inicial with its date. */
export const NewAccountBody = t.Object({
  group: AccountGroupModel,
  name: AccountName,
  openingBalanceBrl: t.Optional(OpeningBalance),
  openingDate: t.Optional(DateString),
});

/**
 * Body of PATCH /accounts/:id. `archived` true archives, false restores. The
 * saldo inicial and its date go together; null clears them.
 */
export const UpdateAccountBody = t.Object({
  name: t.Optional(AccountName),
  archived: t.Optional(t.Boolean()),
  openingBalanceBrl: t.Optional(t.Nullable(OpeningBalance)),
  openingDate: t.Optional(t.Nullable(DateString)),
});
