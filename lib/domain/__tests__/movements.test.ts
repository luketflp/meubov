import { describe, expect, it } from "vitest";
import {
  EXTERNAL,
  herdMovements,
  isMovementKind,
  predominantCategory,
  saleAmount,
  saleSummary,
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

  it("prices the carcass arrobas at the session's rendimento", () => {
    // 3901 kg × 48,5% ÷ 15 = 126,1323… @ × R$ 300 = R$ 37.839,70 (the romaneio).
    expect(saleAmount(3901, 300, 48.5)).toBeCloseTo(37839.7, 2);
  });

  it("matches the old live kg/30 math at the default 50% yield", () => {
    expect(saleAmount(510, 310, 50)).toBeCloseTo(saleAmount(510, 310), 6);
  });
});

describe("saleSummary", () => {
  const sold = (earTag: string, weightKg: number, amountBrl: number) =>
    entry({ earTag, weightKg, amountBrl });

  it("reproduces the frigorífico spreadsheet of the venda per arroba", () => {
    // 8 cabeças, 3901 kg, rend. 48,5%, R$ 300/@.
    const weights = [488, 487, 488, 487, 488, 487, 488, 488]; // 3901 kg
    const session = makeSession({
      pricePerArroba: 300,
      carcassYieldPct: 48.5,
      animals: weights.map((kg, i) =>
        sold(`BR-10${i}`, kg, saleAmount(kg, 300, 48.5))
      ),
    });
    const summary = saleSummary(session);
    expect(summary).not.toBeNull();
    expect(summary?.heads).toBe(8);
    expect(summary?.totalWeightKg).toBe(3901);
    expect(summary?.avgWeightKg).toBeCloseTo(487.63, 2);
    expect(summary?.avgLiveArrobas).toBeCloseTo(16.25, 2);
    expect(summary?.totalCarcassKg).toBeCloseTo(1891.985, 3);
    expect(summary?.totalCarcassArrobas).toBeCloseTo(126.1323, 3);
    expect(summary?.grossBrl).toBeCloseTo(37839.7, 2);
    expect(summary?.funruralBrl).toBeCloseTo(567.6, 1);
    expect(summary?.netBrl).toBeCloseTo(37272.1, 1);
    expect(summary?.grossPerHeadBrl).toBeCloseTo(4729.96, 2);
    expect(summary?.netPerHeadBrl).toBeCloseTo(4659.01, 2);
  });

  it("assumes the 50% yield on per-arroba sessions that never set one", () => {
    const session = makeSession({
      pricePerArroba: 310,
      animals: [sold("BR-001", 510, saleAmount(510, 310))],
    });
    const summary = saleSummary(session);
    expect(summary?.carcassYieldPct).toBe(50);
    expect(summary?.totalCarcassKg).toBe(255);
  });

  it("keeps the closed-price sale without carcass figures", () => {
    const session = makeSession({
      totalAmountBrl: 9800,
      animals: [entry({ earTag: "BR-001" }), entry({ earTag: "BR-002" })],
    });
    const summary = saleSummary(session);
    expect(summary?.heads).toBe(2);
    expect(summary?.weighedHeads).toBe(0);
    expect(summary?.totalWeightKg).toBeNull();
    expect(summary?.carcassYieldPct).toBeNull();
    expect(summary?.totalCarcassArrobas).toBeNull();
    expect(summary?.grossBrl).toBe(9800);
    expect(summary?.funruralBrl).toBeCloseTo(147, 6);
    expect(summary?.grossPerHeadBrl).toBe(4900);
  });

  it("returns null while nobody passed, and for kinds that are not a sale", () => {
    expect(saleSummary(makeSession({ animals: [entry({ outcome: "pending" })] }))).toBeNull();
    expect(
      saleSummary(makeSession({ kind: "transfer", animals: [entry()] }))
    ).toBeNull();
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
