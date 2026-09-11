/**
 * The herd API's route table, pinned.
 *
 * Every route the client can call is listed here by method and path. The list
 * is what the Eden Treaty client derives its call sites from, so a diff in
 * this test is a diff in the public API — moving a route between controllers
 * must not show up here, while renaming or dropping one must.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));

import { herdApi } from "@/lib/api/app";

describe("herd API route table", () => {
  it("exposes exactly the documented routes", () => {
    // Elysia treats "/breeds" and "/breeds/" as the same URL, and a route
    // declared as "/" inside a prefixed controller registers with the slash.
    // Normalizing it keeps this list about the API, not about which controller
    // a route happens to live in.
    const routes = (herdApi as unknown as { routes: { method: string; path: string }[] }).routes
      .map((r) => `${r.method} ${r.path.replace(/(?<=.)\/$/, "")}`)
      .sort();

    expect(routes).toMatchSnapshot();
  });
});
