/**
 * What each farm-scoped route of the herd API asks of the caller.
 *
 * One table instead of an option per route, so the whole permission surface
 * reads in one place and a test can hold it against the mounted app: a route
 * with no entry is refused by the farm macro. A route declares the area of the
 * action it starts; whatever that action writes on the way belongs to it (a
 * parto inserts the calf, a chute pass inserts the treatment). Money rules that
 * depend on the body live in the manejo and semen controllers.
 */
import { can, type Area, type Permissions } from "@/lib/domain/permissions";

export type RouteRequirement = { read: true } | { view: Area } | { edit: readonly Area[] };

const READ = { read: true } as const;
const edit = (...areas: Area[]): RouteRequirement => ({ edit: areas });

export const ROUTE_REQUIREMENTS: Readonly<Record<string, RouteRequirement>> = {
  "GET /api/herd": READ,
  "GET /api/herd/farms": READ,
  "GET /api/herd/health": READ,

  "POST /api/herd/animals": edit("herd"),
  "POST /api/herd/animals/batch": edit("herd"),
  "PATCH /api/herd/animals/:id": edit("herd"),
  "POST /api/herd/animals/:id/deactivate": edit("herd"),
  "POST /api/herd/animals/:id/reactivate": edit("herd"),
  "POST /api/herd/animals/:id/weighings": edit("herd"),
  "PATCH /api/herd/animals/:id/weighings/:weighingId": edit("herd"),
  "DELETE /api/herd/animals/:id/weighings/:weighingId": edit("herd"),
  "DELETE /api/herd/weighings": edit("herd"),
  "POST /api/herd/breeds": edit("herd"),
  "DELETE /api/herd/breeds/:name": edit("herd"),
  "POST /api/herd/categories": edit("herd"),
  "DELETE /api/herd/categories/:id": edit("herd"),
  "POST /api/herd/animals/import": edit("herd", "lots"),

  "POST /api/herd/manejo": edit("manejo"),
  "DELETE /api/herd/manejo/:id": edit("manejo"),
  "POST /api/herd/manejo/:id/animals": edit("manejo"),
  // A baixa at the brete skips the pass and takes the animal out of the herd.
  "POST /api/herd/manejo/:id/animals/:animalId/baixa": edit("manejo", "herd"),
  "POST /api/herd/manejo/:id/animals/:animalId/complete": edit("manejo"),
  "POST /api/herd/manejo/:id/animals/:animalId/reopen": edit("manejo"),
  "POST /api/herd/manejo/:id/animals/:animalId/set-aside": edit("manejo"),
  "POST /api/herd/manejo/:id/animals/:animalId/skip": edit("manejo"),
  "POST /api/herd/manejo/:id/close": edit("manejo"),
  "POST /api/herd/manejo/:id/carcass-yield": edit("manejo", "finance"),

  "POST /api/herd/animals/:id/breedings": edit("reproduction"),
  "POST /api/herd/animals/:id/calvings": edit("reproduction"),
  "POST /api/herd/animals/:id/diagnoses": edit("reproduction"),
  "DELETE /api/herd/animals/:id/diagnoses/:breedingId": edit("reproduction"),
  "POST /api/herd/births/import": edit("reproduction"),
  // A new bull may bring its first purchase; the controller asks Financeiro for that.
  "POST /api/herd/semen-bulls": edit("reproduction"),
  "PATCH /api/herd/semen-bulls/:id": edit("reproduction"),
  // Deleting a bull takes its purchases along; the controller asks Financeiro for their expenses.
  "DELETE /api/herd/semen-bulls/:id": edit("reproduction"),
  // A purchase is a Reprodução expense: writing or deleting one moves money.
  "POST /api/herd/semen-bulls/:id/purchases": edit("reproduction", "finance"),
  "DELETE /api/herd/semen-bulls/:id/purchases/:purchaseId": edit("reproduction", "finance"),

  "POST /api/herd/treatments/schedule": edit("sanitary"),
  "POST /api/herd/treatments/complete": edit("sanitary"),
  "DELETE /api/herd/treatments/:id": edit("sanitary"),
  "POST /api/herd/protocols": edit("sanitary"),
  "DELETE /api/herd/protocols/:id": edit("sanitary"),

  "POST /api/herd/lots": edit("lots"),
  "PATCH /api/herd/lots/:id": edit("lots"),
  "DELETE /api/herd/lots/:id": edit("lots"),
  "POST /api/herd/lots/:id/archive": edit("lots"),
  "POST /api/herd/lots/:id/placements": edit("lots"),
  "POST /api/herd/invernadas": edit("lots"),
  "PATCH /api/herd/invernadas/:id": edit("lots"),
  "DELETE /api/herd/invernadas/:id": edit("lots"),
  "PUT /api/herd/farm/headquarters": edit("lots"),

  "POST /api/herd/expenses": edit("finance"),
  "PATCH /api/herd/expenses/:id": edit("finance"),
  "DELETE /api/herd/expenses/:id": edit("finance"),
  "POST /api/herd/accounts": edit("finance"),
  "PATCH /api/herd/accounts/:id": edit("finance"),
  "POST /api/herd/accounts/defaults": edit("finance"),

  "PUT /api/herd/farm": edit("farm"),

  "GET /api/herd/farm/team": { view: "team" },
  "POST /api/herd/farm/invites": edit("team"),
  "DELETE /api/herd/farm/invites/:id": edit("team"),
  "PATCH /api/herd/farm/members/:userId": edit("team"),
  "DELETE /api/herd/farm/members/:userId": edit("team"),
  // Any member may leave; the use case refuses the Dono.
  "POST /api/herd/farm/leave": READ,
};

/** Routes behind the session macro only: they run before the caller has a farm. */
export const SESSION_ONLY_ROUTES: readonly string[] = [
  "GET /api/herd/invites",
  "POST /api/herd/invites/:id/accept",
  "POST /api/herd/invites/:id/decline",
  "POST /api/herd/farms",
  "DELETE /api/herd/farms/:id",
];

/** Elysia's route pattern as the table spells it: "/api/herd/" becomes "/api/herd". */
export function routeKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path.replace(/(?<=.)\/$/, "")}`;
}

export type RequirementVerdict = { ok: true } | { ok: false; area: Area | null };

export function checkRequirement(
  requirement: RouteRequirement | undefined,
  permissions: Permissions
): RequirementVerdict {
  if (requirement === undefined) return { ok: false, area: null };
  if ("read" in requirement) return { ok: true };
  if ("view" in requirement) {
    return can(permissions, requirement.view, "view")
      ? { ok: true }
      : { ok: false, area: requirement.view };
  }
  const short = requirement.edit.find((area) => !can(permissions, area, "edit"));
  return short === undefined ? { ok: true } : { ok: false, area: short };
}
