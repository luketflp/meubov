/**
 * The foreign-key 409 must reach routes that live in domain controllers.
 *
 * `herdApi` maps a Postgres foreign_key_violation to 409 `in_use` so a delete
 * that passes its own guard but trips an ON DELETE NO ACTION reference still
 * answers the client's "still in use" branch. That handler sits on the root
 * instance on purpose: in Elysia an onError declared inside its own named
 * plugin does NOT cover sibling controllers, so extracting it would silently
 * turn every one of these into a 500. This test fails if someone moves it.
 */
import { Elysia } from "elysia";
import { describe, expect, it } from "vitest";

const FOREIGN_KEY_VIOLATION = { code: "23503" };

const onError = ({ error, status }: { error: unknown; status: (c: 409, b: unknown) => unknown }) => {
  if ((error as { code?: string }).code === "23503") {
    return status(409, { error: "in_use" });
  }
};

const controller = () =>
  new Elysia({ prefix: "/breeds" }).delete("/:name", () => {
    throw FOREIGN_KEY_VIOLATION;
  });

const del = (app: { handle: (r: Request) => Promise<Response> }) =>
  app.handle(new Request("http://localhost/api/herd/breeds/nelore", { method: "DELETE" }));

describe("foreign-key error mapping across controllers", () => {
  it("answers 409 when the handler is on the root instance", async () => {
    const app = new Elysia({ prefix: "/api/herd" }).onError(onError as never).use(controller());

    expect((await del(app)).status).toBe(409);
  });

  it("does NOT reach the controller when extracted into its own plugin", async () => {
    const errorPlugin = new Elysia({ name: "errorHandler" }).onError(onError as never);
    const app = new Elysia({ prefix: "/api/herd" }).use(errorPlugin).use(controller());

    // Documents the trap: a named error plugin leaves sibling controllers
    // unhandled, which is why herdApi keeps its onError on the root instance.
    expect((await del(app)).status).toBe(500);
  });
});
