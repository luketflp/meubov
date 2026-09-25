/**
 * updateAccount: renames a conta (unique per farm and grupo regardless of
 * case) or archives and restores it.
 *
 * Same chainable db stub as the other use-case tests: selects answer from a
 * queued list of rows, updates record the columns set and answer from their own
 * queue.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** Rows each `select()` resolves to, in call order. */
    selectResults: [] as Record<string, unknown>[][],
    /** Rows each `update().returning()` resolves to, in call order. */
    updateResults: [] as Record<string, unknown>[][],
    /** Columns of every `update().set()` call. */
    updates: [] as Record<string, unknown>[],
  },
}));

function selectBuilder() {
  const rows = state.selectResults.shift() ?? [];
  const builder = {
    from: () => builder,
    where: () => builder,
    limit: () => builder,
    then: (resolve: (value: Record<string, unknown>[]) => unknown) => resolve(rows),
  };
  return builder;
}

function updateBuilder() {
  const builder = {
    set(columns: Record<string, unknown>) {
      state.updates.push(columns);
      return builder;
    },
    where: () => builder,
    returning: () => Promise.resolve(state.updateResults.shift() ?? []),
  };
  return builder;
}

vi.mock("@/lib/db", () => ({ db: { select: selectBuilder, update: updateBuilder } }));

import { UpdateAccountUseCase } from "../Update.useCase";

const ACCOUNT = { id: "acc-1", farmId: 7, group: "nutrition", name: "Sal mineral", archivedAt: null };

beforeEach(() => {
  state.selectResults = [];
  state.updateResults = [];
  state.updates = [];
});

describe("updateAccount", () => {
  it("archives a conta", async () => {
    state.selectResults = [[ACCOUNT]];
    state.updateResults = [[{ ...ACCOUNT, archivedAt: new Date("2026-09-24T12:00:00Z") }]];

    const result = await new UpdateAccountUseCase().run({
      farmId: 7,
      id: "acc-1",
      patch: { archived: true },
    });

    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].archivedAt).toBeInstanceOf(Date);
    expect(result).toMatchObject({ id: "acc-1", name: "Sal mineral" });
  });

  it("restores an archived conta", async () => {
    state.selectResults = [[{ ...ACCOUNT, archivedAt: new Date("2026-09-01T12:00:00Z") }]];
    state.updateResults = [[ACCOUNT]];

    await new UpdateAccountUseCase().run({ farmId: 7, id: "acc-1", patch: { archived: false } });

    expect(state.updates).toEqual([{ archivedAt: null }]);
  });

  it("renames, trimmed", async () => {
    state.selectResults = [[ACCOUNT], []];
    state.updateResults = [[{ ...ACCOUNT, name: "Sal proteinado" }]];

    const result = await new UpdateAccountUseCase().run({
      farmId: 7,
      id: "acc-1",
      patch: { name: " Sal proteinado " },
    });

    expect(state.updates).toEqual([{ name: "Sal proteinado" }]);
    expect(result).toMatchObject({ name: "Sal proteinado" });
  });

  it("answers duplicate when another conta of the grupo has the name", async () => {
    state.selectResults = [[ACCOUNT], [{ id: "acc-2" }]];

    const result = await new UpdateAccountUseCase().run({
      farmId: 7,
      id: "acc-1",
      patch: { name: "RAÇÃO E SUPLEMENTO" },
    });

    expect(result).toBe("duplicate");
    expect(state.updates).toEqual([]);
  });

  it("answers null for a conta of another farm", async () => {
    state.selectResults = [[]];

    const result = await new UpdateAccountUseCase().run({
      farmId: 8,
      id: "acc-1",
      patch: { archived: true },
    });

    expect(result).toBeNull();
    expect(state.updates).toEqual([]);
  });
});
