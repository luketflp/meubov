/** A client token is signed only for a file in this farm's folder of one of its lançamentos. */
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

import { memoryBlobStore } from "@/lib/api/__tests__/memoryBlob";

import { IssueUploadTokenUseCase } from "../IssueUploadToken.useCase";

beforeEach(() => {
  state.selectResults = [];
});

describe("issueUploadToken", () => {
  it("signs a token for the exact pathname", async () => {
    const blob = memoryBlobStore();
    state.selectResults = [[{ id: "e-1" }], [{ total: 0 }]];

    const result = await new IssueUploadTokenUseCase(undefined, blob.store).run({
      farmId: 7,
      pathname: "farms/7/expenses/e-1/00000000-0000-4000-8000-000000000001-nf.pdf",
    });

    expect(result).toEqual({ clientToken: "token:farms/7/expenses/e-1/00000000-0000-4000-8000-000000000001-nf.pdf" });
  });

  it("refuses another farm's folder", async () => {
    const blob = memoryBlobStore();
    const result = await new IssueUploadTokenUseCase(undefined, blob.store).run({
      farmId: 7,
      pathname: "farms/8/expenses/e-1/00000000-0000-4000-8000-000000000001-nf.pdf",
    });
    expect(result).toBe("bad_path");
    expect(blob.tokens).toEqual([]);
  });

  it("refuses a lançamento that is not on the farm", async () => {
    const blob = memoryBlobStore();
    state.selectResults = [[]];
    const result = await new IssueUploadTokenUseCase(undefined, blob.store).run({
      farmId: 7,
      pathname: "farms/7/expenses/e-9/00000000-0000-4000-8000-000000000001-nf.pdf",
    });
    expect(result).toBe("not_found");
    expect(blob.tokens).toEqual([]);
  });

  it("says so without a Blob store", async () => {
    const blob = memoryBlobStore({}, false);
    const result = await new IssueUploadTokenUseCase(undefined, blob.store).run({
      farmId: 7,
      pathname: "farms/7/expenses/e-1/00000000-0000-4000-8000-000000000001-nf.pdf",
    });
    expect(result).toBe("disabled");
  });
});
