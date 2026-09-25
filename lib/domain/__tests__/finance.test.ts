import { describe, expect, it } from "vitest";
import { filterMonthlyByPeriod, herdValue, periodResult } from "@/lib/domain/finance";

describe("herdValue", () => {
  it("multiplies arrobas by the price", () => {
    expect(herdValue(100, 240)).toBe(24000);
  });
});

describe("periodResult", () => {
  it("consolidates revenues, costs and net margin", () => {
    const r = periodResult([1000, 500], [300, 200]);
    expect(r.totalRevenue).toBe(1500);
    expect(r.totalCost).toBe(500);
    expect(r.result).toBe(1000);
    expect(r.netMarginPct).toBeCloseTo(66.6667, 3);
  });

  it("returns margin 0 without revenue", () => {
    expect(periodResult([], [100]).netMarginPct).toBe(0);
  });
});

describe("filterMonthlyByPeriod", () => {
  it("keeps the entries inside the window, both ends inclusive", () => {
    const series = [{ date: "2026-01-01" }, { date: "2026-02-01" }, { date: "2026-03-01" }];
    expect(filterMonthlyByPeriod(series, { start: "2026-01-01", end: "2026-02-01" })).toEqual([
      { date: "2026-01-01" },
      { date: "2026-02-01" },
    ]);
  });
});
