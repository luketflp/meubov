/**
 * Chainable Drizzle stub for use-case tests, the pattern Delete.test.ts
 * established, shared by the team and invite tests.
 *
 * Selects resolve, in call order, to the rows queued in `selectResults`.
 * `update().set()` and `insert().values()` record what they were given, and a
 * `returning()` after either resolves to the next entry of `returning`.
 * `insert(...).values(...)` also chains `.onConflictDoNothing()`, which
 * resolves to nothing and never touches `returning`.
 * `delete()` counts. `execute()` (an advisory lock) resolves to no rows.
 * `transaction(run)` runs `run` against the same handle.
 *
 * An `insert(...).values(...).returning()` rejects with the next entry of
 * `insertErrors` instead, when that queue is non-empty — for a test simulating
 * a unique-violation race a use case is expected to catch and retry.
 *
 * Every `.where(condition)` call — select, update or delete — pushes its raw
 * Drizzle SQL condition onto `state.wheres`, in call order, when that array is
 * present (it is optional so existing tests that never look at it need not
 * seed it). Render one with `renderSql` and assert on fragments of the SQL and
 * on the bound params, not the full query string, which shifts with column
 * order and formatting.
 *
 * Use from a test with a hoisted state:
 *   const { state } = vi.hoisted(() => ({ state: emptyDbState() }));
 *   vi.mock("@/lib/db", async () => ({ db: (await import("@/lib/api/__tests__/dbStub")).createDbStub(state) }));
 * `emptyDbState` cannot be imported inside vi.hoisted, so tests inline the
 * object literal it returns.
 */
import { PgDialect } from "drizzle-orm/pg-core";

import type { SQL } from "drizzle-orm";

export interface DbStubState {
  selectResults: unknown[][];
  updates: Record<string, unknown>[];
  inserts: unknown[];
  deletes: number;
  returning: unknown[][];
  insertErrors?: unknown[];
  /** Every `.where(...)` condition, select/update/delete, in call order. */
  wheres?: unknown[];
}

type Resolve = (value: unknown) => unknown;

function thenable<T extends object>(builder: T, value: () => unknown): T & { then: (resolve: Resolve) => unknown } {
  return Object.assign(builder, { then: (resolve: Resolve) => resolve(value()) });
}

/** Renders a Drizzle SQL condition to its Postgres text and bound params. */
export function renderSql(condition: SQL): { sql: string; params: unknown[] } {
  const { sql, params } = new PgDialect().sqlToQuery(condition);
  return { sql, params };
}

export function createDbStub(state: DbStubState) {
  const nextReturning = () => Promise.resolve(state.returning.shift() ?? []);
  const recordWhere = (condition: unknown) => state.wheres?.push(condition);

  const handle = {
    select: () => {
      const rows = state.selectResults.shift() ?? [];
      const builder: Record<string, (...args: unknown[]) => unknown> = {};
      for (const method of ["from", "innerJoin", "leftJoin", "orderBy", "limit", "for"]) {
        builder[method] = () => chain;
      }
      builder.where = (condition: unknown) => {
        recordWhere(condition);
        return chain;
      };
      const chain = thenable(builder, () => rows);
      return chain;
    },
    update: () => {
      const builder = {
        set(columns: Record<string, unknown>) {
          state.updates.push(columns);
          return chain;
        },
        where: (condition: unknown) => {
          recordWhere(condition);
          return chain;
        },
        returning: nextReturning,
      };
      const chain = thenable(builder, () => undefined);
      return chain;
    },
    insert: () => ({
      values(values: unknown) {
        state.inserts.push(values);
        const returning = () => {
          const error = state.insertErrors?.shift();
          return error !== undefined ? Promise.reject(error) : nextReturning();
        };
        const onConflictDoNothing = () => thenable({ returning }, () => undefined);
        return thenable({ returning, onConflictDoNothing }, () => undefined);
      },
    }),
    execute: () => Promise.resolve({ rows: [] }),
    delete: () => ({
      where: (condition: unknown) => {
        recordWhere(condition);
        state.deletes += 1;
        return thenable({ returning: nextReturning }, () => undefined);
      },
    }),
  };

  return {
    ...handle,
    transaction: (run: (tx: typeof handle) => unknown) => Promise.resolve(run(handle)),
  };
}
