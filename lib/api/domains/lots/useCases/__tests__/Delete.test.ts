/** removeLot: an empty lote goes; purge takes its animals and the manejos left without any. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    selectResults: [] as unknown[][],
    updates: [] as Record<string, unknown>[],
    inserts: [] as unknown[],
    deletes: 0,
    returning: [] as unknown[][],
  },
}));

vi.mock("@/lib/db", async () => ({
  db: (await import("@/lib/api/__tests__/dbStub")).createDbStub(state),
}));

import { RemoveLotUseCase } from "../Delete.useCase";

const lot = {
  id: "lot-9",
  farmId: 1,
  name: "Teste",
  needsReview: false,
  deletedAt: null,
  grass: null,
  hectares: null,
  boundary: null,
};
const herd = [{ id: "a-1" }, { id: "a-2" }];
const session = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  status: "closed",
  pricePerArroba: null,
  totalAmountBrl: null,
  planCostBrl: null,
  ...extra,
});

beforeEach(() => {
  state.selectResults = [];
  state.updates = [];
  state.deletes = 0;
  state.returning = [];
});

describe("removeLot", () => {
  it("refuses a lote that still holds animals unless asked to purge", async () => {
    state.selectResults = [[lot], herd];
    const result = await new RemoveLotUseCase().run({ farmId: 1, id: "lot-9" });
    expect(result).toBe("lot_occupied");
    expect(state.deletes).toBe(0);
    expect(state.updates).toEqual([]);
  });

  it("refuses the purge while one of its animals sits in an open manejo", async () => {
    state.selectResults = [[lot], herd, [], [session("s-1", { status: "open" })]];
    const result = await new RemoveLotUseCase().run({
      farmId: 1,
      id: "lot-9",
      purge: { canEditFinance: true },
    });
    expect(result).toBe("lot_occupied");
    expect(state.deletes).toBe(0);
    expect(state.updates).toEqual([]);
  });

  it("asks for Financeiro before emptying a manejo that carries money", async () => {
    state.selectResults = [[lot], herd, [], [session("s-2", { totalAmountBrl: 18000 })], []];
    const result = await new RemoveLotUseCase().run({
      farmId: 1,
      id: "lot-9",
      purge: { canEditFinance: false },
    });
    expect(result).toBe("finance_required");
    expect(state.deletes).toBe(0);
    expect(state.updates).toEqual([]);
  });

  it("deletes the animals, then only the manejos they leave empty, then the lote", async () => {
    // s-1 keeps another animal (and its money stays put); s-2 had only these
    // two, so it comes once per pass and must be stamped once.
    state.selectResults = [
      [lot],
      herd,
      [],
      [session("s-1", { totalAmountBrl: 9000 }), session("s-2"), session("s-2")],
      [{ id: "s-1" }],
      [],
    ];
    state.returning = [[{ ...lot, deletedAt: new Date("2026-10-29T12:00:00Z") }]];
    const result = await new RemoveLotUseCase().run({
      farmId: 1,
      id: "lot-9",
      purge: { canEditFinance: false },
    });
    expect(result).toMatchObject({ lot: { id: "lot-9", deletedAt: "2026-10-29T12:00:00.000Z" } });
    expect(state.deletes).toBe(1);
    expect(state.updates).toEqual([
      { deletedAt: expect.any(Date) },
      { movementId: null },
      { deletedAt: expect.any(Date) },
    ]);
  });
});
