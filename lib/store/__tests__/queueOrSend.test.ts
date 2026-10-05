import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Animal, ManejoSession } from "@/lib/types";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
const repoLoad = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/client", () => ({ authClient: { getSession: vi.fn() } }));
vi.mock("@/lib/api/client", () => ({
  api: { manejo: vi.fn(), farms: { get: vi.fn() }, invites: { get: vi.fn() } },
  NO_ANSWER_MS: 10_000,
}));
vi.mock("@/lib/repository/ApiHerdRepository", () => ({
  ApiHerdRepository: class {
    load = repoLoad;
  },
}));
// No IndexedDB in node: every store the store module opens lives in memory, one per name.
vi.mock("@/lib/offline/db", async (importOriginal) => {
  const db = await importOriginal<typeof import("@/lib/offline/db")>();
  const stores = new Map<string, unknown>();
  return {
    ...db,
    openStore: (name: string) => {
      if (!stores.has(name)) stores.set(name, db.memoryStore());
      return stores.get(name);
    },
  };
});
vi.mock("@/lib/store/offlineWiring", async () => {
  const { createOutbox } = await import("@/lib/offline/outbox");
  const { memoryStore } = await import("@/lib/offline/db");
  const outbox = createOutbox(memoryStore(), memoryStore());
  const engine = { kick: vi.fn(async () => {}) };
  let user: string | undefined;
  return {
    getOutbox: () => outbox,
    getEngine: () => engine,
    wireOffline: vi.fn(),
    setSyncUser: vi.fn((userId: string | undefined) => {
      user = userId;
    }),
    getSyncUser: () => user,
  };
});

import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { authClient } from "@/lib/auth/client";
import { openStore } from "@/lib/offline/db";
import type { Snapshot } from "@/lib/offline/snapshot";
import type { OfflineHooks } from "@/lib/store/offlineWiring";
import {
  getEngine,
  getOutbox,
  getSyncUser,
  setSyncUser,
  wireOffline,
} from "@/lib/store/offlineWiring";
import { clearOfflineSnapshots, persistSnapshot, useHerdStore } from "@/lib/store/useHerdStore";

const animal: Animal = {
  id: "a-101",
  earTag: "101",
  category: "cow",
  breed: "Nelore",
  sex: "female",
  birthDate: "2022-01-10",
  lotId: "L1",
  active: true,
  weighings: [],
};

const session: ManejoSession = {
  id: "s1",
  name: "Vacinação",
  date: "2026-09-25",
  status: "open",
  kind: "health",
  weighing: false,
  treatment: { type: "vaccine", name: "Aftosa", withdrawalDays: 0 },
  animals: [{ earTag: "101", outcome: "pending" }],
};

const entry = () => useHerdStore.getState().manejoSessions[0].animals[0];

beforeEach(async () => {
  vi.clearAllMocks();
  setSyncUser("u1");
  vi.stubGlobal("navigator", { onLine: false });
  for (const op of await getOutbox().list()) await getOutbox().remove(op.id);
  useHerdStore.setState({
    animals: [animal],
    treatments: [],
    semenBulls: [],
    manejoSessions: [session],
    activeFarmId: 1,
  });
});

describe("manejo actions without signal", () => {
  it("queue a pass and show it at once, sending nothing", async () => {
    expect(await useHerdStore.getState().completeManejoAnimal("s1", "101", { notes: "calma" })).toBe(
      true
    );
    const [op] = await getOutbox().list();
    expect(op).toMatchObject({
      kind: "complete",
      userId: "u1",
      sessionId: "s1",
      earTag: "101",
      body: { notes: "calma" },
      state: "queued",
    });
    expect(entry()).toMatchObject({ outcome: "done", pending: true, localOpId: op.id });
    expect(useHerdStore.getState().treatments).toEqual([
      expect.objectContaining({ animalEarTag: "101", localOpId: op.id }),
    ]);
    expect(getEngine()?.kick).toHaveBeenCalledWith("enqueue");
    expect(api.manejo).not.toHaveBeenCalled();
  });

  it("undo a pass that never left the phone: the op and its records go, nothing is sent", async () => {
    await useHerdStore.getState().completeManejoAnimal("s1", "101");
    await useHerdStore.getState().reopenManejoAnimal("s1", "101");
    expect(await getOutbox().list()).toEqual([]);
    expect(entry().outcome).toBe("pending");
    expect(entry().pending).toBeUndefined();
    expect(entry().localOpId).toBeUndefined();
    expect(useHerdStore.getState().treatments).toEqual([]);
    expect(api.manejo).not.toHaveBeenCalled();
  });

  it("start a manejo on the phone with its own id, the start first in the fila", async () => {
    const input = { date: "2026-09-25", kind: "weighing" as const, earTags: ["101"], weighing: true };
    const id = await useHerdStore.getState().startManejoSession(input);
    const [op] = await getOutbox().list();
    expect(op).toMatchObject({ kind: "start", sessionId: id, body: input });
    expect(useHerdStore.getState().manejoSessions.find((m) => m.id === id)).toMatchObject({
      status: "open",
      pending: true,
    });
    expect(api.manejo).not.toHaveBeenCalled();
  });

  it("refuse to start an entrada", async () => {
    const input = { date: "2026-09-25", kind: "entry" as const, earTags: [], weighing: false };
    await expect(useHerdStore.getState().startManejoSession(input)).rejects.toThrow();
    expect(toast.error).toHaveBeenCalledWith("Entrada precisa de sinal");
    expect(await getOutbox().list()).toEqual([]);
    expect(api.manejo).not.toHaveBeenCalled();
  });

  it("queue a start that met a network failure under the id it sent", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    const post = vi.fn(async () => ({ data: null, error: { status: 503 } }));
    Object.assign(api.manejo, { post });
    const input = { date: "2026-09-25", kind: "weighing" as const, earTags: ["101"], weighing: true };
    const id = await useHerdStore.getState().startManejoSession(input);
    expect(post).toHaveBeenCalledWith({ ...input, id });
    expect(await getOutbox().list()).toEqual([
      expect.objectContaining({ kind: "start", sessionId: id, body: input }),
    ]);
  });

  it("queue nothing without an active farm", async () => {
    useHerdStore.setState({ activeFarmId: null });
    await expect(useHerdStore.getState().completeManejoAnimal("s1", "101")).rejects.toThrow();
    expect(await getOutbox().list()).toEqual([]);
  });

  it("refuse an entrada animal", async () => {
    const registered = await useHerdStore.getState().registerEntryAnimal("s1", {
      earTag: "900",
      category: "steer",
      breed: "Nelore",
      sex: "male",
      birthDate: "2025-01-01",
    });
    expect(registered).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("Entrada precisa de sinal");
    expect(api.manejo).not.toHaveBeenCalled();
  });
});

/** Boots offline from u0's snapshot of farm 1; the hooks the store handed the wiring. */
async function bootOffline(): Promise<OfflineHooks> {
  await openStore<string>("meta").put("lastUser", "u0");
  await openStore<Snapshot>("snapshot").put("u0:1", {
    data: { animals: [animal], manejoSessions: [session] } as never,
    farms: [],
    activeFarmId: 1,
    savedAt: "2026-09-24T10:00:00.000Z",
  });
  repoLoad.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  useHerdStore.setState({ loaded: false, manejoSessions: [] });
  await useHerdStore.getState().load();
  return vi.mocked(wireOffline).mock.calls.at(-1)![0] as OfflineHooks;
}

const signedInAs = (id: string | null) =>
  vi.mocked(authClient.getSession).mockResolvedValueOnce({
    data: id === null ? null : { user: { id } },
    error: null,
  } as never);

describe("an offline boot", () => {
  const reload = vi.fn();
  const removeItem = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: { getItem: () => "1", removeItem }, location: { reload } });
  });

  it("works for the snapshot's user, and reloads clean when another user is signed in", async () => {
    const hooks = await bootOffline();
    expect(useHerdStore.getState().offline).toBe(true);
    expect(getSyncUser()).toBe("u0");
    expect(hooks.holdSync()).toBe(true);

    // An offline pass is u0's and persists into u0's snapshot.
    await useHerdStore.getState().completeManejoAnimal("s1", "101");
    expect(await getOutbox().list()).toEqual([expect.objectContaining({ userId: "u0" })]);
    const saved = await openStore<Snapshot>("snapshot").get("u0:1");
    expect(saved?.data.manejoSessions[0].animals[0]).toMatchObject({ pending: true });

    // Signal again, but the session is someone else's: a clean reload, nothing sent.
    vi.stubGlobal("navigator", { onLine: true });
    signedInAs("u2");
    hooks.onChange(useHerdStore.getState().sync, []);
    await vi.waitFor(() => expect(reload).toHaveBeenCalled());
    expect(removeItem).toHaveBeenCalledWith("meubov.activeFarmId");
    // Nothing of u0's is saved under u2 before the reload.
    await persistSnapshot(useHerdStore.getState);
    expect(await openStore<Snapshot>("snapshot").get("u2:1")).toBeUndefined();
    expect(getSyncUser()).toBe("u0");
    expect(hooks.holdSync()).toBe(true);
    expect(await getOutbox().list()).toHaveLength(1);
  });

  it("with the user confirmed, leaves the snapshot for the server's herd, the fila on top", async () => {
    const hooks = await bootOffline();
    await useHerdStore.getState().completeManejoAnimal("s1", "101");

    vi.stubGlobal("navigator", { onLine: true });
    signedInAs("u0");
    repoLoad.mockResolvedValueOnce({ animals: [animal], manejoSessions: [session], treatments: [] });
    hooks.onChange(useHerdStore.getState().sync, []);
    await vi.waitFor(() => expect(hooks.holdSync()).toBe(false));

    expect(useHerdStore.getState()).toMatchObject({ offline: false, snapshotAt: null });
    expect(entry()).toMatchObject({ outcome: "done", pending: true });
    expect(useHerdStore.getState().treatments).toHaveLength(1);
    // The reload happened while the fila was still held.
    const reloaded = repoLoad.mock.invocationCallOrder.at(-1)!;
    const released = vi.mocked(setSyncUser).mock.invocationCallOrder.at(-1)!;
    expect(reloaded).toBeLessThan(released);
  });

  it("without a session, holds the fila until a sign-in in this tab confirms the user", async () => {
    const hooks = await bootOffline();
    vi.stubGlobal("navigator", { onLine: true });
    signedInAs(null);
    hooks.onChange(useHerdStore.getState().sync, []);
    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Entre de novo para enviar")
    );
    expect(getSyncUser()).toBeUndefined();
    expect(hooks.holdSync()).toBe(true);

    // Later status changes neither ask again nor toast again.
    hooks.onChange(useHerdStore.getState().sync, []);
    await Promise.resolve();
    expect(authClient.getSession).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledTimes(1);

    // Signed in again as u0 in this tab: load confirms before it kicks the engine.
    signedInAs("u0");
    await useHerdStore.getState().load();
    expect(getSyncUser()).toBe("u0");
    expect(hooks.holdSync()).toBe(false);
    const confirmed = vi.mocked(setSyncUser).mock.invocationCallOrder.at(-1)!;
    const kicked = vi.mocked(wireOffline).mock.invocationCallOrder.at(-1)!;
    expect(confirmed).toBeLessThan(kicked);
  });

  it("sign-out resets the store and the next user's ops are theirs", async () => {
    await openStore<string>("meta").put("lastUser", "u0");
    await openStore<Snapshot>("snapshot").put("u0:1", {
      data: {} as never,
      farms: [],
      activeFarmId: 1,
      savedAt: "2026-09-24T10:00:00.000Z",
    });
    await clearOfflineSnapshots();
    expect(await openStore<Snapshot>("snapshot").get("u0:1")).toBeUndefined();
    expect(await openStore<string>("meta").get("lastUser")).toBeUndefined();
    expect(useHerdStore.getState()).toMatchObject({
      loaded: false,
      animals: [],
      activeFarmId: null,
      ops: [],
    });
    expect(getSyncUser()).toBeUndefined();

    // Offline with no known user: nothing is queued, the action goes online as before.
    useHerdStore.setState({ animals: [animal], manejoSessions: [session], activeFarmId: 1 });
    await expect(useHerdStore.getState().completeManejoAnimal("s1", "101")).rejects.toThrow();
    expect(await getOutbox().list()).toEqual([]);

    // u3 signs in: the load runs in full and the fila works for u3.
    vi.stubGlobal("navigator", { onLine: true });
    repoLoad.mockResolvedValueOnce({ animals: [animal], manejoSessions: [session] });
    vi.mocked(api.farms.get).mockResolvedValueOnce({ data: { farms: [], activeFarmId: 1 } } as never);
    vi.mocked(api.invites.get).mockResolvedValueOnce({ data: { invites: [] } } as never);
    signedInAs("u3");
    await useHerdStore.getState().load();
    await vi.waitFor(() => expect(getSyncUser()).toBe("u3"));
    vi.stubGlobal("navigator", { onLine: false });
    await useHerdStore.getState().completeManejoAnimal("s1", "101");
    expect(await getOutbox().list()).toEqual([
      expect.objectContaining({ userId: "u3", farmId: 1 }),
    ]);
  });
});

describe("a loaded tab", () => {
  const reload = vi.fn();
  const removeItem = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: { getItem: () => "1", removeItem }, location: { reload } });
    vi.stubGlobal("navigator", { onLine: true });
    useHerdStore.setState({ loaded: true });
  });

  it("signed in again as another user after the session expired: a clean reload, nothing kicked for them", async () => {
    signedInAs("u2");
    await useHerdStore.getState().load();
    expect(reload).toHaveBeenCalled();
    expect(removeItem).toHaveBeenCalledWith("meubov.activeFarmId");
    expect(getSyncUser()).toBeUndefined();
    const held = vi.mocked(setSyncUser).mock.invocationCallOrder.at(-1)!;
    expect(held).toBeLessThan(vi.mocked(authClient.getSession).mock.invocationCallOrder[0]);
  });

  it("signed in again as the same user: the fila is theirs again before the kick", async () => {
    signedInAs("u1");
    await useHerdStore.getState().load();
    expect(reload).not.toHaveBeenCalled();
    expect(getSyncUser()).toBe("u1");
    const confirmed = vi.mocked(setSyncUser).mock.invocationCallOrder.at(-1)!;
    expect(confirmed).toBeLessThan(vi.mocked(wireOffline).mock.invocationCallOrder.at(-1)!);
  });
});

describe("an online load", () => {
  it("asks who is signed in again in 30 s when the first session read fails", async () => {
    vi.useFakeTimers();
    try {
      setSyncUser(undefined);
      vi.stubGlobal("navigator", { onLine: true });
      useHerdStore.setState({ loaded: false });
      repoLoad.mockResolvedValueOnce({ animals: [animal], manejoSessions: [session] });
      vi.mocked(api.farms.get).mockResolvedValueOnce({ data: { farms: [], activeFarmId: 1 } } as never);
      vi.mocked(api.invites.get).mockResolvedValueOnce({ data: { invites: [] } } as never);
      vi.mocked(authClient.getSession).mockResolvedValueOnce({
        data: null,
        error: new Error("Failed to fetch"),
      } as never);
      await useHerdStore.getState().load();
      await vi.advanceTimersByTimeAsync(0);
      expect(getSyncUser()).toBeUndefined();
      signedInAs("u4");
      await vi.advanceTimersByTimeAsync(30_000);
      expect(getSyncUser()).toBe("u4");
    } finally {
      vi.useRealTimers();
    }
  });
});
