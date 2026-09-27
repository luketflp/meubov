import { describe, expect, it } from "vitest";
import { memoryStore } from "@/lib/offline/db";

describe("memoryStore", () => {
  it("puts, gets, lists and deletes by key", async () => {
    const store = memoryStore<{ n: number }>();
    await store.put("a", { n: 1 });
    await store.put("b", { n: 2 });
    await store.put("a", { n: 3 });

    expect(await store.get("a")).toEqual({ n: 3 });
    expect(await store.get("missing")).toBeUndefined();
    expect(await store.list()).toEqual([{ n: 3 }, { n: 2 }]);

    await store.delete("a");
    await store.delete("missing");
    expect(await store.list()).toEqual([{ n: 2 }]);
  });

  it("clears every key", async () => {
    const store = memoryStore<number>();
    await store.put("a", 1);
    await store.put("b", 2);
    await store.clear();
    expect(await store.list()).toEqual([]);
  });

  it("keeps copies, like IndexedDB, so callers cannot mutate what is stored", async () => {
    const store = memoryStore<{ n: number }>();
    const value = { n: 1 };
    await store.put("a", value);
    value.n = 2;
    const read = await store.get("a");
    read!.n = 3;
    expect(await store.get("a")).toEqual({ n: 1 });
  });
});
