/**
 * deleteSession: soft-deletes a manejo and puts the herd back where it was, or
 * refuses in one piece when a later manejo depends on it.
 *
 * The db mock is the chainable stub deleteTreatments.test.ts established:
 * selects answer from a queued list of rows, updates record the columns set.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** Rows each `select()` resolves to, in call order. */
    selectResults: [] as Record<string, unknown>[][],
    /** Columns of every `update().set()` call. */
    updates: [] as Record<string, unknown>[],
    /** One entry per `delete()` issued. */
    deletes: [] as string[],
  },
}));

function selectBuilder() {
  const rows = state.selectResults.shift() ?? [];
  const builder = {
    from: () => builder,
    innerJoin: () => builder,
    where: () => builder,
    orderBy: () => builder,
    limit: () => builder,
    then: (resolve: (value: Record<string, unknown>[]) => unknown) => resolve(rows),
  };
  return builder;
}

vi.mock("@/lib/db", () => ({
  db: {
    transaction: (run: (tx: unknown) => unknown) =>
      Promise.resolve(
        run({
          select: selectBuilder,
          update: () => {
            const builder = {
              set(columns: Record<string, unknown>) {
                state.updates.push(columns);
                return builder;
              },
              where: () => builder,
              returning: () => Promise.resolve([]),
              then: (resolve: (value: unknown) => unknown) => resolve(undefined),
            };
            return builder;
          },
          delete: () => ({
            where: () => {
              state.deletes.push("delete");
              return Promise.resolve(undefined);
            },
          }),
        })
      ),
  },
}));

import { DeleteSessionUseCase } from "../Delete.useCase";

beforeEach(() => {
  state.selectResults = [];
  state.updates = [];
  state.deletes = [];
});

const SALE_ROW = {
  id: "s-1",
  farmId: 7,
  name: "Venda",
  date: "2026-05-12",
  status: "closed",
  kind: "sale",
  weighing: true,
  destinationLotId: null,
  counterparty: "Frigorífico",
  pricePerArroba: 320,
  carcassYieldPct: 52,
  totalAmountBrl: null,
  notes: null,
  planType: null,
  planName: null,
  planWithdrawalDays: null,
  planDose: null,
  planResponsible: null,
  planCostBrl: null,
  planNextDate: null,
  planNotes: null,
  deletedAt: null,
};

describe("deleteSession", () => {
  it("stamps the session and puts the sold animals back", async () => {
    state.selectResults = [
      [SALE_ROW],
      [
        {
          earTag: "B-001",
          animalId: "a-1",
          outcome: "done",
          previousLotId: "lot-3",
          createdAnimal: false,
          treatmentId: null,
          boosterId: null,
          weighingId: 11,
          lotId: "lot-3",
          active: false,
        },
      ],
      [{ id: "lot-3" }],
    ];

    const result = await new DeleteSessionUseCase().run({ farmId: 7, id: "s-1" });

    expect(result).toEqual({
      id: "s-1",
      treatmentIds: [],
      weighedEarTags: ["B-001"],
      restored: [{ earTag: "B-001", lotId: "lot-3", active: true }],
      removedEarTags: [],
    });
    expect(state.updates.some((u) => u.deletedAt instanceof Date)).toBe(true);
    expect(state.updates.some((u) => u.active === true && u.inactiveReason === null)).toBe(true);
    expect(state.deletes).toEqual([]);
  });

  it("refuses in one piece and writes nothing when an animal moved on", async () => {
    state.selectResults = [
      [SALE_ROW],
      [
        {
          earTag: "B-001",
          animalId: "a-1",
          outcome: "done",
          previousLotId: "lot-3",
          createdAnimal: false,
          treatmentId: null,
          boosterId: null,
          weighingId: null,
          // The sold animal is active again: something reversed it already.
          lotId: "lot-3",
          active: true,
        },
      ],
      [{ id: "lot-3" }],
    ];

    const result = await new DeleteSessionUseCase().run({ farmId: 7, id: "s-1" });

    expect(result).toEqual({ blocked: [{ earTag: "B-001", reason: "not_sold" }] });
    expect(state.updates).toEqual([]);
    expect(state.deletes).toEqual([]);
  });

  it("does not touch a session of another farm", async () => {
    state.selectResults = [[]];

    const result = await new DeleteSessionUseCase().run({ farmId: 7, id: "s-9" });

    expect(result).toBe("session_not_found");
    expect(state.updates).toEqual([]);
  });
});
