/** Request schemas of the orçamento: one line (a grupo's own, or a conta's) of one safra. */

import { t } from "elysia";

import { ExpenseCategoryModel } from "@/lib/api/domains/expenses/schemas/expense.schema";

/** Calendar year the safra starts in. */
const Safra = t.Integer({ minimum: 2000, maximum: 2100 });
const AccountId = t.String({ minLength: 1 });
/**
 * The início da safra the client read the safra with: another session may
 * have moved the farm's since, and then the use case answers 409
 * `start_month_changed` rather than write other months.
 */
const StartMonth = t.Integer({ minimum: 1, maximum: 12 });

/** Query of GET /budgets. */
export const BudgetsQuery = t.Object({ safra: Safra });

/** Query of DELETE /budgets: the line; absent `accountId` = the grupo's own. */
export const BudgetLineQuery = t.Object({
  safra: Safra,
  startMonth: StartMonth,
  category: ExpenseCategoryModel,
  accountId: t.Optional(AccountId),
});

/**
 * Body of PUT /budgets: the line's months by safra month, the first month of
 * the safra first. The count is not pinned here: anything but twelve is the
 * use case's 400 `months_mismatch`.
 */
export const BudgetLineBody = t.Object({
  safra: Safra,
  startMonth: StartMonth,
  category: ExpenseCategoryModel,
  accountId: t.Optional(AccountId),
  months: t.Array(t.Number({ minimum: 0 })),
  distribution: t.Union([t.Literal("equal"), t.Literal("previous"), t.Literal("manual")]),
});

/** Body of POST /budgets/copy ("Copiar"): from one safra's orçado or realizado into another. */
export const CopyBudgetsBody = t.Object({
  from: Safra,
  to: Safra,
  startMonth: StartMonth,
  source: t.Union([t.Literal("budgeted"), t.Literal("realized")]),
  adjustPct: t.Number({ minimum: -50, maximum: 100 }),
});
