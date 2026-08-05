import { afterEach, describe, expect, it, vi } from "vitest";
import { isSuperuser } from "@/lib/auth/superuser";

describe("isSuperuser", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("matches an allowlisted e-mail", () => {
    vi.stubEnv("SUPERUSER_EMAILS", "admin@meubov.test");
    expect(isSuperuser("admin@meubov.test")).toBe(true);
  });

  it("matches inside a comma-separated list with spaces", () => {
    vi.stubEnv("SUPERUSER_EMAILS", "first@meubov.test , second@meubov.test");
    expect(isSuperuser("second@meubov.test")).toBe(true);
  });

  it("is case-insensitive", () => {
    vi.stubEnv("SUPERUSER_EMAILS", "Admin@MeuBov.test");
    expect(isSuperuser("admin@meubov.test")).toBe(true);
    expect(isSuperuser("ADMIN@meubov.TEST")).toBe(true);
  });

  it("rejects a non-listed e-mail", () => {
    vi.stubEnv("SUPERUSER_EMAILS", "admin@meubov.test");
    expect(isSuperuser("other@meubov.test")).toBe(false);
  });

  it("rejects everyone when the variable is empty", () => {
    vi.stubEnv("SUPERUSER_EMAILS", "");
    expect(isSuperuser("admin@meubov.test")).toBe(false);
  });

  it("rejects everyone when the variable is unset", () => {
    delete process.env.SUPERUSER_EMAILS;
    expect(isSuperuser("admin@meubov.test")).toBe(false);
  });

  it("does not treat an empty entry as a match", () => {
    vi.stubEnv("SUPERUSER_EMAILS", ",,admin@meubov.test,");
    expect(isSuperuser("")).toBe(false);
  });
});
