/**
 * closeSession: a venda closes only once every dúvida is decided — sent to the
 * boiada or to the refugo. Every other kind, and a venda with no open dúvida,
 * close as before. It runs in one transaction that first locks the session
 * row, so a dúvida set meanwhile (which locks the same row) cannot slip past
 * the held check.
 */
import { getTableName, type Table } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** Rows each `select()` resolves to, in call order. */
    selectResults: [] as Record<string, unknown>[][],
    /** Every write issued: `update <table>`, in call order. */
    writes: [] as string[],
    /** Every query in call order: `select <table> [lock]` or `update <table>`. */
    log: [] as string[],
  },
}));

function selectBuilder() {
  const rows = state.selectResults.shift() ?? [];
  const index = state.log.push("select") - 1;
  const builder = {
    from(table: Table) {
      state.log[index] = `select ${getTableName(table)}`;
      return builder;
    },
    innerJoin: () => builder,
    where: () => builder,
    for(lock: string) {
      state.log[index] += ` for ${lock}`;
      return builder;
    },
    limit: () => builder,
    then: (resolve: (value: Record<string, unknown>[]) => unknown) => resolve(rows),
  };
  return builder;
}

vi.mock("@/lib/db", () => {
  const handle = {
    select: selectBuilder,
    update: (table: Table) => {
      state.writes.push(`update ${getTableName(table)}`);
      state.log.push(`update ${getTableName(table)}`);
      const builder = {
        set: () => builder,
        where: () => builder,
        returning: () => Promise.resolve([{ id: "s-1" }]),
      };
      return builder;
    },
  };
  return {
    db: { transaction: (run: (tx: unknown) => unknown) => Promise.resolve(run(handle)) },
  };
});

import { CloseSessionUseCase } from "../Close.useCase";

beforeEach(() => {
  state.selectResults = [];
  state.writes = [];
  state.log = [];
});

const SESSION = [{ id: "s-1" }];

describe("closeSession", () => {
  it("refuses to close while a dúvida is still open", async () => {
    state.selectResults = [SESSION, [{ animalId: "a" }]];

    const result = await new CloseSessionUseCase().run({ farmId: 7, sessionId: "s-1" });

    expect(result).toEqual({ conflict: "held_pending" });
    expect(state.writes).toEqual([]);
  });

  it("closes once every dúvida is decided", async () => {
    state.selectResults = [SESSION, []];

    const result = await new CloseSessionUseCase().run({ farmId: 7, sessionId: "s-1" });

    expect(result).toBe(true);
  });

  it("locks the session before it reads the dúvidas, then closes it", async () => {
    state.selectResults = [SESSION, []];

    await new CloseSessionUseCase().run({ farmId: 7, sessionId: "s-1" });

    expect(state.log).toEqual([
      "select manejo_sessions for update",
      "select manejo_session_animals",
      "update manejo_sessions",
    ]);
  });

  it("answers false for a missing session without reading or writing more", async () => {
    state.selectResults = [[]];

    const result = await new CloseSessionUseCase().run({ farmId: 7, sessionId: "s-1" });

    expect(result).toBe(false);
    expect(state.log).toEqual(["select manejo_sessions for update"]);
  });
});
