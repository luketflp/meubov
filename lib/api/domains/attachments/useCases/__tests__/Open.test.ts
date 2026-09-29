/** Streaming an anexo: only one of the caller's farm, looked up by farm and id. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    selectResults: [] as unknown[][],
    updates: [] as Record<string, unknown>[],
    inserts: [] as unknown[],
    deletes: 0,
    returning: [] as unknown[][],
    wheres: [] as unknown[],
  },
}));

vi.mock("@/lib/db", async () => ({
  db: (await import("@/lib/api/__tests__/dbStub")).createDbStub(state),
}));

import type { SQL } from "drizzle-orm";
import { memoryBlobStore } from "@/lib/api/__tests__/memoryBlob";
import { renderSql } from "@/lib/api/__tests__/dbStub";

import { OpenAttachmentUseCase } from "../Open.useCase";

const PATH = "farms/8/expenses/e-1/00000000-0000-4000-8000-000000000001-nf.jpg";

beforeEach(() => {
  state.selectResults = [];
  state.wheres = [];
});

describe("openAttachment", () => {
  it("refuses another farm's anexo: the lookup is scoped to the caller's farm", async () => {
    // The anexo a-1 belongs to farm 8; the farm-scoped select finds nothing for farm 7.
    const blob = memoryBlobStore({ [PATH]: { size: 1000, contentType: "image/jpeg" } });
    state.selectResults = [[]];

    const result = await new OpenAttachmentUseCase(undefined, blob.store).run({ farmId: 7, id: "a-1" });

    expect(result).toBeNull();
    const where = renderSql(state.wheres[0] as SQL);
    expect(where.sql).toContain('"attachments"."farm_id" = $1');
    expect(where.params).toEqual([7, "a-1"]);
  });

  it("streams an anexo of the farm", async () => {
    const blob = memoryBlobStore({ [PATH]: { size: 1000, contentType: "image/jpeg" } });
    state.selectResults = [
      [{ id: "a-1", farmId: 8, pathname: PATH, fileName: "nf.jpg", contentType: "image/jpeg" }],
    ];

    const result = await new OpenAttachmentUseCase(undefined, blob.store).run({ farmId: 8, id: "a-1" });

    expect(result).toMatchObject({ fileName: "nf.jpg", contentType: "image/jpeg" });
  });

  it("says so when the environment has no Blob store", async () => {
    const blob = memoryBlobStore({}, false);
    expect(await new OpenAttachmentUseCase(undefined, blob.store).run({ farmId: 8, id: "a-1" })).toBe("disabled");
  });

  it("is null when the file is gone from the store", async () => {
    const blob = memoryBlobStore();
    state.selectResults = [
      [{ id: "a-1", farmId: 8, pathname: PATH, fileName: "nf.jpg", contentType: "image/jpeg" }],
    ];
    expect(await new OpenAttachmentUseCase(undefined, blob.store).run({ farmId: 8, id: "a-1" })).toBeNull();
  });
});
