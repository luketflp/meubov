/**
 * seedDefaultAccounts ("Sugerir contas padrão"): finds each default's grupo by
 * name among the farm's active grupos, ignoring case, and creates the contas
 * that grupo does not have yet, comparing names regardless of case. A default
 * whose grupo is gone (renamed, archived, deleted) is skipped.
 *
 * Same chainable db stub as the other use-case tests: selects answer from a
 * queued list of rows (the grupos, then the contas) and record their
 * condition, inserts record the rows and echo them.
 */
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** Rows each `select()` resolves to, in call order. */
    selectResults: [] as Record<string, unknown>[][],
    /** Condition of every `select().where()` call. */
    wheres: [] as unknown[],
    /** Rows of every `insert().values()` call. */
    inserts: [] as Record<string, unknown>[][],
  },
}));

function selectBuilder() {
  const rows = state.selectResults.shift() ?? [];
  const builder = {
    from: () => builder,
    where: (condition: unknown) => {
      state.wheres.push(condition);
      return builder;
    },
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
import { DEFAULT_GROUPS } from "@/lib/domain/groups";

import { SeedDefaultAccountsUseCase } from "../SeedDefaults.useCase";

/** The farm's eleven starting grupos, as the select reads them: id "g-<name>". */
const GROUPS = DEFAULT_GROUPS.map(({ name }) => ({ id: `g-${name}`, name }));
const seed = () => new SeedDefaultAccountsUseCase().run({ farmId: 7 });
const created = () => state.inserts[0].map((row) => `${row.group}:${row.name}`);

beforeEach(() => {
  state.selectResults = [];
  state.wheres = [];
  state.inserts = [];
});

describe("seedDefaultAccounts", () => {
  it("creates every default in its grupo, read among the farm's active grupos", async () => {
    state.selectResults = [GROUPS, []];

    const result = await seed();

    expect(created()).toHaveLength(DEFAULT_ACCOUNTS.length);
    expect(created()).toContain("g-Nutrição:Sal mineral");
    expect(created()).toContain("g-Receitas:Aluguel de pasto");
    expect(created()).toContain("g-Sócios:Distribuição de lucro");
    expect(state.inserts[0].every((row) => row.farmId === 7)).toBe(true);
    expect(result.created).toHaveLength(DEFAULT_ACCOUNTS.length);
    const grupos = new PgDialect().sqlToQuery(state.wheres[0] as SQL);
    expect(grupos.sql).toContain('"plan_groups"."farm_id" = $1');
    expect(grupos.sql).toContain('"plan_groups"."archived_at" is null');
    expect(grupos.params).toEqual([7]);
  });

  it("skips the names the grupo already has, case-insensitively", async () => {
    state.selectResults = [
      GROUPS,
      [
        { group: "g-Nutrição", name: "SAL MINERAL" },
        { group: "g-Receitas", name: "aluguel de pasto" },
        // Same name in another grupo does not count.
        { group: "g-Administrativo", name: "Sêmen" },
      ],
    ];

    const result = await seed();

    expect(created()).not.toContain("g-Nutrição:Sal mineral");
    expect(created()).not.toContain("g-Receitas:Aluguel de pasto");
    expect(created()).toContain("g-Reprodução:Sêmen");
    expect(result.created).toHaveLength(DEFAULT_ACCOUNTS.length - 2);
  });

  it("finds a grupo whatever its case, and skips the defaults of a renamed or missing grupo", async () => {
    // "Nutrição" became "Alimentação", "Pastagem" is in capitals, and "Sócios" is gone
    // (deleted, or archived: the select leaves it out).
    const groups = GROUPS.filter((g) => g.name !== "Sócios").map((g) =>
      g.name === "Nutrição" ? { ...g, name: "Alimentação" } : g.name === "Pastagem" ? { ...g, name: "PASTAGEM" } : g
    );
    state.selectResults = [groups, []];

    await seed();

    const nutricao = DEFAULT_ACCOUNTS.filter((d) => d.group === "Nutrição").length;
    const socios = DEFAULT_ACCOUNTS.filter((d) => d.group === "Sócios").length;
    expect(created()).toHaveLength(DEFAULT_ACCOUNTS.length - nutricao - socios);
    expect(created().some((row) => row.startsWith("g-Nutrição:"))).toBe(false);
    expect(created()).toContain("g-Pastagem:Adubo");
  });

  it("creates nothing the second time", async () => {
    state.selectResults = [GROUPS, []];
    await seed();
    const first = state.inserts[0];

    state.inserts = [];
    state.selectResults = [GROUPS, first];
    const result = await seed();

    expect(state.inserts).toEqual([]);
    expect(result).toEqual({ created: [] });
  });
});
