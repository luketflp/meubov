/**
 * Herd API — a single Elysia app mounted under /api/herd by the Next.js
 * catch-all route handler (app/api/herd/[[...slugs]]/route.ts).
 *
 * This file only composes: every route lives in its domain's controller under
 * lib/api/domains/, and each controller opts into the `farm` macro, which
 * resolves the authenticated user and the active farm (401 without a session).
 * `HerdApi` is the type the Eden Treaty client derives end-to-end types from —
 * import it with `import type` only, so no server code leaks into the client
 * bundle.
 */
import { Elysia } from "elysia";

import { animalsController } from "@/lib/api/domains/animals/animals.controller";
import { weighingsController } from "@/lib/api/domains/animals/weighings.controller";
import { breedsController } from "@/lib/api/domains/breeds/breeds.controller";
import { categoriesController } from "@/lib/api/domains/categories/categories.controller";
import { expensesController } from "@/lib/api/domains/expenses/expenses.controller";
import { farmController } from "@/lib/api/domains/farm/farm.controller";
import { herdController } from "@/lib/api/domains/herd/herd.controller";
import { invernadasController } from "@/lib/api/domains/invernadas/invernadas.controller";
import { lotsController } from "@/lib/api/domains/lots/lots.controller";
import { manejoController } from "@/lib/api/domains/manejo/manejo.controller";
import { protocolsController } from "@/lib/api/domains/protocols/protocols.controller";
import { birthsController } from "@/lib/api/domains/reproduction/births.controller";
import { reproductionController } from "@/lib/api/domains/reproduction/reproduction.controller";
import { treatmentsController } from "@/lib/api/domains/treatments/treatments.controller";

/** Postgres `foreign_key_violation`. */
const FOREIGN_KEY_VIOLATION = "23503";

function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === FOREIGN_KEY_VIOLATION
  );
}

export const herdApi = new Elysia({ prefix: "/api/herd" })
  /*
   * A delete can still fail at the database after its own guard passed: the
   * lot guard only looks at ACTIVE animals, while inactive animals and manejo
   * history reference the lot with ON DELETE NO ACTION. Answering 409 keeps
   * the client's "still in use" branch working instead of an opaque 500.
   *
   * This stays on the root instance, declared before the controllers: an
   * onError extracted into its own plugin does NOT cover sibling controllers,
   * and the 409 would silently become a 500. See errorScope.test.ts.
   */
  .onError(({ error, status }) => {
    if (isForeignKeyViolation(error)) return status(409, { error: "in_use" });
  })

  .use(herdController)

  /* ---- Settings: breeds, lots, invernadas, farm, protocols --------------- */
  .use(breedsController)
  .use(lotsController)
  .use(invernadasController)
  .use(farmController)
  .use(protocolsController)

  /* ---- Animals, weighings, treatments ----------------------------------- */
  .use(animalsController)
  .use(weighingsController)
  .use(treatmentsController)

  /* ---- Reproduction (females) ------------------------------------------- */
  .use(reproductionController)
  .use(birthsController)

  /* ---- Custom herd categories, expenses ---------------------------------- */
  .use(categoriesController)
  .use(expensesController)

  /* ---- Manejo sessions --------------------------------------------------- */
  .use(manejoController);

export type HerdApi = typeof herdApi;
