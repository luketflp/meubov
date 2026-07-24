import { describe, expect, it } from "vitest";
import { buildQuotePayload, parseIpeadataSeries } from "@/lib/data/ipeadata";

const row = (date: string, value: number | null) => ({
  VALDATA: `${date}T00:00:00-03:00`,
  VALVALOR: value,
});

describe("parseIpeadataSeries", () => {
  it("maps OData rows to ISO-dated quotes rounded to 2 decimals", () => {
    const series = parseIpeadataSeries({ value: [row("2026-05-01", 341.5627)] });
    expect(series).toEqual([{ date: "2026-05-01", value: 341.56 }]);
  });

  it("drops rows with null or missing values and tolerates junk shapes", () => {
    const series = parseIpeadataSeries({
      value: [row("2026-04-01", 347.9443), row("2026-05-01", null), 7, null, {}],
    });
    expect(series).toEqual([{ date: "2026-04-01", value: 347.94 }]);
    expect(parseIpeadataSeries(null)).toEqual([]);
    expect(parseIpeadataSeries({ nope: true })).toEqual([]);
    expect(parseIpeadataSeries("html error page")).toEqual([]);
  });
});

describe("buildQuotePayload", () => {
  const series = [
    { date: "2026-04-01", value: 347.94 },
    { date: "2026-05-01", value: 341.56 },
    { date: "2026-06-01", value: 339.84 },
  ];

  it("takes the latest point and derives the monthly change", () => {
    const payload = buildQuotePayload(series);
    expect(payload?.current).toEqual({ date: "2026-06-01", value: 339.84 });
    // (339.84 / 341.56 - 1) * 100 = -0.5035…% → rounded to 1 decimal.
    expect(payload?.changePct).toBe(-0.5);
  });

  it("caps the series at the requested number of months", () => {
    const payload = buildQuotePayload(series, 2);
    expect(payload?.series.map((p) => p.date)).toEqual(["2026-05-01", "2026-06-01"]);
  });

  it("returns null when fewer than 2 points (caller falls back to mock)", () => {
    expect(buildQuotePayload([])).toBeNull();
    expect(buildQuotePayload(series.slice(0, 1))).toBeNull();
  });
});
