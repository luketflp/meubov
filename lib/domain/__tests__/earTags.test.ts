import { describe, expect, it } from "vitest";
import { compareEarTags, normalizeEarTag } from "@/lib/domain/earTags";

describe("normalizeEarTag", () => {
  it("removes surrounding whitespace without changing the identifier", () => {
    expect(normalizeEarTag("  BOV-042 \n")).toBe("BOV-042");
  });

  it("preserves case and internal spaces", () => {
    expect(normalizeEarTag("Ab 12")).toBe("Ab 12");
  });
});

describe("compareEarTags", () => {
  it("sorts the numbers in a tag by value, the way a farmer reads them", () => {
    expect(["B-10", "B-9", "B-100", "A-2"].sort(compareEarTags)).toEqual([
      "A-2",
      "B-9",
      "B-10",
      "B-100",
    ]);
  });

  it("ignores case and accents", () => {
    expect(compareEarTags("b-01", "B-01")).toBe(0);
    expect(compareEarTags("Açu-1", "acu-1")).toBe(0);
  });
});
