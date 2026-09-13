/**
 * A discarded manejo takes no more writes: every lookup of the session a write
 * starts from filters out a session stamped with deleted_at, so it answers like
 * a missing one (404) instead of accepting a pass, a close or a rendimento.
 * The pass locks stay FOR UPDATE, which is what makes a delete wait for them.
 *
 * The db stub records each query's table, its WHERE rendered to SQL and its
 * row lock; every select answers with no rows, so each use case stops at the
 * session lookup.
 */
import { getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** Every query issued, in call order. */
    queries: [] as { kind: "select" | "update"; table?: string; where?: SQL; lock?: string }[],
  },
}));

function selectBuilder() {
  const query: (typeof state.queries)[number] = { kind: "select" };
  state.queries.push(query);
  const builder = {
    from(table: Table) {
      query.table = getTableName(table);
      return builder;
    },
    where(where: SQL) {
      query.where = where;
      return builder;
    },
    for(lock: string) {
      query.lock = lock;
      return builder;
    },
    limit: () => builder,
    then: (resolve: (value: unknown[]) => unknown) => resolve([]),
  };
  return builder;
}

function updateBuilder(table: Table) {
  const query: (typeof state.queries)[number] = { kind: "update", table: getTableName(table) };
  state.queries.push(query);
  const builder = {
    set: () => builder,
    where(where: SQL) {
      query.where = where;
      return builder;
    },
    returning: () => Promise.resolve([]),
  };
  return builder;
}

vi.mock("@/lib/db", () => {
  const handle = { select: selectBuilder, update: updateBuilder };
  return {
    db: { ...handle, transaction: (run: (tx: unknown) => unknown) => Promise.resolve(run(handle)) },
  };
});

import { CloseSessionUseCase } from "../Close.useCase";
import { CompleteAnimalUseCase } from "../CompleteAnimal.useCase";
import { RegisterEntryAnimalUseCase } from "../RegisterEntryAnimal.useCase";
import { ReopenAnimalUseCase } from "../ReopenAnimal.useCase";
import { SetCarcassYieldUseCase } from "../SetCarcassYield.useCase";
import { SkipAnimalUseCase } from "../SkipAnimal.useCase";

const dialect = new PgDialect();
const sqlOf = (where: SQL | undefined) => (where ? dialect.sqlToQuery(where).sql : "");

const NOT_DISCARDED = '"manejo_sessions"."deleted_at" is null';

/** The first query of the use case: the session it starts from. */
const sessionLookup = () => {
  const [first] = state.queries;
  expect(first.table).toBe("manejo_sessions");
  return first;
};

beforeEach(() => {
  state.queries = [];
});

const pass = { farmId: 7, sessionId: "s-1", animalId: "a-1" };

describe("a discarded manejo", () => {
  it.each([
    ["completing a pass", () => new CompleteAnimalUseCase().run({ ...pass, data: {} })],
    ["skipping an animal", () => new SkipAnimalUseCase().run({ ...pass, notes: undefined })],
    ["undoing a pass", () => new ReopenAnimalUseCase().run(pass)],
  ])("answers like a missing session when %s, under the session's row lock", async (_, run) => {
    expect(await run()).toBeNull();

    const lookup = sessionLookup();
    expect(sqlOf(lookup.where)).toContain(NOT_DISCARDED);
    expect(lookup.lock).toBe("update");
  });

  it("answers like a missing session when registering an entrada animal", async () => {
    const result = await new RegisterEntryAnimalUseCase().run({
      farmId: 7,
      sessionId: "s-1",
      input: { earTag: "B-001", category: "calf", sex: "male", birthDate: "2026-01-01" } as never,
    });

    expect(result).toBeNull();
    expect(sqlOf(sessionLookup().where)).toContain(NOT_DISCARDED);
  });

  it("answers like a missing session when setting the rendimento", async () => {
    const result = await new SetCarcassYieldUseCase().run({
      farmId: 7,
      sessionId: "s-1",
      carcassYieldPct: 52,
    });

    expect(result).toBeNull();
    expect(sqlOf(sessionLookup().where)).toContain(NOT_DISCARDED);
  });

  it("cannot be closed", async () => {
    expect(await new CloseSessionUseCase().run({ farmId: 7, sessionId: "s-1" })).toBe(false);

    const lookup = sessionLookup();
    expect(lookup.kind).toBe("update");
    expect(sqlOf(lookup.where)).toContain(NOT_DISCARDED);
  });
});
