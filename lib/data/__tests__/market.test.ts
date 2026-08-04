import { describe, expect, it } from "vitest";
import { mergeQuotePayload } from "@/lib/data/market";

const history = {
  source: "Ipeadata",
  series: [
    { date: "2026-04-01", value: 347.94 },
    { date: "2026-05-01", value: 341.56 },
    { date: "2026-06-01", value: 339.84 },
  ],
};

const scot = { quote: { date: "2026-07-31", value: 336 }, source: "Scot" };

describe("mergeQuotePayload", () => {
  it("merges current price with the history and derives the monthly change", () => {
    const payload = mergeQuotePayload(scot, history);
    expect(payload?.current).toEqual(scot.quote);
    expect(payload?.source).toBe("Scot");
    expect(payload?.seriesSource).toBe("Ipeadata");
    expect(payload?.series).toHaveLength(3);
    // vs the last point of a month strictly before July: 2026-06-01.
    expect(payload?.changePct).toBeCloseTo(((336 - 339.84) / 339.84) * 100, 1);
  });

  it("caps the series at the requested number of months", () => {
    const payload = mergeQuotePayload(scot, history, 2);
    expect(payload?.series.map((p) => p.date)).toEqual(["2026-05-01", "2026-06-01"]);
  });

  it("falls back to the last history point when the current price is missing", () => {
    const payload = mergeQuotePayload(null, history);
    expect(payload?.current).toEqual({ date: "2026-06-01", value: 339.84 });
    expect(payload?.source).toBe("Ipeadata");
    // change vs 2026-05-01 (strictly before June).
    expect(payload?.changePct).toBeCloseTo(((339.84 - 341.56) / 341.56) * 100, 1);
  });

  it("works snapshot-only when there is no history", () => {
    const payload = mergeQuotePayload(scot, null);
    expect(payload?.current).toEqual(scot.quote);
    expect(payload?.series).toEqual([]);
    expect(payload?.seriesSource).toBeNull();
    expect(payload?.changePct).toBeNull();
  });

  it("returns null when both sides are missing", () => {
    expect(mergeQuotePayload(null, null)).toBeNull();
    expect(mergeQuotePayload(null, { source: "x", series: [] })).toBeNull();
  });
});
