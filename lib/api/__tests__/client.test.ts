import { afterEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api/client";

afterEach(() => vi.unstubAllGlobals());

/** Stubs fetch and returns a reader of the RequestInit of its last call. */
function lastInit(): () => RequestInit | undefined {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({}));
  vi.stubGlobal("fetch", fetch);
  return () => fetch.mock.calls.at(-1)?.[1];
}

it("gives up on a manejo write the server never answers, and only on those", async () => {
  const init = lastInit();

  await api.manejo({ id: "s1" }).close.post();
  expect(init()?.signal).toBeInstanceOf(AbortSignal);

  await api.manejo.post({ date: "2026-10-05", kind: "weighing", earTags: ["1"], weighing: true });
  expect(init()?.signal).toBeInstanceOf(AbortSignal);

  // The herd's load can be slow and still arrive; other screens' writes keep their own errors.
  await api.get();
  expect(init()?.signal).toBeUndefined();
  await api.farms.post({ name: "Fazenda" } as never);
  expect(init()?.signal).toBeUndefined();
});
