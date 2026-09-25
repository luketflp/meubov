import { describe, expect, it } from "vitest";
import {
  annualise,
  defaultPeriod,
  inPeriod,
  periodDays,
  periodFromSearch,
  periodSearch,
  priorPeriod,
  shiftPeriodByMonths,
  type Period,
} from "@/lib/domain/period";

const TODAY = "2026-09-24";
const LAST_12_MONTHS: Period = { start: "2025-10-01", end: "2026-09-30" };

describe("defaultPeriod", () => {
  it("covers the last 12 calendar months ending at the reference month", () => {
    expect(defaultPeriod(TODAY)).toEqual(LAST_12_MONTHS);
  });

  it("ends on 29 February in a leap year", () => {
    expect(defaultPeriod("2024-02-10", 1)).toEqual({ start: "2024-02-01", end: "2024-02-29" });
  });

  it("starts on the first day of the earliest month", () => {
    expect(defaultPeriod("2026-03-31", 3)).toEqual({ start: "2026-01-01", end: "2026-03-31" });
  });
});

describe("shiftPeriodByMonths", () => {
  it("moves both ends back by a year", () => {
    expect(shiftPeriodByMonths(LAST_12_MONTHS, -12)).toEqual({
      start: "2024-10-01",
      end: "2025-09-30",
    });
  });

  it("keeps the day, rolling a missing month-end into the next month", () => {
    expect(shiftPeriodByMonths({ start: "2024-01-31", end: "2024-02-29" }, 1)).toEqual({
      start: "2024-03-02",
      end: "2024-03-29",
    });
  });
});

describe("periodDays", () => {
  it("counts both ends", () => {
    expect(periodDays({ start: TODAY, end: TODAY })).toBe(1);
    expect(periodDays({ start: "2024-02-01", end: "2024-02-29" })).toBe(29);
    expect(periodDays({ start: "2026-02-01", end: "2026-02-28" })).toBe(28);
    expect(periodDays({ start: "2024-01-01", end: "2024-12-31" })).toBe(366);
  });

  it("never goes below one day", () => {
    expect(periodDays({ start: "2026-09-24", end: "2026-09-01" })).toBe(1);
  });
});

describe("priorPeriod", () => {
  it("is the year before for a 12-month window", () => {
    expect(priorPeriod(LAST_12_MONTHS)).toEqual({ start: "2024-10-01", end: "2025-09-30" });
  });

  it("goes back by day count, not by calendar", () => {
    expect(priorPeriod({ start: "2024-01-01", end: "2024-12-31" })).toEqual({
      start: "2022-12-31",
      end: "2023-12-31",
    });
    expect(priorPeriod({ start: "2024-02-01", end: "2024-02-29" })).toEqual({
      start: "2024-01-03",
      end: "2024-01-31",
    });
  });

  it("is the day before for a one-day window", () => {
    expect(priorPeriod({ start: "2026-03-01", end: "2026-03-01" })).toEqual({
      start: "2026-02-28",
      end: "2026-02-28",
    });
  });
});

describe("annualise", () => {
  it("scales by 365 over the window's days", () => {
    expect(annualise(30, { start: "2026-01-01", end: "2026-12-31" })).toBe(30);
    expect(annualise(30, { start: "2026-01-01", end: "2026-03-14" })).toBe(150);
    expect(annualise(30, { start: "2024-01-01", end: "2024-12-31" })).toBeCloseTo((30 * 365) / 366);
  });
});

describe("inPeriod", () => {
  it("includes both ends", () => {
    const period = { start: "2026-07-01", end: "2026-09-30" };
    expect(inPeriod("2026-07-01", period)).toBe(true);
    expect(inPeriod("2026-09-30", period)).toBe(true);
    expect(inPeriod("2026-06-30", period)).toBe(false);
    expect(inPeriod("2026-10-01", period)).toBe(false);
  });
});

describe("periodFromSearch", () => {
  const read = (query: string) => periodFromSearch(new URLSearchParams(query), TODAY);

  it("reads de and ate", () => {
    expect(read("de=2026-01-01&ate=2026-06-30")).toEqual({ start: "2026-01-01", end: "2026-06-30" });
    expect(read("de=2024-02-29&ate=2024-02-29")).toEqual({ start: "2024-02-29", end: "2024-02-29" });
  });

  it("falls back to the last 12 months on anything invalid", () => {
    for (const query of [
      "",
      "de=2026-01-01",
      "ate=2026-06-30",
      "de=2026-02-30&ate=2026-06-30",
      "de=2026-13-01&ate=2026-06-30",
      "de=2026-1-1&ate=2026-06-30",
      "de=2026-01-01&ate=junho",
      "de=2025-02-29&ate=2025-06-30",
      "de=2026-07-01&ate=2026-06-30",
    ]) {
      expect(read(query)).toEqual(LAST_12_MONTHS);
    }
  });
});

describe("periodSearch", () => {
  it("writes the query periodFromSearch reads back", () => {
    const period = { start: "2026-01-01", end: "2026-06-30" };
    expect(periodSearch(period)).toBe("de=2026-01-01&ate=2026-06-30");
    expect(periodFromSearch(new URLSearchParams(periodSearch(period)), TODAY)).toEqual(period);
  });
});
