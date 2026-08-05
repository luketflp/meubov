import { describe, expect, it } from "vitest";
import { normalizeEarTag } from "@/lib/domain/earTags";

describe("normalizeEarTag", () => {
  it("removes surrounding whitespace without changing the identifier", () => {
    expect(normalizeEarTag("  BOV-042 \n")).toBe("BOV-042");
  });

  it("preserves case and internal spaces", () => {
    expect(normalizeEarTag("Ab 12")).toBe("Ab 12");
  });
});
