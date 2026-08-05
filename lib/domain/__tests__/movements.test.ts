import { describe, expect, it } from "vitest";
import {
  EXTERNAL,
  herdMovements,
  isMovementKind,
  predominantCategory,
  saleAmount,
  sessionToMovement,
} from "@/lib/domain/movements";
import { KG_PER_ARROBA } from "@/lib/domain/weights";
import type { ManejoSession, ManejoSessionAnimal, Movement } from "@/lib/types";
import { makeAnimal } from "./fixtures";

const LOT_NAMES = new Map([
  ["lot-1", "Lote do Rio"],
  ["lot-2", "Invernada Alta"],
]);

function entry(overrides: Partial<ManejoSessionAnimal> = {}): ManejoSessionAnimal {
  return { earTag: "BR-001", outcome: "done", ...overrides };
}

function makeSession(overrides: Partial<ManejoSession> = {}): ManejoSession {
  return {
    id: "sess-1",
    name: "Venda",
    date: "2026-08-04",
    status: "closed",
    kind: "sale",
    weighing: true,
    animals: [],
    ...overrides,
  };
}

const herd = [
  makeAnimal({ earTag: "BR-001", category: "steer", lotId: "lot-1" }),
  makeAnimal({ earTag: "BR-002", category: "steer", lotId: "lot-1" }),
  makeAnimal({ earTag: "BR-003", category: "cow", lotId: "lot-1" }),
];
const byEarTag = new Map(herd.map((a) => [a.earTag, a]));

describe("isMovementKind", () => {
  it("separates the kinds that move the herd from the ones that only record it", () => {
    expect(isMovementKind("transfer")).toBe(true);
    expect(isMovementKind("sale")).toBe(true);
    expect(isMovementKind("entry")).toBe(true);
    expect(isMovementKind("health")).toBe(false);
    expect(isMovementKind("weighing")).toBe(false);
  });
});

describe("saleAmount", () => {
  it("prices the animal by its weight in arrobas", () => {
    expect(saleAmount(KG_PER_ARROBA * 17, 310)).toBeCloseTo(17 * 310, 6);
  });
});

describe("predominantCategory", () => {
  it("returns the most frequent category", () => {
    expect(predominantCategory(herd)).toBe("steer");
  });

  it("returns undefined without animals", () => {
    expect(predominantCategory([])).toBeUndefined();
  });
});

describe("sessionToMovement", () => {
  it("ignores the kinds that do not move the herd", () => {
    const health = makeSession({ kind: "health", animals: [entry()] });
    expect(sessionToMovement(health, byEarTag, LOT_NAMES)).toBeNull();
  });

  it("ignores a session where nobody passed the chute yet", () => {
    const open = makeSession({ animals: [entry({ outcome: "pending" })] });
    expect(sessionToMovement(open, byEarTag, LOT_NAMES)).toBeNull();
  });

  it("derives head count and category from the handled animals only", () => {
    const session = makeSession({
      kind: "transfer",
      destinationLotId: "lot-2",
      animals: [
        entry({ earTag: "BR-001", previousLotId: "lot-1" }),
        entry({ earTag: "BR-002", previousLotId: "lot-1" }),
        entry({ earTag: "BR-003", outcome: "skipped" }),
      ],
    });
    expect(sessionToMovement(session, byEarTag, LOT_NAMES)).toMatchObject({
      type: "transfer",
      quantity: 2,
      category: "steer",
      origin: "Lote do Rio",
      destination: "Invernada Alta",
      amountBrl: undefined,
    });
  });

  it("sums the per-animal values of a sale priced per arroba", () => {
    const session = makeSession({
      counterparty: "Frigorífico Boi Forte",
      pricePerArroba: 310,
      animals: [
        entry({ earTag: "BR-001", weightKg: 510, amountBrl: 5270, previousLotId: "lot-1" }),
        entry({ earTag: "BR-002", weightKg: 480, amountBrl: 4960, previousLotId: "lot-1" }),
      ],
    });
    expect(sessionToMovement(session, byEarTag, LOT_NAMES)).toMatchObject({
      type: "sale",
      quantity: 2,
      origin: "Lote do Rio",
      destination: "Frigorífico Boi Forte",
      amountBrl: 10230,
    });
  });

  it("uses the closed price when the batch was sold as one lot", () => {
    const session = makeSession({
      totalAmountBrl: 9800,
      animals: [
        entry({ earTag: "BR-001", previousLotId: "lot-1" }),
        entry({ earTag: "BR-002", previousLotId: "lot-1" }),
      ],
    });
    expect(sessionToMovement(session, byEarTag, LOT_NAMES)?.amountBrl).toBe(9800);
  });

  it("leaves the value out when the sale was never priced", () => {
    const session = makeSession({ animals: [entry({ previousLotId: "lot-1" })] });
    expect(sessionToMovement(session, byEarTag, LOT_NAMES)?.amountBrl).toBeUndefined();
  });

  it("reads an entry as a purchase coming from outside the farm", () => {
    const session = makeSession({
      kind: "entry",
      destinationLotId: "lot-2",
      totalAmountBrl: 38000,
      animals: [entry({ earTag: "BR-001", createdAnimal: true })],
    });
    expect(sessionToMovement(session, byEarTag, LOT_NAMES)).toMatchObject({
      type: "purchase",
      origin: EXTERNAL,
      destination: "Invernada Alta",
      amountBrl: 38000,
    });
  });

  it("falls back to Externo when no counterparty was named", () => {
    const session = makeSession({ animals: [entry({ previousLotId: "lot-1" })] });
    expect(sessionToMovement(session, byEarTag, LOT_NAMES)?.destination).toBe(EXTERNAL);
  });
});

describe("herdMovements", () => {
  const legacy: Movement = {
    id: "mov-legacy",
    type: "sale",
    date: "2026-06-02",
    quantity: 3,
    category: "calf",
    origin: "Piquete Norte",
    destination: EXTERNAL,
    amountBrl: 8400,
  };

  it("merges legacy rows with the derived ones, oldest first", () => {
    const sessions = [
      makeSession({
        id: "sess-new",
        date: "2026-08-04",
        totalAmountBrl: 5000,
        animals: [entry({ previousLotId: "lot-1" })],
      }),
      makeSession({ id: "sess-health", kind: "health", animals: [entry()] }),
    ];
    const ledger = herdMovements([legacy], sessions, herd, LOT_NAMES);
    expect(ledger.map((m) => m.id)).toEqual(["mov-legacy", "sess-new"]);
  });
});
