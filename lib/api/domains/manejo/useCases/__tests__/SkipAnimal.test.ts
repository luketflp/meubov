/**
 * skipAnimal: the animal did not pass the chute. With `force`, a pass another
 * device already wrote is undone first, in the same transaction, and the skip
 * is written over it.
 *
 * Same chainable db stub as ReopenAnimal.test.ts: selects answer from a queued
 * list of rows, and every write lands in one log, in call order, with its table.
 */
import { getTableName, type Table } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** Rows each `select()` resolves to, in call order. */
    selectResults: [] as Record<string, unknown>[][],
    /** Every write issued: `update <table>` or `delete <table>`, in call order. */
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
          delete: (table: Table) => ({
            where: () => {
              state.writes.push(`delete ${getTableName(table)}`);
              return Promise.resolve(undefined);
            },
          }),
        })
      ),
  },
}));

import { SkipAnimalUseCase } from "../SkipAnimal.useCase";

const SESSION_ROW = { id: "s-1", farmId: 7, date: "2026-09-25", status: "open", kind: "health", weighing: false };

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

/** Another phone vaccinated this animal first. */
const DONE_ENTRY = { ...PENDING_ENTRY, outcome: "done", treatmentId: "t-1" };

const ANIMAL = { id: "a-1", earTag: "V-01", lotId: "lot-1", active: true };

const run = (force?: boolean) =>
  new SkipAnimalUseCase().run({ farmId: 7, sessionId: "s-1", animalId: "a-1", notes: " mancando ", force });

beforeEach(() => {
  state.selectResults = [];
  state.writes = [];
  state.updates = [];
});

describe("skipAnimal", () => {
  it("skips a pending animal with its note", async () => {
    state.selectResults = [[SESSION_ROW], [ANIMAL], [PENDING_ENTRY]];

    const result = await run();

    expect(state.writes).toEqual(["update manejo_session_animals"]);
    expect(state.updates[0]).toEqual({ outcome: "skipped", notes: "mancando" });
    expect(result).toMatchObject({ earTag: "V-01", outcome: "skipped", notes: "mancando" });
  });

  it("without force a done entry → entry_not_actionable", async () => {
    state.selectResults = [[SESSION_ROW], [ANIMAL], [DONE_ENTRY]];

    expect(await run()).toEqual({
      conflict: "entry_not_actionable",
      entry: expect.objectContaining({ earTag: "V-01", outcome: "done", treatmentId: "t-1" }),
    });
    expect(state.writes).toEqual([]);
  });

  it("force on a done entry reverts then applies", async () => {
    state.selectResults = [[SESSION_ROW], [ANIMAL], [DONE_ENTRY]];

    const result = await run(true);

    expect(state.writes).toEqual([
      "update manejo_session_animals",
      "delete treatments",
      "update manejo_session_animals",
    ]);
    expect(state.updates[0]).toMatchObject({ outcome: "pending", treatmentId: null });
    expect(state.updates[1]).toEqual({ outcome: "skipped", notes: "mancando" });
    expect(result).toMatchObject({ earTag: "V-01", outcome: "skipped" });
  });

  it("force on a closed session → session_closed", async () => {
    state.selectResults = [[{ ...SESSION_ROW, status: "closed" }], [ANIMAL], [DONE_ENTRY]];

    expect(await run(true)).toEqual({
      conflict: "session_closed",
      entry: expect.objectContaining({ earTag: "V-01", outcome: "done" }),
    });
    expect(state.writes).toEqual([]);
  });

  it("force keeps a diagnosed cobertura: has_diagnosis, nothing written", async () => {
    state.selectResults = [
      [{ ...SESSION_ROW, kind: "insemination" }],
      [ANIMAL],
      [{ ...DONE_ENTRY, treatmentId: null, breedingId: "br-1" }],
      [{ id: "br-1" }],
      [{ breedingId: "br-1", result: "open" }],
    ];

    expect(await run(true)).toEqual({ conflict: "has_diagnosis", breedingId: "br-1" });
    expect(state.writes).toEqual([]);
  });
});
