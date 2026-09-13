import { describe, expect, it } from "vitest";
import { revertDecision, type AnimalFacts, type RevertSession } from "@/lib/domain/manejoRevert";
import type { ManejoSessionAnimal } from "@/lib/types";

function pass(overrides: Partial<ManejoSessionAnimal> = {}): ManejoSessionAnimal {
  return { earTag: "B-001", outcome: "done", ...overrides };
}

function session(overrides: Partial<RevertSession> = {}): RevertSession {
  return { kind: "health", animals: [pass()], ...overrides };
}

function facts(overrides: Partial<AnimalFacts> = {}): AnimalFacts {
  return {
    earTag: "B-001",
    lotId: "lot-3",
    active: true,
    hasForeignHistory: false,
    originLotMissing: false,
    hasDiagnosis: false,
    ...overrides,
  };
}

describe("revertDecision", () => {
  it("stamps the treatments and the booster of a sanitária", () => {
    const result = revertDecision(
      session({ animals: [pass({ treatmentId: "t-1", boosterId: "t-2" })] }),
      [facts()]
    );

    expect(result.blocked).toEqual([]);
    expect(result.plan).toEqual({
      treatmentIds: ["t-1", "t-2"],
      weighingIds: [],
      restore: [],
      removeEarTags: [],
      breedingIds: [],
    });
  });

  it("never blocks a sanitária, whatever happened since", () => {
    const result = revertDecision(session({ animals: [pass({ treatmentId: "t-1" })] }), [
      facts({ lotId: "lot-9", active: false, hasForeignHistory: true, hasDiagnosis: true }),
    ]);

    expect(result.blocked).toEqual([]);
    expect(result.plan.treatmentIds).toEqual(["t-1"]);
  });

  it("puts a transferência back in the lote it came from", () => {
    const result = revertDecision(
      session({
        kind: "transfer",
        destinationLotId: "lot-4",
        animals: [pass({ previousLotId: "lot-3" })],
      }),
      [facts({ lotId: "lot-4" })]
    );

    expect(result.blocked).toEqual([]);
    expect(result.plan.restore).toEqual([{ earTag: "B-001", lotId: "lot-3", reactivate: false }]);
  });

  it("blocks a transferência when the animal is no longer in the destination lote", () => {
    const result = revertDecision(
      session({
        kind: "transfer",
        destinationLotId: "lot-4",
        animals: [pass({ previousLotId: "lot-3" })],
      }),
      [facts({ lotId: "lot-7" })]
    );

    expect(result.blocked).toEqual([{ earTag: "B-001", reason: "moved_lot" }]);
    expect(result.plan.restore).toEqual([]);
  });

  it("brings a venda back to the active herd, in its old lote", () => {
    const result = revertDecision(
      session({ kind: "sale", animals: [pass({ previousLotId: "lot-3" })] }),
      [facts({ active: false, lotId: "lot-3" })]
    );

    expect(result.blocked).toEqual([]);
    expect(result.plan.restore).toEqual([{ earTag: "B-001", lotId: "lot-3", reactivate: true }]);
  });

  it("blocks a venda when the animal is active again", () => {
    const result = revertDecision(
      session({ kind: "sale", animals: [pass({ previousLotId: "lot-3" })] }),
      [facts({ active: true })]
    );

    expect(result.blocked).toEqual([{ earTag: "B-001", reason: "not_sold" }]);
  });

  it("removes the animals an entrada registered", () => {
    const result = revertDecision(
      session({ kind: "entry", animals: [pass({ createdAnimal: true })] }),
      [facts()]
    );

    expect(result.blocked).toEqual([]);
    expect(result.plan.removeEarTags).toEqual(["B-001"]);
  });

  it("blocks an entrada whose animal carries history from elsewhere", () => {
    const result = revertDecision(
      session({ kind: "entry", animals: [pass({ createdAnimal: true })] }),
      [facts({ hasForeignHistory: true })]
    );

    expect(result.blocked).toEqual([{ earTag: "B-001", reason: "has_history" }]);
    expect(result.plan.removeEarTags).toEqual([]);
  });

  it("blocks any kind when the lote of origin was deleted", () => {
    const result = revertDecision(
      session({
        kind: "transfer",
        destinationLotId: "lot-4",
        animals: [pass({ previousLotId: "lot-3" })],
      }),
      [facts({ lotId: "lot-4", originLotMissing: true })]
    );

    expect(result.blocked).toEqual([{ earTag: "B-001", reason: "origin_lot_gone" }]);
  });

  it("stamps the weighings of a pesagem and ignores the animals that did not pass", () => {
    const result = revertDecision(
      session({
        kind: "weighing",
        animals: [
          pass({ earTag: "B-001", weighingId: 11 }),
          pass({ earTag: "B-002", outcome: "skipped" }),
          pass({ earTag: "B-003", outcome: "pending" }),
        ],
      }),
      [facts({ earTag: "B-001" }), facts({ earTag: "B-002" }), facts({ earTag: "B-003" })]
    );

    expect(result.blocked).toEqual([]);
    expect(result.plan.weighingIds).toEqual([11]);
  });

  it("removes the coberturas an inseminação recorded and ignores the cows that did not pass", () => {
    const result = revertDecision(
      session({
        kind: "insemination",
        animals: [
          pass({ earTag: "B-001", breedingId: "b-1" }),
          pass({ earTag: "B-002", outcome: "skipped" }),
          pass({ earTag: "B-003", outcome: "pending" }),
        ],
      }),
      [facts({ earTag: "B-001" }), facts({ earTag: "B-002" }), facts({ earTag: "B-003" })]
    );

    expect(result.blocked).toEqual([]);
    expect(result.plan.breedingIds).toEqual(["b-1"]);
    expect(result.plan.restore).toEqual([]);
    expect(result.plan.removeEarTags).toEqual([]);
  });

  it("blocks an inseminação whose cobertura already has a diagnosis", () => {
    const result = revertDecision(
      session({
        kind: "insemination",
        animals: [
          pass({ earTag: "B-001", breedingId: "b-1" }),
          pass({ earTag: "B-002", breedingId: "b-2" }),
        ],
      }),
      [facts({ earTag: "B-001", hasDiagnosis: true }), facts({ earTag: "B-002" })]
    );

    // The cobertura names itself, so the client can offer to clear the diagnosis.
    expect(result.blocked).toStrictEqual([
      { earTag: "B-001", reason: "has_diagnosis", breedingId: "b-1" },
    ]);
    expect(result.plan).toEqual({
      treatmentIds: [],
      weighingIds: [],
      restore: [],
      removeEarTags: [],
      breedingIds: [],
    });
  });
});
