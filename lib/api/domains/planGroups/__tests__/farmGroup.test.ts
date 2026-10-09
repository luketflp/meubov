/**
 * farmGroup: the grupo of this farm by id, with its tipo, archived ones
 * included; null for another farm's grupo or an id that names nothing.
 *
 * The shared chainable db stub, passed as the repository: selects answer from
 * the queue and record their condition.
 */
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createDbStub, renderSql } from "@/lib/api/__tests__/dbStub";
import type { RepositoryType } from "@/lib/api/@types/repoTypes";

import { farmGroup } from "../farmGroup";

const state = {
  selectResults: [] as unknown[][],
  updates: [] as Record<string, unknown>[],
  inserts: [] as unknown[],
  deletes: 0,
  returning: [] as unknown[][],
  wheres: [] as unknown[],
};
const repo = createDbStub(state) as unknown as RepositoryType;

const RECEITAS = {
  id: "g-rec",
  farmId: 7,
  kind: "revenue",
  name: "Receitas",
  archivedAt: new Date("2026-10-05T12:00:00Z"),
  createdAt: new Date("2026-10-01T12:00:00Z"),
};

beforeEach(() => {
  state.selectResults = [];
  state.wheres = [];
});

describe("farmGroup", () => {
  it("answers the farm's grupo with its tipo, archived ones too", async () => {
    state.selectResults = [[RECEITAS]];

    expect(await farmGroup(repo, 7, "g-rec")).toEqual(RECEITAS);

    const { sql, params } = renderSql(state.wheres[0] as SQL);
    expect(sql).toContain('"plan_groups"."farm_id" = $1');
    expect(params).toEqual([7, "g-rec"]);
    // An old lançamento in an archived grupo still saves: no archived_at filter.
    expect(sql).not.toContain("archived_at");
  });

  it("answers null for another farm's grupo and for an old built-in key", async () => {
    // The farm filter finds no grupo by that id.
    for (const id of ["g-of-another-farm", "nutrition", "revenue"]) {
      state.selectResults = [[]];
      expect(await farmGroup(repo, 7, id)).toBeNull();
    }
  });
});
