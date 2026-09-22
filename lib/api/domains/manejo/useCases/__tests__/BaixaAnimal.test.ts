/**
 * baixaAnimal: a baixa given at the brete. In one transaction the animal leaves
 * the herd with its reason, date and words, and its pass is skipped with a note
 * naming the baixa — so the queue never holds an animal that is gone. Anything
 * that is not a pending pass of an open session, or an animal already out of
 * the herd, is refused before the first write.
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
    /** Every write issued: `update <table>`, in call order. */
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
        })
      ),
  },
}));

import { BaixaAnimalUseCase } from "../BaixaAnimal.useCase";

const SESSION_ROW = {
  id: "s-1",
  farmId: 7,
  date: "2026-09-01",
  status: "open",
  kind: "health",
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
  previousLotId: null,
  createdAnimal: false,
  treatmentId: null,
  boosterId: null,
  weighingId: null,
  breedingId: null,
};

const ANIMAL = { id: "a-1", earTag: "1244", lotId: "lot-1", active: true };

const BAIXA = { reason: "death" as const, date: "2026-09-01", notes: " quebrou a perna no brete " };

const run = () =>
  new BaixaAnimalUseCase().run({ farmId: 7, sessionId: "s-1", animalId: "a-1", input: BAIXA });

beforeEach(() => {
  state.selectResults = [];
  state.writes = [];
  state.updates = [];
});

describe("baixaAnimal", () => {
  it("takes the animal out of the herd, then skips its pass with the baixa as the note", async () => {
    state.selectResults = [[SESSION_ROW], [ANIMAL], [PENDING_ENTRY]];

    const result = await run();

    expect(state.writes).toEqual(["update animals", "update manejo_session_animals"]);
    expect(state.updates[0]).toEqual({
      active: false,
      inactiveReason: "death",
      inactiveDate: "2026-09-01",
      inactiveNotes: "quebrou a perna no brete",
    });
    expect(state.updates[1]).toEqual({
      outcome: "skipped",
      notes: "Baixa · Morte · quebrou a perna no brete",
    });
    expect(result).toEqual({
      entry: expect.objectContaining({
        earTag: "1244",
        outcome: "skipped",
        notes: "Baixa · Morte · quebrou a perna no brete",
      }),
      animal: {
        earTag: "1244",
        active: false,
        inactiveReason: "death",
        inactiveDate: "2026-09-01",
        inactiveNotes: "quebrou a perna no brete",
      },
    });
  });

  it("refuses a pass that already left the queue", async () => {
    state.selectResults = [[SESSION_ROW], [ANIMAL], [{ ...PENDING_ENTRY, outcome: "done" }]];

    expect(await run()).toEqual({ conflict: "entry_not_actionable" });
    expect(state.writes).toEqual([]);
  });

  it("refuses a closed session", async () => {
    state.selectResults = [[{ ...SESSION_ROW, status: "closed" }], [ANIMAL], [PENDING_ENTRY]];

    expect(await run()).toEqual({ conflict: "session_not_open" });
    expect(state.writes).toEqual([]);
  });

  it("refuses an animal that already had a baixa", async () => {
    state.selectResults = [[SESSION_ROW], [{ ...ANIMAL, active: false }], [PENDING_ENTRY]];

    expect(await run()).toEqual({ conflict: "animal_inactive" });
    expect(state.writes).toEqual([]);
  });

  it("answers null for an animal that is not in the session", async () => {
    state.selectResults = [[SESSION_ROW], [ANIMAL], []];

    expect(await run()).toBeNull();
    expect(state.writes).toEqual([]);
  });
});
