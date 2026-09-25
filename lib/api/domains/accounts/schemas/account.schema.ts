/** Request schemas for the plano de contas: farm-named contas inside the fixed grupos. */

import { t } from "elysia";

import { ExpenseCategoryModel } from "@/lib/api/domains/expenses/schemas/expense.schema";

/** The seven despesa grupos plus "revenue" (Receitas). */
export const AccountGroupModel = t.Union([ExpenseCategoryModel, t.Literal("revenue")]);

const AccountName = t.String({ minLength: 1, maxLength: 60, pattern: "\\S" });

/** Body of POST /accounts. */
export const NewAccountBody = t.Object({
  group: AccountGroupModel,
  name: AccountName,
});

/** Body of PATCH /accounts/:id. `archived` true archives, false restores. */
export const UpdateAccountBody = t.Object({
  name: t.Optional(AccountName),
  archived: t.Optional(t.Boolean()),
});
