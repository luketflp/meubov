/**
 * reopenAnimal, inseminação branch: undoing a pass deletes the cobertura it
 * recorded, so the dose goes back to the bull's stock. A cobertura the
 * ultrassom already called prenhe or vazia refuses the undo before the first
 * write, naming the cobertura so the client can offer to clear the diagnosis;
 * an exam recorded as pending still awaits a diagnosis and goes with it.
 *
 * Same chainable db stub as Delete.test.ts: selects answer from a queued list
 * of rows and record their table and row lock, and every write lands in one
 * log, in call order, with its table.
 */
import { getTableName, type Table } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** Rows each `select()` resolves to, in call order. */
    selectResults: [] as Record<string, unknown>[][],
    /** Table and row lock of every `select()`, in call order. */
    selects: [] as { table: string; lock?: string }[],
    /** Every write issued: `update <table>` or `delete <table>`, in call order. */
    writes: [] as string[],
    /** Columns of every `update().set()` call. */
    updates: [] as Record<string, unknown>[],
  },
}));

function selectBuilder() {
  const rows = state.selectResults.shift() ?? [];
  const query: (typeof state.selects)[number] = { table: "" };
  state.selects.push(query);
  const builder = {
    from(table: Table) {
      query.table = getTableName(table);
      return builder;
    },
    where: () => builder,
    for(lock: string) {
      query.lock = lock;
      return builder;
    },
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
              returning: () => Promise.resolve([{ ...DONE_ENTRY, ...columns }]),
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

import { ReopenAnimalUseCase } from "../ReopenAnimal.useCase";

const SESSION_ROW = {
  id: "s-1",
  farmId: 7,
  date: "2026-09-01",
  status: "open",
  kind: "insemination",
  weighing: false,
  semenBullIds: ["bull-1"],
};

const DONE_ENTRY = {
  sessionId: "s-1",
  animalId: "a-1",
  position: 0,
  outcome: "done",
  weightKg: null,
  notes: "cio fraco",
  amountBrl: null,
  previousLotId: null,
  createdAnimal: false,
  treatmentId: null,
  boosterId: null,
  weighingId: null,
  breedingId: "br-1",
};

/** lockEntry's three reads: the session, the animal, its chute entry. */
const passRows = () => [[SESSION_ROW], [{ id: "a-1", earTag: "V-01", lotId: "lot-1" }], [DONE_ENTRY]];

/** The cobertura the pass recorded, as its row lock returns it. */
const lockedBreeding = [{ id: "br-1" }];

beforeEach(() => {
  state.selectResults = [];
  state.selects = [];
  state.writes = [];
  state.updates = [];
});

describe("reopenAnimal — inseminação", () => {
  it("refuses the undo and writes nothing when the cobertura has a diagnosis", async () => {
    state.selectResults = [...passRows(), lockedBreeding, [{ breedingId: "br-1", result: "open" }]];

    const result = await new ReopenAnimalUseCase().run({
      farmId: 7,
      sessionId: "s-1",
      animalId: "a-1",
    });

    expect(result).toEqual({ conflict: "has_diagnosis", breedingId: "br-1" });
    expect(state.writes).toEqual([]);
  });

  it("locks the cobertura before it reads the diagnosis", async () => {
    state.selectResults = [...passRows(), lockedBreeding, []];

    await new ReopenAnimalUseCase().run({ farmId: 7, sessionId: "s-1", animalId: "a-1" });

    // A diagnosis written meanwhile waits for the undo, then fails its foreign
    // key, instead of going down silently with the cobertura.
    expect(state.selects.slice(3)).toEqual([
      { table: "breedings", lock: "update" },
      { table: "pregnancy_diagnoses", lock: "update" },
    ]);
  });

  it("clears the entry's ref, then deletes the cobertura", async () => {
    state.selectResults = [...passRows(), lockedBreeding, []];

    const result = await new ReopenAnimalUseCase().run({
      farmId: 7,
      sessionId: "s-1",
      animalId: "a-1",
    });

    expect(state.writes).toEqual(["update manejo_session_animals", "delete breedings"]);
    expect(state.updates[0]).toMatchObject({ outcome: "pending", breedingId: null });
    expect(result).toMatchObject({
      entry: { earTag: "V-01", outcome: "pending" },
      removedTreatmentIds: [],
      removedBreedingId: "br-1",
    });
    expect(result).not.toHaveProperty("entry.breedingId", "br-1");
  });

  it("does not count an exam recorded as pending as a diagnosis", async () => {
    state.selectResults = [...passRows(), lockedBreeding, [{ breedingId: "br-1", result: "pending" }]];

    const result = await new ReopenAnimalUseCase().run({
      farmId: 7,
      sessionId: "s-1",
      animalId: "a-1",
    });

    expect(state.writes).toEqual(["update manejo_session_animals", "delete breedings"]);
    expect(result).toMatchObject({ removedBreedingId: "br-1" });
  });
});
