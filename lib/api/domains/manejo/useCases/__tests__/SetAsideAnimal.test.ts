/**
 * setAsideAnimal: a venda's animal that passed the chute but was not sold —
 * sent to the refugo (stays in the herd) or to the dúvida (decided before the
 * venda closes). The scale reading, when the venda weighs, is kept as a
 * pesagem the same way a boiada pass keeps it; the animal itself never moves.
 *
 * Same chainable db stub as ReopenAnimal.test.ts: selects answer from a queued
 * list of rows, inserts record the values and echo them from returning() with
 * a fixed id, and every write lands in one log, in call order, with its table.
 */
import { getTableName, type Table } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** Rows each `select()` resolves to, in call order. */
    selectResults: [] as Record<string, unknown>[][],
    /** Every write issued: `insert <table>` or `update <table>`, in call order. */
    writes: [] as string[],
    /** Columns of every `update().set()` call. */
    updates: [] as Record<string, unknown>[],
  },
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
          insert: (table: Table) => ({
            values: (values: Record<string, unknown>) => ({
              returning: () => {
                state.writes.push(`insert ${getTableName(table)}`);
                return Promise.resolve([{ id: 99, ...values }]);
              },
            }),
          }),
          update: (table: Table) => {
            state.writes.push(`update ${getTableName(table)}`);
            let columns: Record<string, unknown> = {};
            const builder = {
              set(set: Record<string, unknown>) {
                columns = set;
                state.updates.push(set);
                return builder;
              },
              where: () => builder,
              returning: () => Promise.resolve([{ ...PENDING_ENTRY, ...columns }]),
            };
            return builder;
          },
        })
      ),
  },
}));

import { SetAsideAnimalUseCase } from "../SetAsideAnimal.useCase";

const SESSION_ROW = {
  id: "s-1",
  farmId: 7,
  date: "2026-09-23",
  status: "open",
  kind: "sale",
  weighing: true,
};

const PENDING_ENTRY = {
  sessionId: "s-1",
  animalId: "a-1",
  position: 0,
  outcome: "pending",
  weightKg: null,
  notes: null,
  amountBrl: null,
  carcassYieldPct: null,
  previousLotId: null,
  createdAnimal: false,
  treatmentId: null,
  boosterId: null,
  weighingId: null,
  breedingId: null,
};

const ACTIVE_ANIMAL = { id: "a-1", earTag: "V-01", lotId: "lot-1", active: true };

/** lockEntry's three reads: the session, the animal, its chute entry. */
const passRows = (
  session: Record<string, unknown> = SESSION_ROW,
  animal: Record<string, unknown> = ACTIVE_ANIMAL,
  entry: Record<string, unknown> = PENDING_ENTRY
) => [[session], [animal], [entry]];

beforeEach(() => {
  state.selectResults = [];
  state.writes = [];
  state.updates = [];
});

describe("setAsideAnimal", () => {
  it("sends an animal to the refugo, keeping the weight it read at the brete", async () => {
    state.selectResults = passRows();

    const result = await new SetAsideAnimalUseCase().run({
      farmId: 7,
      sessionId: "s-1",
      animalId: "a-1",
      input: { list: "rejected", weightKg: 402, notes: " leve " },
    });

    expect(state.writes).toEqual(["insert weighings", "update manejo_session_animals"]);
    expect(state.updates.at(-1)).toMatchObject({
      outcome: "rejected",
      weightKg: 402,
      weighingId: 99,
      notes: "leve",
    });
    expect(result).toMatchObject({
      entry: { earTag: "V-01", outcome: "rejected" },
      weighing: { date: "2026-09-23", weightKg: 402 },
    });
  });

  it("holds an animal as a dúvida without weighing it", async () => {
    state.selectResults = passRows();

    const result = await new SetAsideAnimalUseCase().run({
      farmId: 7,
      sessionId: "s-1",
      animalId: "a-1",
      input: { list: "held" },
    });

    expect(state.writes).toEqual(["update manejo_session_animals"]);
    expect(state.updates.at(-1)).toMatchObject({
      outcome: "held",
      weightKg: null,
      weighingId: null,
      notes: null,
    });
    expect(result).toMatchObject({ entry: { earTag: "V-01", outcome: "held" } });
  });

  it("refuses a session that isn't a venda, and writes nothing", async () => {
    state.selectResults = passRows({ ...SESSION_ROW, kind: "health" });

    const result = await new SetAsideAnimalUseCase().run({
      farmId: 7,
      sessionId: "s-1",
      animalId: "a-1",
      input: { list: "held" },
    });

    expect(result).toEqual({ conflict: "entry_not_actionable" });
    expect(state.writes).toEqual([]);
  });

  it("refuses an entry already completed", async () => {
    state.selectResults = passRows(SESSION_ROW, ACTIVE_ANIMAL, { ...PENDING_ENTRY, outcome: "done" });

    const result = await new SetAsideAnimalUseCase().run({
      farmId: 7,
      sessionId: "s-1",
      animalId: "a-1",
      input: { list: "held" },
    });

    expect(result).toEqual({ conflict: "entry_not_actionable" });
    expect(state.writes).toEqual([]);
  });

  it("refuses an animal that already had a baixa", async () => {
    state.selectResults = passRows(SESSION_ROW, { ...ACTIVE_ANIMAL, active: false });

    const result = await new SetAsideAnimalUseCase().run({
      farmId: 7,
      sessionId: "s-1",
      animalId: "a-1",
      input: { list: "held" },
    });

    expect(result).toEqual({ conflict: "animal_inactive" });
    expect(state.writes).toEqual([]);
  });
});
