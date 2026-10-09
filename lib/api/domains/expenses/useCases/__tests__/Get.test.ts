/**
 * getExpense: a lançamento as the load shows it — with its série's fields and
 * its anexos' count — so a PATCH answer never loses "2/3" or the clip.
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

import { GetExpenseUseCase } from "../Get.useCase";

const ROW = {
  id: "e-2",
  farmId: 7,
  kind: "expense",
  date: "2026-09-27",
  category: "grp-nutricao",
  amountBrl: 333.33,
  notes: null,
  dueDate: "2026-11-10",
  paidAt: null,
  counterparty: null,
  document: null,
  accountId: null,
  lotId: null,
  seriesId: "s-1",
  seriesIndex: 2,
};

beforeEach(() => {
  state.selectResults = [];
});

describe("getExpense", () => {
  it("carries the série and the anexos' count", async () => {
    state.selectResults = [[ROW], [{ id: "s-1", mode: "installments", count: 3 }], [{ total: 2 }]];
    expect(await new GetExpenseUseCase().run({ farmId: 7, id: "e-2" })).toMatchObject({
      id: "e-2",
      seriesIndex: 2,
      seriesCount: 3,
      attachmentCount: 2,
    });
  });

  it("is null for a lançamento not on the farm", async () => {
    state.selectResults = [[]];
    expect(await new GetExpenseUseCase().run({ farmId: 7, id: "x" })).toBeNull();
  });
});
