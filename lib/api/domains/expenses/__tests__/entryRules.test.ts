/**
 * normaliseEntry: every lançamento but a rendimento names a grupo of this
 * farm of its own kind, and a conta sent sits in that grupo. A rendimento
 * stores no grupo whatever it sends.
 *
 * The shared chainable db stub, passed as the repository: selects answer from
 * the queue (the grupo, then the conta do plano) and record their condition.
 */
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createDbStub, renderSql } from "@/lib/api/__tests__/dbStub";
import type { RepositoryType } from "@/lib/api/@types/repoTypes";

import { normaliseEntry, type EntryInput } from "../entryRules";

const state = {
  selectResults: [] as unknown[][],
  updates: [] as Record<string, unknown>[],
  inserts: [] as unknown[],
  deletes: 0,
  returning: [] as unknown[][],
  wheres: [] as unknown[],
};
const repo = createDbStub(state) as unknown as RepositoryType;

/** A plan_groups row of farm 7 as farmGroup reads it. */
const grupo = (id: string, kind: string, archivedAt: Date | null = null) => ({
  id,
  farmId: 7,
  kind,
  name: id,
  archivedAt,
  createdAt: new Date(0),
});

const RECEITA: EntryInput = { kind: "revenue", date: "2026-09-10", category: "grp-receitas" };
const normalise = (entry: Partial<EntryInput>) => normaliseEntry(repo, 7, { ...RECEITA, ...entry });

beforeEach(() => {
  state.selectResults = [];
  state.wheres = [];
});

describe("normaliseEntry — grupo", () => {
  it("stores the grupo a receita sends, read on this farm, with a conta of that grupo", async () => {
    state.selectResults = [[grupo("grp-receitas", "revenue")], [{ group: "grp-receitas" }]];

    expect(await normalise({ accountId: "acc-aluguel" })).toEqual({
      kind: "revenue",
      flow: null,
      category: "grp-receitas",
      dueDate: null,
      paidAt: null,
      accountId: "acc-aluguel",
      lotId: null,
    });
    // The grupo is read on this farm (farmGroup).
    const { sql, params } = renderSql(state.wheres[0] as SQL);
    expect(sql).toContain('"plan_groups"."farm_id"');
    expect(params).toEqual(expect.arrayContaining([7, "grp-receitas"]));
  });

  it("refuses a receita or a capital lançamento sent without grupo, before reading anything", async () => {
    expect(await normalise({ category: undefined })).toBe("invalid_category");
    expect(await normalise({ kind: "financing", category: undefined, accountId: "acc-pronaf" })).toBe(
      "invalid_category"
    );
    expect(state.wheres).toEqual([]);
  });

  it("refuses a grupo of another kind, another farm's grupo and an unknown id", async () => {
    // A despesa grupo sent with a receita.
    state.selectResults = [[grupo("grp-nutricao", "expense")]];
    expect(await normalise({ category: "grp-nutricao" })).toBe("invalid_category");
    // A receita grupo sent with an investimento.
    state.selectResults = [[grupo("grp-receitas", "revenue")]];
    expect(await normalise({ kind: "investment", accountId: "acc-benf" })).toBe("invalid_category");
    // The farm filter finds no grupo by that id; the conta queued after it is never read.
    state.selectResults = [[], [{ group: "grp-x" }]];
    expect(await normalise({ category: "grp-of-another-farm", accountId: "acc-1" })).toBe("invalid_category");
    expect(state.selectResults).toEqual([[{ group: "grp-x" }]]);
    state.selectResults = [[]];
    expect(await normalise({ category: "nutrition" })).toBe("invalid_category");
  });

  it("refuses a conta of another grupo or another farm", async () => {
    state.selectResults = [[grupo("grp-receitas", "revenue")], [{ group: "grp-nutricao" }]];
    expect(await normalise({ accountId: "acc-sal" })).toBe("invalid_account");
    state.selectResults = [[grupo("grp-receitas", "revenue")], []];
    expect(await normalise({ accountId: "acc-of-another-farm" })).toBe("invalid_account");
  });

  it("saves a lançamento in an archived grupo: archiving only takes the grupo out of the forms", async () => {
    state.selectResults = [[grupo("grp-arrend", "expense", new Date("2026-08-01T00:00:00Z"))]];

    expect(await normalise({ kind: "expense", category: "grp-arrend", lotId: "lot-1" })).toMatchObject({
      kind: "expense",
      category: "grp-arrend",
      lotId: "lot-1",
    });
  });
});

describe("normaliseEntry — fora do resultado", () => {
  it("stores a capital lançamento in its grupo, a saída when no movimento is sent, without lote", async () => {
    state.selectResults = [[grupo("grp-socios", "partners")], [{ group: "grp-socios" }]];

    const retirada = { kind: "partners" as const, category: "grp-socios", accountId: "acc-retiradas", lotId: "lot-1" };
    expect(await normalise(retirada)).toMatchObject({
      kind: "partners",
      flow: "out",
      category: "grp-socios",
      accountId: "acc-retiradas",
      lotId: null,
    });
  });

  it("still asks a conta of a capital lançamento", async () => {
    state.selectResults = [[grupo("grp-financiamentos", "financing")]];
    expect(await normalise({ kind: "financing", category: "grp-financiamentos" })).toBe("invalid_account");
  });

  it("stores a rendimento without grupo, whatever it sends, and reads nothing", async () => {
    expect(await normalise({ kind: "yield", category: "grp-receitas", bankAccountId: "cdb" })).toMatchObject({
      kind: "yield",
      category: null,
      accountId: null,
      paidAt: "2026-09-10",
    });
    expect(await normalise({ kind: "yield", category: undefined, bankAccountId: "cdb" })).toMatchObject({
      category: null,
    });
    expect(state.wheres).toEqual([]);
  });
});
