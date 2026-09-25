/**
 * seedDefaultAccounts ("Sugerir contas padrão"): creates the standard contas
 * the farm does not have yet, comparing names per grupo regardless of case.
 *
 * Same chainable db stub as the other use-case tests: selects answer from a
 * queued list of rows, inserts record the rows and echo them.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** Rows each `select()` resolves to, in call order. */
    selectResults: [] as Record<string, unknown>[][],
    /** Rows of every `insert().values()` call. */
    inserts: [] as Record<string, unknown>[][],
  },
}));

function selectBuilder() {
  const rows = state.selectResults.shift() ?? [];
  const builder = {
    from: () => builder,
    where: () => builder,
    then: (resolve: (value: Record<string, unknown>[]) => unknown) => resolve(rows),
  };
  return builder;
}

function insertBuilder() {
  return {
    values: (rows: Record<string, unknown>[]) => {
      state.inserts.push(rows);
      const echoed = rows.map((row) => ({ archivedAt: null, ...row }));
      const chain = {
        onConflictDoNothing: () => chain,
        returning: () => Promise.resolve(echoed),
      };
      return chain;
    },
  };
}

vi.mock("@/lib/db", () => ({ db: { select: selectBuilder, insert: insertBuilder } }));

import { DEFAULT_ACCOUNTS } from "@/lib/domain/accounts";

import { SeedDefaultAccountsUseCase } from "../SeedDefaults.useCase";

beforeEach(() => {
  state.selectResults = [];
  state.inserts = [];
});

describe("seedDefaultAccounts", () => {
  it("skips the names the farm already has, case-insensitively", async () => {
    state.selectResults = [
      [
        { group: "nutrition", name: "SAL MINERAL" },
        { group: "revenue", name: "aluguel de pasto" },
        // Same name in another grupo does not count.
        { group: "admin", name: "Sêmen" },
      ],
    ];

    const result = await new SeedDefaultAccountsUseCase().run({ farmId: 7 });

    expect(state.inserts).toHaveLength(1);
    const names = state.inserts[0].map((row) => `${row.group}:${row.name}`);
    expect(names).not.toContain("nutrition:Sal mineral");
    expect(names).not.toContain("revenue:Aluguel de pasto");
    expect(names).toContain("breeding:Sêmen");
    expect(names).toHaveLength(DEFAULT_ACCOUNTS.length - 2);
    expect(state.inserts[0].every((row) => row.farmId === 7)).toBe(true);
    expect(result.created).toHaveLength(DEFAULT_ACCOUNTS.length - 2);
  });

  it("writes nothing when every default exists", async () => {
    state.selectResults = [DEFAULT_ACCOUNTS.map(({ group, name }) => ({ group, name }))];

    const result = await new SeedDefaultAccountsUseCase().run({ farmId: 7 });

    expect(state.inserts).toEqual([]);
    expect(result).toEqual({ created: [] });
  });
});
