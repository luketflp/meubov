/** leaveFarm: any member but the Dono walks out. */
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

import { LeaveFarmUseCase } from "../Leave.useCase";

beforeEach(() => {
  state.deletes = 0;
});

describe("leaveFarm", () => {
  it("refuses the Dono", async () => {
    const result = await new LeaveFarmUseCase().run({ farmId: 7, userId: "u-owner", role: "owner" });
    expect(result).toBe("owner_cannot_leave");
    expect(state.deletes).toBe(0);
  });

  it("deletes a member's own membership", async () => {
    const result = await new LeaveFarmUseCase().run({ farmId: 7, userId: "u-joao", role: "member" });
    expect(result).toBe("left");
    expect(state.deletes).toBe(1);
  });
});
