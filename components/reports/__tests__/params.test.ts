import { describe, expect, it } from "vitest";
import { defaultPeriod, isIsoDate, parseDecimal, yearStart } from "@/components/reports/params";

describe("yearStart", () => {
  it("is 1 January of the date's year", () => {
    expect(yearStart("2026-09-22")).toBe("2026-01-01");
  });
});

describe("defaultPeriod", () => {
  it("covers the 365 days up to today", () => {
    expect(defaultPeriod("2026-09-22")).toEqual({ from: "2025-09-22", to: "2026-09-22" });
  });
});

describe("isIsoDate", () => {
  it("accepts YYYY-MM-DD only", () => {
    expect(isIsoDate("2026-09-22")).toBe(true);
    expect(isIsoDate("")).toBe(false);
    expect(isIsoDate("22/09/2026")).toBe(false);
  });
});

describe("parseDecimal", () => {
  it("reads the pt-BR way", () => {
    expect(parseDecimal("315,00")).toBe(315);
    expect(parseDecimal("1.234,5")).toBe(1234.5);
    expect(parseDecimal(" R$ 4.800 ")).toBe(4800);
  });

  it("reads a dot as the decimal mark when there is no comma", () => {
    expect(parseDecimal("315.5")).toBe(315.5);
  });

  it("is null for empty, negative or unreadable text", () => {
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("abc")).toBeNull();
    expect(parseDecimal("-3")).toBeNull();
  });
});
