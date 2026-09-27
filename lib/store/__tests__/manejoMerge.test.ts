import { describe, expect, it } from "vitest";
import {
  mergeBaixaResult,
  mergeCarcassYield,
  mergeClose,
  mergeCompleteResult,
  mergeReopenResult,
  mergeSetAsideResult,
  mergeSkipResult,
  mergeStart,
  stripLocal,
  type HerdSlices,
} from "@/lib/store/manejoMerge";
import type { Animal, ManejoSession, Treatment } from "@/lib/types";

const cow = (earTag: string, over: Partial<Animal> = {}): Animal => ({
  id: `id-${earTag}`,
  earTag,
  category: "cow",
  breed: "Nelore",
  sex: "female",
  birthDate: "2022-01-01",
  lotId: "lot-a",
  active: true,
  weighings: [
    { id: 1, date: "2026-01-10", weightKg: 400 },
    { id: 2, date: "2026-09-01", weightKg: 430 },
  ],
  ...over,
});

const session = (over: Partial<ManejoSession> = {}): ManejoSession => ({
  id: "s1",
  name: "Vacina aftosa",
  date: "2026-05-02",
  status: "open",
  kind: "health",
  weighing: true,
  animals: [
    { earTag: "101", outcome: "pending" },
    { earTag: "102", outcome: "pending" },
  ],
  ...over,
});

const treatment = (id: string, over: Partial<Treatment> = {}): Treatment => ({
  id,
  animalEarTag: "101",
  type: "vaccine",
  name: "Vacina aftosa",
  date: "2026-05-02",
  status: "done",
  withdrawalDays: 0,
  ...over,
});

const slices = (over: Partial<HerdSlices> = {}): HerdSlices => ({
  animals: [cow("101"), cow("102")],
  treatments: [treatment("t0", { animalEarTag: "102" })],
  manejoSessions: [session()],
  semenBulls: [],
  ...over,
});

const entryOf = (s: HerdSlices, earTag: string) =>
  s.manejoSessions[0].animals.find((a) => a.earTag === earTag);
const animalOf = (s: HerdSlices, earTag: string) => s.animals.find((a) => a.earTag === earTag)!;

describe("mergeCompleteResult", () => {
  it("replaces the entry, appends treatments, sorts the weighing in, patches the animal and appends the breeding", () => {
    const before = slices();
    const after = mergeCompleteResult(before, "s1", "101", {
      entry: { earTag: "101", outcome: "done", weightKg: 415 },
      treatments: [treatment("t1")],
      weighing: { id: 3, date: "2026-05-02", weightKg: 415 },
      animal: { earTag: "101", active: true, lotId: "lot-b" },
      breeding: { id: "b1", date: "2026-05-02", type: "timedAI", bullEarTag: "NEL-1", semenBullId: "bull-1" },
    });
    expect(entryOf(after, "101")).toEqual({ earTag: "101", outcome: "done", weightKg: 415 });
    expect(entryOf(after, "102")).toEqual({ earTag: "102", outcome: "pending" });
    expect(after.treatments.map((t) => t.id)).toEqual(["t0", "t1"]);
    const a = animalOf(after, "101");
    expect(a.weighings.map((w) => w.date)).toEqual(["2026-01-10", "2026-05-02", "2026-09-01"]);
    expect(a.lotId).toBe("lot-b");
    expect(a.reproduction?.breedings.map((b) => b.id)).toEqual(["b1"]);
    expect(animalOf(after, "102")).toBe(before.animals[1]);
  });
});

describe("mergeSkipResult", () => {
  it("replaces only the entry", () => {
    const before = slices();
    const after = mergeSkipResult(before, "s1", "102", { earTag: "102", outcome: "skipped", notes: "mancando" });
    expect(entryOf(after, "102")).toEqual({ earTag: "102", outcome: "skipped", notes: "mancando" });
    expect(after.animals).toBe(before.animals);
    expect(after.treatments).toBe(before.treatments);
  });
});

describe("mergeSetAsideResult", () => {
  it("replaces the entry and sorts the weighing in", () => {
    const after = mergeSetAsideResult(slices(), "s1", "101", {
      entry: { earTag: "101", outcome: "rejected", weightKg: 380 },
      weighing: { id: 9, date: "2026-05-02", weightKg: 380 },
    });
    expect(entryOf(after, "101")?.outcome).toBe("rejected");
    expect(animalOf(after, "101").weighings.map((w) => w.id)).toEqual([1, 9, 2]);
  });
});

describe("mergeBaixaResult", () => {
  it("takes the animal out of the herd and replaces the entry", () => {
    const after = mergeBaixaResult(slices(), "s1", "101", {
      entry: { earTag: "101", outcome: "skipped", notes: "Baixa · Morte" },
      animal: { active: false, inactiveReason: "death", inactiveDate: "2026-05-02" },
    });
    expect(animalOf(after, "101")).toMatchObject({ active: false, inactiveReason: "death", inactiveDate: "2026-05-02" });
    expect(entryOf(after, "101")?.notes).toBe("Baixa · Morte");
  });
});

describe("mergeReopenResult", () => {
  it("removes what the server lists and puts the animal back", () => {
    const before = slices({
      animals: [
        cow("101", {
          lotId: "lot-b",
          weighings: [
            { id: 1, date: "2026-01-10", weightKg: 400 },
            { id: 3, date: "2026-05-02", weightKg: 415 },
          ],
          reproduction: {
            breedings: [{ id: "b1", date: "2026-05-02", type: "timedAI", bullEarTag: "NEL-1" }],
            diagnoses: [],
            calvings: [],
          },
        }),
        cow("102"),
      ],
      treatments: [treatment("t0", { animalEarTag: "102" }), treatment("t1")],
      manejoSessions: [session({ animals: [{ earTag: "101", outcome: "done" }, { earTag: "102", outcome: "pending" }] })],
    });
    const after = mergeReopenResult(before, "s1", "101", {
      entry: { earTag: "101", outcome: "pending" },
      removedTreatmentIds: ["t1"],
      removedWeighing: { date: "2026-05-02", weightKg: 415 },
      animal: { earTag: "101", active: true, lotId: "lot-a" },
      removedBreedingId: "b1",
    });
    expect(after.treatments.map((t) => t.id)).toEqual(["t0"]);
    const a = animalOf(after, "101");
    expect(a.weighings.map((w) => w.id)).toEqual([1]);
    expect(a.reproduction?.breedings).toEqual([]);
    expect(a.lotId).toBe("lot-a");
    expect(entryOf(after, "101")).toEqual({ earTag: "101", outcome: "pending" });
  });

  it("unregisters the animal an entry pass created", () => {
    const after = mergeReopenResult(slices(), "s1", "102", {
      entry: { earTag: "102", outcome: "pending" },
      removedTreatmentIds: [],
      removedEarTag: "102",
    });
    expect(after.animals.map((a) => a.earTag)).toEqual(["101"]);
    expect(after.manejoSessions[0].animals.map((a) => a.earTag)).toEqual(["101"]);
  });
});

describe("mergeCarcassYield", () => {
  it("sets the yield and the amounts it listed", () => {
    const after = mergeCarcassYield(
      slices({ manejoSessions: [session({ kind: "sale", animals: [{ earTag: "101", outcome: "done", amountBrl: 1 }, { earTag: "102", outcome: "pending" }] })] }),
      "s1",
      { carcassYieldPct: 52, amounts: [{ earTag: "101", amountBrl: 3000 }] }
    );
    expect(after.manejoSessions[0].carcassYieldPct).toBe(52);
    expect(entryOf(after, "101")?.amountBrl).toBe(3000);
    expect(entryOf(after, "102")?.amountBrl).toBeUndefined();
  });
});

describe("mergeClose", () => {
  it("flips the session to closed", () => {
    expect(mergeClose(slices(), "s1").manejoSessions[0].status).toBe("closed");
  });
});

describe("mergeStart", () => {
  it("appends the session", () => {
    const after = mergeStart(slices(), session({ id: "s2" }));
    expect(after.manejoSessions.map((m) => m.id)).toEqual(["s1", "s2"]);
  });
});

describe("stripLocal", () => {
  const op = "op-1";
  const marked = (): HerdSlices =>
    slices({
      animals: [
        cow("101", {
          lotId: "lot-b",
          weighings: [
            { id: 1, date: "2026-01-10", weightKg: 400 },
            { id: -5, date: "2026-05-02", weightKg: 415, localOpId: op },
          ],
          reproduction: {
            breedings: [
              { id: "b0", date: "2025-11-02", type: "timedAI", bullEarTag: "NEL-1" },
              { id: "local:x", date: "2026-05-02", type: "timedAI", bullEarTag: "NEL-1", localOpId: op },
            ],
            diagnoses: [],
            calvings: [],
          },
        }),
        cow("102"),
      ],
      treatments: [treatment("t0", { animalEarTag: "102" }), treatment("local:y", { localOpId: op }), treatment("local:z", { localOpId: "op-2" })],
      manejoSessions: [
        session({
          kind: "transfer",
          animals: [
            { earTag: "101", outcome: "done", weightKg: 415, previousLotId: "lot-a", pending: true, localOpId: op },
            { earTag: "102", outcome: "skipped", pending: true, localOpId: "op-2" },
          ],
        }),
      ],
    });

  it("removes the records with the marker, resets its entry, puts the animal back, and leaves the rest", () => {
    const after = stripLocal(marked(), op);
    expect(after.treatments.map((t) => t.id)).toEqual(["t0", "local:z"]);
    const a = animalOf(after, "101");
    expect(a.weighings.map((w) => w.id)).toEqual([1]);
    expect(a.reproduction?.breedings.map((b) => b.id)).toEqual(["b0"]);
    expect(a.lotId).toBe("lot-a");
    expect(entryOf(after, "101")).toEqual({ earTag: "101", outcome: "pending" });
    expect(entryOf(after, "102")).toEqual({ earTag: "102", outcome: "skipped", pending: true, localOpId: "op-2" });
  });

  it("puts a sold animal back in the herd", () => {
    const s = slices({
      animals: [cow("101", { active: false }), cow("102")],
      manejoSessions: [session({ kind: "sale", animals: [{ earTag: "101", outcome: "done", pending: true, localOpId: op }] })],
    });
    expect(animalOf(stripLocal(s, op), "101").active).toBe(true);
  });

  it("removes the pending session its start op created", () => {
    const s = slices({ manejoSessions: [session(), session({ id: "s2", pending: true })] });
    expect(stripLocal(s, op, { startedSessionId: "s2" }).manejoSessions.map((m) => m.id)).toEqual(["s1"]);
  });

  it("returns the same animals when nothing carries the marker", () => {
    const before = slices();
    expect(stripLocal(before, "nobody").animals).toEqual(before.animals);
  });
});
