/**
 * Registering an anexo the browser uploaded: the pathname must sit in this
 * farm's folder of this lançamento and the stored blob must be at most 5 MB of
 * an allowed type. Chainable db stub (lib/api/__tests__/dbStub.ts) and the
 * in-memory blob store.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    selectResults: [] as unknown[][],
    updates: [] as Record<string, unknown>[],
    inserts: [] as unknown[],
    deletes: 0,
    returning: [] as unknown[][],
    insertErrors: [] as unknown[],
  },
}));

vi.mock("@/lib/db", async () => ({
  db: (await import("@/lib/api/__tests__/dbStub")).createDbStub(state),
}));

import { memoryBlobStore } from "@/lib/api/__tests__/memoryBlob";
import { MAX_ATTACHMENT_BYTES } from "@/lib/domain/attachments";

import { RegisterAttachmentUseCase } from "../Register.useCase";

const PATH = "farms/7/expenses/e-1/00000000-0000-4000-8000-000000000001-nf.jpg";
const input = { farmId: 7, userId: "user-1", expenseId: "e-1", pathname: PATH, fileName: "nf.jpg" };

beforeEach(() => {
  state.selectResults = [];
  state.inserts = [];
  state.returning = [];
  state.insertErrors = [];
});

describe("registerAttachment", () => {
  it("records a photo that sits in the farm's folder", async () => {
    const blob = memoryBlobStore({ [PATH]: { size: 480_000, contentType: "image/jpeg" } });
    state.selectResults = [[{ id: "e-1" }], [{ total: 1 }]];
    state.returning = [
      [
        {
          id: "a-1",
          farmId: 7,
          expenseId: "e-1",
          pathname: PATH,
          fileName: "nf.jpg",
          contentType: "image/jpeg",
          sizeBytes: 480_000,
          createdAt: new Date("2026-09-28T12:00:00Z"),
          createdBy: "user-1",
        },
      ],
    ];

    const result = await new RegisterAttachmentUseCase(undefined, blob.store).run(input);

    expect(result).toMatchObject({ id: "a-1", expenseId: "e-1", sizeBytes: 480_000 });
    expect(state.inserts[0]).toMatchObject({ farmId: 7, pathname: PATH, sizeBytes: 480_000, createdBy: "user-1" });
  });

  it("refuses a pathname outside the farm's folder without touching the store", async () => {
    const other = "farms/8/expenses/e-1/00000000-0000-4000-8000-000000000001-nf.jpg";
    const blob = memoryBlobStore({ [other]: { size: 1000, contentType: "image/jpeg" } });

    const result = await new RegisterAttachmentUseCase(undefined, blob.store).run({ ...input, pathname: other });

    expect(result).toBe("bad_path");
    expect(state.inserts).toEqual([]);
    expect(blob.deleted).toEqual([]);
  });

  it("refuses a pathname of another lançamento", async () => {
    const blob = memoryBlobStore();
    const result = await new RegisterAttachmentUseCase(undefined, blob.store).run({
      ...input,
      pathname: "farms/7/expenses/e-2/00000000-0000-4000-8000-000000000001-nf.jpg",
    });
    expect(result).toBe("bad_path");
  });

  it("refuses and deletes a blob over 5 MB", async () => {
    const blob = memoryBlobStore({ [PATH]: { size: MAX_ATTACHMENT_BYTES + 1, contentType: "image/jpeg" } });
    state.selectResults = [[{ id: "e-1" }], [{ total: 0 }]];

    const result = await new RegisterAttachmentUseCase(undefined, blob.store).run(input);

    expect(result).toBe("too_large");
    expect(blob.deleted).toEqual([PATH]);
    expect(state.inserts).toEqual([]);
  });

  it("refuses and deletes a blob of another type", async () => {
    const blob = memoryBlobStore({ [PATH]: { size: 1000, contentType: "text/html" } });
    state.selectResults = [[{ id: "e-1" }], [{ total: 0 }]];

    expect(await new RegisterAttachmentUseCase(undefined, blob.store).run(input)).toBe("bad_type");
    expect(blob.deleted).toEqual([PATH]);
  });

  it("refuses the eleventh anexo", async () => {
    const blob = memoryBlobStore({ [PATH]: { size: 1000, contentType: "image/jpeg" } });
    state.selectResults = [[{ id: "e-1" }], [{ total: 10 }]];

    expect(await new RegisterAttachmentUseCase(undefined, blob.store).run(input)).toBe("too_many");
    expect(state.inserts).toEqual([]);
    expect(blob.deleted).toEqual([PATH]);
  });

  it("answers duplicate for a pathname registered already, keeping its blob", async () => {
    const blob = memoryBlobStore({ [PATH]: { size: 1000, contentType: "image/jpeg" } });
    state.selectResults = [[{ id: "e-1" }], [{ total: 1 }]];
    state.insertErrors = [{ code: "23505" }];

    expect(await new RegisterAttachmentUseCase(undefined, blob.store).run(input)).toBe("duplicate");
    expect(blob.deleted).toEqual([]);
  });

  it("refuses a lançamento that is not on the farm", async () => {
    const blob = memoryBlobStore({ [PATH]: { size: 1000, contentType: "image/jpeg" } });
    state.selectResults = [[]];

    expect(await new RegisterAttachmentUseCase(undefined, blob.store).run(input)).toBe("not_found");
    expect(blob.deleted).toEqual([PATH]);
  });

  it("says so when the environment has no Blob store", async () => {
    const blob = memoryBlobStore({}, false);
    expect(await new RegisterAttachmentUseCase(undefined, blob.store).run(input)).toBe("disabled");
  });
});
