/**
 * deleteAccount: only a conta no lançamento or recorrência points at is
 * deleted; a used one is archived instead.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    selectResults: [] as unknown[][],
    updates: [] as Record<string, unknown>[],
    inserts: [] as unknown[],
    deletes: 0,
    returning: [] as unknown[][],
  },
}));

vi.mock("@/lib/db", async () => ({
  db: (await import("@/lib/api/__tests__/dbStub")).createDbStub(state),
}));

import { DeleteAccountUseCase } from "../Delete.useCase";

const ROW = { id: "racao", farmId: 7, group: "grp-nutricao", name: "Ração", archivedAt: null };

beforeEach(() => {
  state.selectResults = [];
  state.deletes = 0;
});

describe("DeleteAccountUseCase", () => {
  it("is not_found off the farm", async () => {
    state.selectResults = [[]];
    expect(await new DeleteAccountUseCase().run({ farmId: 8, id: "racao" })).toBe("not_found");
    expect(state.deletes).toBe(0);
  });

  it("is in_use while a lançamento or recorrência points at it", async () => {
    state.selectResults = [[ROW], [{ used: true }]];
    expect(await new DeleteAccountUseCase().run({ farmId: 7, id: "racao" })).toBe("in_use");
    expect(state.deletes).toBe(0);
  });

  it("deletes an unused conta", async () => {
    state.selectResults = [[ROW], [{ used: false }]];
    expect(await new DeleteAccountUseCase().run({ farmId: 7, id: "racao" })).toBe("deleted");
    expect(state.deletes).toBe(1);
  });
});
