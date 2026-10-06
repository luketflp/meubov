import { afterEach, describe, expect, it, vi } from "vitest";
import { memoryStore } from "@/lib/offline/db";
import {
  clearUserSnapshots,
  isNetworkFailure,
  loadSnapshot,
  saveSnapshot,
  snapshotKey,
  type Snapshot,
} from "@/lib/offline/snapshot";
import type { HerdData } from "@/lib/types";

const herd = (name: string): HerdData => ({
  animals: [],
  treatments: [],
  lots: [],
  invernadas: [],
  lotPlacements: [],
  movements: [],
  breeds: [],
  manejoSessions: [],
  expenses: [],
  accounts: [],
  customCategories: [],
  semenBulls: [],
  farm: { name, municipality: "Campo Grande", stateRegistration: "", manager: "", safraStartMonth: 10 },
});

const snapshot = (farmId: number, name = `Fazenda ${farmId}`): Snapshot => ({
  data: herd(name),
  farms: [],
  activeFarmId: farmId,
  savedAt: "2026-09-24T14:07:00.000Z",
});

describe("snapshot", () => {
  it("keys by user and farm", () => {
    expect(snapshotKey("user-1", 7)).toBe("user-1:7");
  });

  it("round-trips a snapshot and misses an unknown key", async () => {
    const store = memoryStore<Snapshot>();
    await saveSnapshot(store, snapshotKey("user-1", 1), snapshot(1, "Santa Rita"));

    expect(await loadSnapshot(store, snapshotKey("user-1", 1))).toEqual(snapshot(1, "Santa Rita"));
    expect(await loadSnapshot(store, snapshotKey("user-2", 1))).toBeUndefined();
  });

  it("a newer save replaces the older one", async () => {
    const store = memoryStore<Snapshot>();
    await saveSnapshot(store, snapshotKey("user-1", 1), snapshot(1, "Antes"));
    await saveSnapshot(store, snapshotKey("user-1", 1), snapshot(1, "Depois"));

    expect((await loadSnapshot(store, snapshotKey("user-1", 1)))?.data.farm.name).toBe("Depois");
  });

  it("clears every farm of one user and leaves the other users", async () => {
    const store = memoryStore<Snapshot>();
    await saveSnapshot(store, snapshotKey("user-1", 1), snapshot(1));
    await saveSnapshot(store, snapshotKey("user-1", 2), snapshot(2));
    await saveSnapshot(store, snapshotKey("user-2", 1), snapshot(1));
    await saveSnapshot(store, snapshotKey("user-2", 3), snapshot(3));

    await clearUserSnapshots(store, "user-1");

    expect(await loadSnapshot(store, snapshotKey("user-1", 1))).toBeUndefined();
    expect(await loadSnapshot(store, snapshotKey("user-1", 2))).toBeUndefined();
    expect(await loadSnapshot(store, snapshotKey("user-2", 1))).toEqual(snapshot(1));
    expect(await loadSnapshot(store, snapshotKey("user-2", 3))).toEqual(snapshot(3));
  });
});

describe("isNetworkFailure", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is a rejected fetch or a status the API never answered", () => {
    expect(isNetworkFailure(new TypeError("Failed to fetch"))).toBe(true);
    for (const status of [0, 502, 503, 504]) {
      expect(isNetworkFailure({ status, value: null })).toBe(true);
      expect(isNetworkFailure(new Error(`Failed to load herd data (status ${status})`))).toBe(true);
    }
  });

  it("is not an answer the server gave", () => {
    for (const status of [401, 403, 409, 500]) {
      expect(isNetworkFailure({ status, value: null })).toBe(false);
      expect(isNetworkFailure(new Error(`Failed to load herd data (status ${status})`))).toBe(false);
    }
    expect(isNetworkFailure(new Error("boom"))).toBe(false);
  });

  it("is any failure while the browser reports offline", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(isNetworkFailure(new Error("Failed to load herd data (status 500)"))).toBe(true);
  });
});
