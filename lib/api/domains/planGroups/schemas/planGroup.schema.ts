/** Request schemas for the grupos of the plano de contas. */

import { t } from "elysia";

import { GROUP_NAME_MAX } from "@/lib/domain/groups";

const GroupName = t.String({ minLength: 1, maxLength: GROUP_NAME_MAX, pattern: "\\S" });

/** Tipo of a grupo: every kind of lançamento but a rendimento, which has no grupo. */
export const GroupKindModel = t.Union([
  t.Literal("revenue"),
  t.Literal("expense"),
  t.Literal("investment"),
  t.Literal("financing"),
  t.Literal("partners"),
]);

/** Body of POST /plan-groups. */
export const NewPlanGroupBody = t.Object({ kind: GroupKindModel, name: GroupName });

/** Body of PATCH /plan-groups/:id. `archived` true archives, false restores. The tipo never changes. */
export const UpdatePlanGroupBody = t.Object({
  name: t.Optional(GroupName),
  archived: t.Optional(t.Boolean()),
});
