/**
 * completeAnimal, inseminação branch: a pass takes one dose of the bull under
 * its row lock and records the IATF cobertura on the cow, or refuses before the
 * first write when that bull has no dose left.
 *
 * Same chainable db stub as Delete.test.ts: selects answer from a queued list
 * of rows, inserts record the values and echo them from returning(), updates
 * record the columns set. The stock lock is stubbed at its seam so the test
 * holds the dose counts in hand.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state, lockBullStock } = vi.hoisted(() => ({
  state: {
    /** Rows each `select()` resolves to, in call order. */
    selectResults: [] as Record<string, unknown>[][],
    /** Values of every `insert().values()` call. */
    inserts: [] as Record<string, unknown>[],
    /** Columns of every `update().set()` call. */
    updates: [] as Record<string, unknown>[],
  },
  lockBullStock: vi.fn(),
}));

function selectBuilder() {
  const rows = state.selectResults.shift() ?? [];
  const builder = {
    from: () => builder,
    where: () => builder,
    for: () => builder,
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
          insert: () => ({
            values: (values: Record<string, unknown>) => {
              state.inserts.push(values);
              return { returning: () => Promise.resolve([values]) };
            },
          }),
          update: () => {
            let columns: Record<string, unknown> = {};
            const builder = {
              set(set: Record<string, unknown>) {
                columns = set;
                state.updates.push(set);
                return builder;
              },
              where: () => builder,
              returning: () => Promise.resolve([{ ...ENTRY_ROW, ...columns }]),
            };
            return builder;
          },
        })
      ),
  },
}));

vi.mock("@/lib/api/domains/semen/_shared/stock", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/domains/semen/_shared/stock")>()),
  lockBullStock,
}));

import { CompleteAnimalUseCase } from "../CompleteAnimal.useCase";

const SESSION_ROW = {
  id: "s-1",
  farmId: 7,
  name: "Inseminação",
  date: "2026-09-01",
  status: "open",
  kind: "insemination",
  weighing: false,
  destinationLotId: null,
  counterparty: null,
  pricePerArroba: null,
  carcassYieldPct: null,
  totalAmountBrl: null,
  semenBullId: "bull-1",
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

const ENTRY_ROW = {
  sessionId: "s-1",
  animalId: "a-1",
  position: 0,
  outcome: "pending",
  weightKg: null,
  notes: null,
  amountBrl: null,
  previousLotId: null,
  createdAnimal: false,
  treatmentId: null,
  boosterId: null,
  weighingId: null,
  breedingId: null,
};

const BULL_ROW = { id: "bull-1", farmId: 7, name: "Tufão da Serra", code: null, breed: null, central: null };

/** lockEntry's three reads: the session, the animal, its chute entry. */
const passRows = () => [[SESSION_ROW], [{ id: "a-1", earTag: "V-01", lotId: "lot-1" }], [ENTRY_ROW]];

beforeEach(() => {
  state.selectResults = [];
  state.inserts = [];
  state.updates = [];
  lockBullStock.mockReset();
});

describe("completeAnimal — inseminação", () => {
  it("refuses the pass and writes nothing when the bull has no dose left", async () => {
    state.selectResults = passRows();
    lockBullStock.mockResolvedValue({ bull: BULL_ROW, bought: 10, used: 10, left: 0 });

    const result = await new CompleteAnimalUseCase().run({
      farmId: 7,
      sessionId: "s-1",
      animalId: "a-1",
      data: {},
    });

    expect(result).toEqual({ conflict: "out_of_stock" });
    expect(state.inserts).toEqual([]);
    expect(state.updates).toEqual([]);
  });

  it("records the cobertura with the bull picked at the chute", async () => {
    state.selectResults = passRows();
    lockBullStock.mockResolvedValue({
      bull: { ...BULL_ROW, id: "bull-2", name: "Faraó", code: "NEL-4471" },
      bought: 30,
      used: 12,
      left: 18,
    });

    const result = await new CompleteAnimalUseCase().run({
      farmId: 7,
      sessionId: "s-1",
      animalId: "a-1",
      data: { semenBullId: "bull-2", notes: " cio fraco " },
    });

    expect(lockBullStock).toHaveBeenCalledWith(expect.anything(), 7, "bull-2");
    expect(state.inserts).toHaveLength(1);
    const breeding = state.inserts[0];
    expect(breeding).toMatchObject({
      animalId: "a-1",
      date: "2026-09-01",
      type: "timedAI",
      bullEarTag: "NEL-4471",
      semenBullId: "bull-2",
    });
    expect(state.updates).toEqual([
      expect.objectContaining({ outcome: "done", notes: "cio fraco", breedingId: breeding.id }),
    ]);
    expect(result).toMatchObject({
      entry: { earTag: "V-01", outcome: "done", breedingId: breeding.id },
      treatments: [],
      breeding: {
        id: breeding.id,
        date: "2026-09-01",
        type: "timedAI",
        bullEarTag: "NEL-4471",
        semenBullId: "bull-2",
      },
    });
  });

  it("falls back to the touro principal, named by the bull when it has no code", async () => {
    state.selectResults = passRows();
    lockBullStock.mockResolvedValue({ bull: BULL_ROW, bought: 10, used: 9, left: 1 });

    const result = await new CompleteAnimalUseCase().run({
      farmId: 7,
      sessionId: "s-1",
      animalId: "a-1",
      data: {},
    });

    expect(lockBullStock).toHaveBeenCalledWith(expect.anything(), 7, "bull-1");
    expect(state.inserts[0]).toMatchObject({ bullEarTag: "Tufão da Serra", semenBullId: "bull-1" });
    expect(result).toMatchObject({ breeding: { semenBullId: "bull-1" } });
  });

  it("refuses a bull that is not of this farm", async () => {
    state.selectResults = passRows();
    lockBullStock.mockResolvedValue(null);

    const result = await new CompleteAnimalUseCase().run({
      farmId: 7,
      sessionId: "s-1",
      animalId: "a-1",
      data: { semenBullId: "bull-9" },
    });

    expect(result).toBe("bull_not_found");
    expect(state.inserts).toEqual([]);
    expect(state.updates).toEqual([]);
  });
});
