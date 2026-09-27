/**
 * Parity of the phone's optimistic pass with what the server's use cases
 * write. The expectations come straight from the pure parts the use cases
 * call (buildPassEffects, saleAmount, baixaPassNote) and from the columns each
 * use case sets (CompleteAnimal, SkipAnimal, SetAsideAnimal, BaixaAnimal);
 * the use cases themselves need a database and are not run here.
 */
import { describe, expect, it } from "vitest";
import { localApply, localStartSession } from "@/lib/offline/localApply";
import { baixaPassNote, buildPassEffects } from "@/lib/domain/manejo";
import { passYieldPct, saleAmount } from "@/lib/domain/movements";
import type { OutboxKind, OutboxOp } from "@/lib/offline/types";
import type { Animal, ManejoSession, SemenBull } from "@/lib/types";

const TODAY = "2026-05-02";

const animal: Animal = {
  id: "a-101",
  earTag: "101",
  category: "cow",
  breed: "Nelore",
  sex: "female",
  birthDate: "2022-01-01",
  lotId: "lot-a",
  active: true,
  weighings: [],
};

const semenBulls: SemenBull[] = [
  { id: "bull-1", name: "Faraó", code: "NEL-1", purchases: [] },
  { id: "bull-2", name: "Jaguar", purchases: [] },
];

const session = (over: Partial<ManejoSession>): ManejoSession => ({
  id: "s1",
  name: "Manejo",
  date: TODAY,
  status: "open",
  kind: "health",
  weighing: false,
  animals: [{ earTag: "101", outcome: "pending" }],
  ...over,
});

const op = (kind: OutboxKind, body: Record<string, unknown>): OutboxOp => ({
  id: "op-1",
  seq: 1,
  userId: "u1",
  farmId: 1,
  sessionId: "s1",
  kind,
  earTag: "101",
  body,
  createdAt: "2026-05-02T10:00:00.000Z",
  state: "queued",
  attempts: 0,
});

/** A record without its provisional id and markers, for the field-by-field compare. */
const unmark = (record: object) =>
  Object.fromEntries(
    Object.entries(record).filter(([key]) => !["id", "localOpId", "pending"].includes(key))
  );

const run = (s: ManejoSession, kind: OutboxKind, body: Record<string, unknown>) =>
  localApply(op(kind, body), { session: s, animal, semenBulls, today: TODAY })!;

describe("localApply · complete", () => {
  it("health with booster and weighing: the server's treatments, weighing and entry", () => {
    const s = session({
      kind: "health",
      weighing: true,
      treatment: {
        type: "vaccine",
        name: "Vacina aftosa",
        withdrawalDays: 0,
        dose: "5 ml",
        responsible: "Dr. Ana",
        costBrl: 4.5,
        nextDate: "2026-11-02",
      },
    });
    const body = { weightKg: 415, notes: "  reação  " };
    const effects = buildPassEffects(s, body);
    const r = run(s, "complete", body);

    expect(r.treatments.map(unmark)).toEqual([
      { animalEarTag: "101", ...effects.treatment },
      { animalEarTag: "101", ...effects.booster },
    ]);
    expect(r.treatments.every((t) => t.id.startsWith("local:") && t.localOpId === "op-1")).toBe(true);
    expect(new Set(r.treatments.map((t) => t.id)).size).toBe(2);

    expect(unmark(r.weighing!)).toEqual(effects.weighing);
    expect(r.weighing!.id).toBeLessThan(0);
    expect(r.weighing!.localOpId).toBe("op-1");

    expect(unmark(r.entry)).toEqual({ earTag: "101", outcome: "done", weightKg: 415, notes: "reação" });
    expect(r.entry).toMatchObject({ pending: true, localOpId: "op-1" });
    expect(r.animal).toBeUndefined();
    expect(r.breeding).toBeUndefined();
  });

  it("transfer: lands the animal in the destination lot and keeps where it came from", () => {
    const s = session({ kind: "transfer", destinationLotId: "lot-b" });
    const r = run(s, "complete", {});
    expect(r.animal).toEqual({ earTag: "101", active: true, lotId: "lot-b" });
    expect(unmark(r.entry)).toEqual({ earTag: "101", outcome: "done", previousLotId: "lot-a" });
    expect(r.treatments).toEqual([]);
    expect(r.weighing).toBeUndefined();
  });

  it("sale per arroba with its own yield: prices the pass the way the server does and takes the animal out", () => {
    const s = session({ kind: "sale", weighing: true, pricePerArroba: 300, carcassYieldPct: 52 });
    const body = { weightKg: 480, carcassYieldPct: 54 };
    const r = run(s, "complete", body);
    const amountBrl = saleAmount(480, 300, passYieldPct(s, { carcassYieldPct: 54 }));
    expect(unmark(r.entry)).toEqual({
      earTag: "101",
      outcome: "done",
      weightKg: 480,
      amountBrl,
      carcassYieldPct: 54,
      previousLotId: "lot-a",
    });
    expect(r.animal).toEqual({ earTag: "101", active: false, lotId: "lot-a" });
    expect(unmark(r.weighing!)).toEqual({ date: TODAY, weightKg: 480 });
    expect(r.weighing!.localOpId).toBe("op-1");
  });

  it("insemination: the picked bull's cobertura, named like the server names it", () => {
    const s = session({ kind: "insemination", semenBullIds: ["bull-1", "bull-2"] });
    const r = run(s, "complete", { semenBullId: "bull-2" });
    expect(unmark(r.breeding!)).toEqual({ date: TODAY, type: "timedAI", semenBullId: "bull-2", bullEarTag: "Jaguar" });
    expect(r.breeding!.id.startsWith("local:")).toBe(true);
    expect(r.breeding!.localOpId).toBe("op-1");
  });

  it("insemination without a pick: the session's first bull, by its code", () => {
    const s = session({ kind: "insemination", semenBullIds: ["bull-1", "bull-2"] });
    const r = run(s, "complete", {});
    expect(r.breeding).toMatchObject({ semenBullId: "bull-1", bullEarTag: "NEL-1" });
  });
});

describe("localApply · skip", () => {
  it("skips with the trimmed note", () => {
    const r = run(session({}), "skip", { notes: " mancou " });
    expect(unmark(r.entry)).toEqual({ earTag: "101", outcome: "skipped", notes: "mancou" });
    expect(r.entry).toMatchObject({ pending: true, localOpId: "op-1" });
    expect(r.treatments).toEqual([]);
  });
});

describe("localApply · set-aside", () => {
  it("rejected with a weight: the refugo and its weighing", () => {
    const s = session({ kind: "sale", weighing: true, pricePerArroba: 300 });
    const r = run(s, "set-aside", { list: "rejected", weightKg: 380, notes: "" });
    expect(unmark(r.entry)).toEqual({ earTag: "101", outcome: "rejected", weightKg: 380 });
    expect(unmark(r.weighing!)).toEqual({ date: TODAY, weightKg: 380 });
    expect(r.weighing!.id).toBeLessThan(0);
    expect(r.weighing!.localOpId).toBe("op-1");
    expect(r.animal).toBeUndefined();
  });
});

describe("localApply · baixa", () => {
  it("skips the pass with the baixa note and takes the animal out of the herd", () => {
    const body = { reason: "death", date: "2026-05-03", notes: "quebrou a perna" };
    const r = run(session({}), "baixa", body);
    expect(unmark(r.entry)).toEqual({
      earTag: "101",
      outcome: "skipped",
      notes: baixaPassNote("death", "quebrou a perna"),
    });
    expect(r.animal).toEqual({
      earTag: "101",
      active: false,
      lotId: "lot-a",
      inactiveReason: "death",
      inactiveDate: "2026-05-03",
      inactiveNotes: "quebrou a perna",
    });
  });
});

describe("localApply · other kinds", () => {
  it("leaves reopen, close, carcass-yield and start to the store", () => {
    for (const kind of ["reopen", "close", "carcass-yield", "start"] as const) {
      expect(localApply(op(kind, {}), { session: session({}), animal, semenBulls, today: TODAY })).toBeNull();
    }
  });
});

describe("localStartSession", () => {
  it("builds the pending session the server would start, with the op's id", () => {
    const start: OutboxOp = {
      ...op("start", {
        date: TODAY,
        kind: "insemination",
        earTags: ["101", "102"],
        weighing: false,
        semenBullIds: ["bull-1", "bull-1", "bull-2"],
        notes: "lote das vacas",
      }),
      sessionId: "5f0c2b8e-8d2a-4c61-9d3e-2f1a7b6c9e10",
      earTag: undefined,
    };
    expect(localStartSession(start)).toEqual({
      id: "5f0c2b8e-8d2a-4c61-9d3e-2f1a7b6c9e10",
      name: "Inseminação",
      date: TODAY,
      status: "open",
      kind: "insemination",
      weighing: false,
      animals: [
        { earTag: "101", outcome: "pending" },
        { earTag: "102", outcome: "pending" },
      ],
      semenBullIds: ["bull-1", "bull-2"],
      notes: "lote das vacas",
      pending: true,
    });
  });
});
