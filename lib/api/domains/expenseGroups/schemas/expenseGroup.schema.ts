/** Request schemas for the farm's own grupos de despesa. */

import { t } from "elysia";

import { GROUP_NAME_MAX } from "@/lib/domain/groups";

const GroupName = t.String({ minLength: 1, maxLength: GROUP_NAME_MAX, pattern: "\\S" });

/** Body of POST /expense-groups. */
export const NewExpenseGroupBody = t.Object({ name: GroupName });

/** Body of PATCH /expense-groups/:id. `archived` true archives, false restores. */
export const UpdateExpenseGroupBody = t.Object({
  name: t.Optional(GroupName),
  archived: t.Optional(t.Boolean()),
});
