/** Request schemas for the team routes: convites and member levels. */

import { t } from "elysia";

const LevelModel = t.Union([t.Literal("none"), t.Literal("view"), t.Literal("edit")]);

/** One level per area. Floors and the actor's ceiling are enforced by the use cases. */
export const PermissionsBody = t.Object({
  herd: LevelModel,
  manejo: LevelModel,
  reproduction: LevelModel,
  sanitary: LevelModel,
  lots: LevelModel,
  finance: LevelModel,
  farm: LevelModel,
  team: LevelModel,
});

/** Body of POST /farm/invites. The preset is derived from the levels, never sent. */
export const InviteBody = t.Object({
  email: t.String({ minLength: 1, maxLength: 320 }),
  permissions: PermissionsBody,
});

/** Body of PATCH /farm/members/:userId. */
export const MemberPatchBody = t.Object({
  permissions: PermissionsBody,
});
