import { describe, expect, it } from "vitest";
import { isUniqueViolation } from "@/lib/api/dbErrors";

describe("isUniqueViolation", () => {
  it("recognizes a direct Postgres unique violation", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("recognizes a unique violation wrapped by the database driver", () => {
    expect(isUniqueViolation({ cause: { code: "23505" } })).toBe(true);
  });

  it("does not classify another database error as a duplicate", () => {
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
  });
});
