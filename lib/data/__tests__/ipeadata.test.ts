import { describe, expect, it } from "vitest";
import { parseIpeadataSeries } from "@/lib/data/ipeadata";

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
