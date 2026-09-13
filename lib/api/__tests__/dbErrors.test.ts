import { describe, expect, it } from "vitest";
import { isForeignKeyViolation, isUniqueViolation } from "@/lib/api/dbErrors";

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

describe("isForeignKeyViolation", () => {
  it("recognizes a direct Postgres foreign-key violation", () => {
    expect(isForeignKeyViolation({ code: "23503" })).toBe(true);
  });

  it("recognizes a foreign-key violation wrapped by the database driver", () => {
    expect(isForeignKeyViolation({ cause: { code: "23503" } })).toBe(true);
  });

  it("does not classify another database error as a foreign-key violation", () => {
    expect(isForeignKeyViolation({ code: "23505" })).toBe(false);
    expect(isForeignKeyViolation(null)).toBe(false);
  });
});
