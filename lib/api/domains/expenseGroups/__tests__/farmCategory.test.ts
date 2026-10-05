/**
 * isFarmCategory: a built-in key passes without a query; any other key must
 * be the id of one of the farm's own grupos, archived ones included.
 *
 * The shared chainable db stub, passed as the repository: selects answer from
 * the queue and record their condition.
 */
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createDbStub, renderSql } from "@/lib/api/__tests__/dbStub";
import type { RepositoryType } from "@/lib/api/@types/repoTypes";

import { isFarmCategory } from "../farmCategory";

const state = {
  selectResults: [] as unknown[][],
  updates: [] as Record<string, unknown>[],
  inserts: [] as unknown[],
  deletes: 0,
  returning: [] as unknown[][],
  wheres: [] as unknown[],
};
const repo = createDbStub(state) as unknown as RepositoryType;

beforeEach(() => {
  state.selectResults = [];
  state.wheres = [];
});

describe("isFarmCategory", () => {
  it("takes the seven built-in keys without asking the database", async () => {
    for (const key of ["nutrition", "pasture", "labor", "health", "breeding", "admin", "other"]) {
      expect(await isFarmCategory(repo, 7, key)).toBe(true);
    }
    expect(state.wheres).toEqual([]);
  });

  it("takes one of the farm's own grupos, archived ones too", async () => {
    state.selectResults = [[{ id: "grp-maq" }]];

    expect(await isFarmCategory(repo, 7, "grp-maq")).toBe(true);

    const { sql, params } = renderSql(state.wheres[0] as SQL);
    expect(sql).toContain('"expense_groups"."farm_id" = $1');
    expect(params).toEqual([7, "grp-maq"]);
    // An old lançamento in an archived grupo still saves: no archived_at filter.
    expect(sql).not.toContain("archived_at");
  });

  it("refuses another farm's grupo, an unknown key and the grupos outside Despesas", async () => {
    // The farm filter finds no grupo by that id.
    for (const key of ["grp-of-another-farm", "fuel", "revenue", "investment", "expenses"]) {
      state.selectResults = [[]];
      expect(await isFarmCategory(repo, 7, key)).toBe(false);
    }
  });
});
