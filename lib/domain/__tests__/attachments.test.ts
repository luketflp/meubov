import { describe, expect, it } from "vitest";

import {
  attachmentContentType,
  attachmentPathname,
  fileCountLabel,
  fitWithin,
  formatBytes,
  isAttachmentType,
  parseAttachmentPathname,
} from "@/lib/domain/attachments";

describe("attachment pathnames", () => {
  it("builds the farm's folder with a safe name", () => {
    expect(attachmentPathname(7, "e-1", "u-1", "Nota Fiscal nº 4.812.pdf")).toBe(
      "farms/7/expenses/e-1/u-1-Nota-Fiscal-n-4.812.pdf"
    );
    expect(attachmentPathname(7, "e-1", "u-1", "ção")).toBe("farms/7/expenses/e-1/u-1-cao");
    expect(attachmentPathname(7, "e-1", "u-1", "///")).toBe("farms/7/expenses/e-1/u-1-anexo");
  });

  it("reads back the farm and lançamento, refusing anything else", () => {
    const id = "0b6f3c1e-8a2d-4f5b-9c7e-1d2a3b4c5d6e";
    const uuid = "9f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f";
    expect(parseAttachmentPathname(`farms/7/expenses/${uuid}/${id}-nf.pdf`)).toEqual({ farmId: 7, expenseId: uuid });
    expect(parseAttachmentPathname(attachmentPathname(7, "e-1", id, "Nota Fiscal nº 4.812.pdf"))).toEqual({
      farmId: 7,
      expenseId: "e-1",
    });
    expect(parseAttachmentPathname("farms/7/expenses/e-1/u-1-nf.pdf")).toBeNull();
    for (const name of ["nf?.pdf", "nf#1.pdf", "%2e%2e", "a/b.pdf", "x".repeat(81)]) {
      expect(parseAttachmentPathname(`farms/7/expenses/e-1/${id}-${name}`)).toBeNull();
    }
    expect(parseAttachmentPathname("farms/7/expenses/e-1/sub/u-1.pdf")).toBeNull();
    expect(parseAttachmentPathname("other/7/expenses/e-1/u-1.pdf")).toBeNull();
    expect(parseAttachmentPathname("farms/x/expenses/e-1/u-1.pdf")).toBeNull();
  });
});

describe("attachment types", () => {
  it("takes photos and PDF only", () => {
    expect(isAttachmentType("image/jpeg")).toBe(true);
    expect(isAttachmentType("application/pdf")).toBe(true);
    expect(isAttachmentType("image/svg+xml")).toBe(false);
    expect(isAttachmentType("text/html")).toBe(false);
  });

  it("types an untyped .heic", () => {
    expect(attachmentContentType("IMG_1.HEIC", "")).toBe("image/heic");
    expect(attachmentContentType("nf.pdf", "application/pdf")).toBe("application/pdf");
  });
});

describe("fitWithin", () => {
  it("scales the longest side down and never up", () => {
    expect(fitWithin(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
});

describe("labels", () => {
  it("formats sizes and counts", () => {
    expect(formatBytes(480 * 1024)).toBe("480 KB");
    expect(formatBytes(300)).toBe("1 KB");
    expect(formatBytes(1.25 * 1024 * 1024)).toBe("1,3 MB");
    expect(fileCountLabel(1)).toBe("1 arquivo");
    expect(fileCountLabel(2)).toBe("2 arquivos");
  });
});
